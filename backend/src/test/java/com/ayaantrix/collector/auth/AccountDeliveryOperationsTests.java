package com.ayaantrix.collector.auth;

import com.ayaantrix.collector.CollectorApplication;
import com.ayaantrix.collector.auth.delivery.*;
import com.ayaantrix.collector.auth.dto.*;
import com.ayaantrix.collector.auth.entity.*;
import com.ayaantrix.collector.auth.repository.*;
import com.ayaantrix.collector.auth.security.SecureAccountTokens;
import com.ayaantrix.collector.auth.service.*;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.web.RequestTraceFilter;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.system.*;
import org.springframework.context.annotation.*;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Testcontainers
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@ExtendWith(OutputCaptureExtension.class)
class AccountDeliveryOperationsTests {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse(
        "public.ecr.aws/docker/library/postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873")
        .asCompatibleSubstituteFor("postgres"));
    private static final String EMAIL="workflow@example.test",OLD="synthetic initial account password",NEW="synthetic replacement password";
    private final String key=Base64.getEncoder().encodeToString(new byte[32]); // isolated test fixture only
    private ConfigurableApplicationContext context;
    private MockMvc mvc;
    private JsonMapper json;
    private JdbcTemplate jdbc;
    private UserAccountRepository users;
    private AccountTokenRepository tokens;
    private VerificationDeliveryWorker worker;
    private AccountDeliveryOperations operations;
    private RegistrationService registration;
    private AccountRegistrationWorkflowTests.TestClock clock;
    private Mailbox sender;
    @org.springframework.boot.test.context.TestConfiguration(proxyBeanMethods=false)
    static class Configuration {
        @Bean @Primary AccountRegistrationWorkflowTests.TestClock operationsClock(){
            var clock=new AccountRegistrationWorkflowTests.TestClock();clock.now.set(Instant.parse("2026-10-26T15:00:00Z"));return clock;
        }
        @Bean @Primary Mailbox mailbox(){return new Mailbox();}
    }
    static class Mailbox extends AccountRegistrationWorkflowTests.FakeMail {
        volatile CountDownLatch delivered=new CountDownLatch(1);
        @Override public void send(Message message){super.send(message);delivered.countDown();}
        @Override void reset(){super.reset();delivered=new CountDownLatch(1);}
        @Override public String toString(){return "ControlledTestMailbox[redacted]";}
    }
    @BeforeAll void start(){open();}
    private void open(){
        context=new SpringApplicationBuilder(CollectorApplication.class,Configuration.class).profiles("test").run(
            "--server.port=0","--spring.datasource.url="+POSTGRES.getJdbcUrl(),
            "--spring.datasource.username="+POSTGRES.getUsername(),"--spring.datasource.password="+POSTGRES.getPassword(),
            "--collector.delivery.encryption-key="+key,"--collector.delivery.worker-enabled=false");
        json=context.getBean(JsonMapper.class);jdbc=context.getBean(JdbcTemplate.class);
        users=context.getBean(UserAccountRepository.class);tokens=context.getBean(AccountTokenRepository.class);
        registration=context.getBean(RegistrationService.class);worker=context.getBean(VerificationDeliveryWorker.class);
        operations=context.getBean(AccountDeliveryOperations.class);clock=context.getBean(AccountRegistrationWorkflowTests.TestClock.class);sender=context.getBean(Mailbox.class);
        mvc=MockMvcBuilders.webAppContextSetup((WebApplicationContext)context).apply(springSecurity())
            .addFilters(context.getBean(RequestTraceFilter.class)).build();
    }
    @AfterAll void close(){if(context!=null)context.close();}
    @BeforeEach void reset(){
        clock.now.set(Instant.parse("2026-10-26T15:00:00Z"));sender.reset();
        jdbc.update("delete from collector.outbox_jobs");jdbc.update("delete from collector.access_tokens");
        jdbc.update("delete from collector.users");jdbc.update("delete from collector.account_request_limits");
    }
    private void issue(){registration.register(new RegistrationRequest(EMAIL,"Synthetic User",OLD),"operations-test");}
    private UUID jobId(){return jdbc.queryForObject("select id from collector.outbox_jobs order by created_at,id limit 1",UUID.class);}
    private String state(){return jdbc.queryForObject("select state from collector.outbox_jobs where id=?",String.class,jobId());}
    private AccountDeliveryOperations.Job hold(){issue();sender.failure="UNKNOWN";assertThat(worker.dispatchOne()).isTrue();return operations.inspectHeld(1).getFirst();}
    private boolean resolve(AccountDeliveryOperations.Job job,AccountDeliveryOperations.Resolution resolution){return operations.reconcile(job.id(),job.updatedAt(),job.attempts(),resolution,"CASE-123");}
    private AccountDeliveryRunner runner(){return new AccountDeliveryRunner(worker,sender,context.getBean(TokenDeliveryCipher.class),2,100,2);}
    private MockHttpServletRequestBuilder postWithCsrf(String path,Object body) throws Exception {
        var csrf=mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isOk()).andReturn();
        return post(path).session((MockHttpSession)csrf.getRequest().getSession(false))
            .header("X-XSRF-TOKEN",json.readTree(csrf.getResponse().getContentAsString()).get("token").asText())
            .header("X-Request-ID","operations-test").contentType("application/json").content(json.writeValueAsString(body));
    }
    @Test void completeHttpAccountJourneyWithAutomatedControlledDelivery(CapturedOutput logs) throws Exception {
        assertThat(context.getBeansOfType(AccountDeliveryRunner.class)).isEmpty();
        mvc.perform(postWithCsrf("/api/v1/auth/register",Map.of("email","  WORKFLOW@EXAMPLE.TEST  ","displayName","Synthetic User","password",OLD)))
            .andExpect(status().isAccepted()).andExpect(jsonPath("$.message").isString());
        var runner=runner();runner.start();
        try{assertThat(sender.delivered.await(5,TimeUnit.SECONDS)).isTrue();}finally{runner.stop();}
        String verification=sender.messages.getFirst().actionLink().getFragment().substring(6);
        assertThat(sender.messages.getFirst().purpose()).isEqualTo(TokenPurpose.VERIFY_EMAIL);
        mvc.perform(postWithCsrf("/api/v1/auth/verify-email",Map.of("token",verification)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.verified").value(true));
        mvc.perform(postWithCsrf("/api/v1/auth/verify-email",Map.of("token",verification)))
            .andExpect(status().isGone()).andExpect(jsonPath("$.code").value("TOKEN_CONSUMED"));
        sender.reset();
        mvc.perform(postWithCsrf("/api/v1/auth/forgot-password",Map.of("email",EMAIL)))
            .andExpect(status().isAccepted()).andExpect(header().string("X-Request-ID","operations-test"));
        runner.start();try{assertThat(sender.delivered.await(5,TimeUnit.SECONDS)).isTrue();}finally{runner.stop();}
        String reset=sender.messages.getFirst().actionLink().getFragment().substring(6);
        assertThat(sender.messages.getFirst().purpose()).isEqualTo(TokenPurpose.RESET_PASSWORD);
        mvc.perform(postWithCsrf("/api/v1/auth/reset-password",Map.of("token",reset,"password",NEW)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.message").value("Your password has been reset."));
        var account=users.findByEmailNormalized(EMAIL).orElseThrow();var passwords=context.getBean(PasswordEncoder.class);
        assertThat(passwords.matches(OLD,account.getPasswordHash())).isFalse();assertThat(passwords.matches(NEW,account.getPasswordHash())).isTrue();
        assertThat(account.getState()).isEqualTo(AccountState.ACTIVE);assertThat(account.getVerifiedAt()).isNotNull();
        assertThat(jdbc.queryForObject("select count(*) from collector.outbox_jobs where encrypted_payload is not null",Long.class)).isZero();
        assertThat(logs.getAll()).doesNotContain(verification,reset,OLD,NEW,key);
    }
    @Test void inspectionIsBoundedRedactedAndContainsNoCapability(){
        var job=hold();assertThat(operations.inspectHeld(1)).hasSize(1);
        assertThat(job.state()).isEqualTo("FAILED");assertThat(job.outcome()).isEqualTo("DELIVERY_OUTCOME_UNKNOWN");
        assertThat(job.toString()).doesNotContain(EMAIL,"tokenId","encrypted_payload",key);
        assertThatThrownBy(()->operations.inspectHeld(0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->operations.inspectHeld(101)).isInstanceOf(IllegalArgumentException.class);
        assertThat(worker.dispatchOne()).isFalse();assertThat(sender.calls).isEqualTo(1);
    }
    @Test void confirmedSentErasesPayloadWithoutSendingAgain(){
        var job=hold();assertThat(resolve(job,AccountDeliveryOperations.Resolution.CONFIRMED_SENT)).isTrue();
        assertThat(state()).isEqualTo("SUCCEEDED");assertThat(worker.dispatchOne()).isFalse();assertThat(sender.calls).isEqualTo(1);
        assertThat(jdbc.queryForObject("select encrypted_payload is null from collector.outbox_jobs",Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("select payload_json->'reconciliation'->>'evidenceRef' from collector.outbox_jobs",String.class)).isEqualTo("CASE-123");
    }
    @Test void confirmedNotSentRequeuesOnlyWithExplicitEvidenceAndKeepsAttemptCount(){
        var job=hold();sender.failure=null;assertThat(resolve(job,AccountDeliveryOperations.Resolution.CONFIRMED_NOT_SENT)).isTrue();
        assertThat(state()).isEqualTo("QUEUED");assertThat(jdbc.queryForObject("select attempt_count from collector.outbox_jobs",Integer.class)).isEqualTo(1);
        assertThat(worker.dispatchOne()).isTrue();assertThat(sender.messages).hasSize(1);assertThat(state()).isEqualTo("SUCCEEDED");
        assertThat(resolve(job,AccountDeliveryOperations.Resolution.CONFIRMED_NOT_SENT)).isFalse();
    }
    @Test void unresolvedRemainsHeldAndAbandonClosesWithoutSending(){
        var job=hold();assertThat(worker.dispatchOne()).isFalse();assertThat(state()).isEqualTo("FAILED");
        assertThat(resolve(job,AccountDeliveryOperations.Resolution.ABANDON)).isTrue();assertThat(state()).isEqualTo("DEAD");assertThat(worker.dispatchOne()).isFalse();
    }
    @ParameterizedTest @ValueSource(strings={"EXPIRED","REVOKED","CONSUMED","DISABLED","EMAIL_CHANGED"})
    void unusableCapabilitiesCannotBeResumed(String mode){
        var job=hold();var account=users.findByEmailNormalized(EMAIL).orElseThrow();
        switch(mode){
            case "EXPIRED"->clock.advance(86400);
            case "REVOKED"->tokens.revoke(tokens.findByUserIdAndPurpose(account.getId(),TokenPurpose.VERIFY_EMAIL).getFirst().getId(),TokenPurpose.VERIFY_EMAIL,clock.instant());
            case "CONSUMED"->tokens.consume(tokens.findByUserIdAndPurpose(account.getId(),TokenPurpose.VERIFY_EMAIL).getFirst().getId(),TokenPurpose.VERIFY_EMAIL,clock.instant());
            case "DISABLED"->jdbc.update("update collector.users set state='DISABLED'");
            case "EMAIL_CHANGED"->jdbc.update("update collector.users set email_normalized='changed@example.test'");
        }
        assertThat(resolve(job,AccountDeliveryOperations.Resolution.CONFIRMED_NOT_SENT)).isTrue();assertThat(state()).isEqualTo("DEAD");
        assertThat(worker.dispatchOne()).isFalse();assertThat(sender.calls).isEqualTo(1);
    }
    @Test void retryCapCannotBeBypassedThroughReconciliation(){
        hold();jdbc.update("update collector.outbox_jobs set attempt_count=5");var job=operations.inspectHeld(1).getFirst();
        assertThat(resolve(job,AccountDeliveryOperations.Resolution.CONFIRMED_NOT_SENT)).isTrue();assertThat(state()).isEqualTo("DEAD");
    }
    @Test void staleDecisionCannotResolveANewerAttemptEvenWhenClockDoesNotAdvance(){
        var old=hold();assertThat(resolve(old,AccountDeliveryOperations.Resolution.CONFIRMED_NOT_SENT)).isTrue();
        assertThat(worker.dispatchOne()).isTrue();var current=operations.inspectHeld(1).getFirst();
        assertThat(current.updatedAt()).isEqualTo(old.updatedAt());assertThat(current.attempts()).isEqualTo(2);
        assertThat(resolve(old,AccountDeliveryOperations.Resolution.CONFIRMED_SENT)).isFalse();
        assertThat(resolve(current,AccountDeliveryOperations.Resolution.CONFIRMED_SENT)).isTrue();
    }
    @Test void concurrentOperatorsHaveOneWinner() throws Exception {
        var job=hold();var go=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)){
            Callable<Boolean> task=()->{go.await();return resolve(job,AccountDeliveryOperations.Resolution.CONFIRMED_NOT_SENT);};
            var a=pool.submit(task);var b=pool.submit(task);go.countDown();
            assertThat(List.of(a.get(5,TimeUnit.SECONDS),b.get(5,TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
        }assertThat(state()).isEqualTo("QUEUED");
    }
    @Test void staleOrUntrustedDecisionsAndNonheldJobsCannotMutateQueue(){
        var job=hold();assertThat(operations.reconcile(job.id(),job.updatedAt().minusSeconds(1),job.attempts(),AccountDeliveryOperations.Resolution.CONFIRMED_SENT,"CASE-1")).isFalse();
        assertThatThrownBy(()->operations.reconcile(job.id(),job.updatedAt(),job.attempts(),AccountDeliveryOperations.Resolution.CONFIRMED_NOT_SENT,"raw secret or token"))
            .isInstanceOf(IllegalArgumentException.class).hasMessageNotContaining("raw secret");
        assertThat(state()).isEqualTo("FAILED");
        resolve(job,AccountDeliveryOperations.Resolution.CONFIRMED_SENT);assertThat(resolve(job,AccountDeliveryOperations.Resolution.ABANDON)).isFalse();
    }
    @Test void databaseFailureRollsBackReconciliationAndEvidence(){
        var job=hold();jdbc.execute("alter table collector.outbox_jobs add constraint reconcile_failure check(state<>'SUCCEEDED') not valid");
        try{assertThatThrownBy(()->resolve(job,AccountDeliveryOperations.Resolution.CONFIRMED_SENT)).isInstanceOf(RuntimeException.class);
            assertThat(state()).isEqualTo("FAILED");assertThat(jdbc.queryForObject("select jsonb_exists(payload_json,'reconciliation') from collector.outbox_jobs",Boolean.class)).isFalse();
        }finally{jdbc.execute("alter table collector.outbox_jobs drop constraint reconcile_failure");}
    }
    @Test void heldJobAndStableKeySurviveRealContextRestart(){
        var job=hold();context.close();open();assertThat(operations.inspectHeld(1)).containsExactly(job);
        assertThat(worker.dispatchOne()).isFalse();assertThat(sender.calls).isZero();
        sender.failure=null;assertThat(resolve(job,AccountDeliveryOperations.Resolution.CONFIRMED_NOT_SENT)).isTrue();
        assertThat(worker.dispatchOne()).isTrue();assertThat(sender.messages).hasSize(1);assertThat(state()).isEqualTo("SUCCEEDED");
        assertThat(context.getBean(org.flywaydb.core.Flyway.class).validateWithResult().validationSuccessful).isTrue();
        assertThat(context.getBean(org.flywaydb.core.Flyway.class).info().applied()).hasSize(20);
    }
    @Test void expiredLeaseAfterRestartBecomesUnknownAndIsNeverAutomaticallyResent(){
        issue();jdbc.update("update collector.outbox_jobs set state='RUNNING',lease_owner='crashed-worker',lease_expires_at=?,attempt_count=1",java.sql.Timestamp.from(clock.instant().minusSeconds(1)));
        context.close();open();assertThat(worker.dispatchOne()).isFalse();
        var job=operations.inspectHeld(1).getFirst();assertThat(job.outcome()).isEqualTo("DELIVERY_OUTCOME_UNKNOWN");assertThat(sender.calls).isZero();
    }
    @Test void cipherFailureRequiresAbandonOrKeyRepairNotUnprovenRetry(){
        issue();jdbc.update("update collector.outbox_jobs set encryption_key_id='unavailable-key'");worker.dispatchOne();
        var job=operations.inspectHeld(1).getFirst();assertThat(job.outcome()).isEqualTo("DELIVERY_CIPHER_UNAVAILABLE");
        assertThat(resolve(job,AccountDeliveryOperations.Resolution.CONFIRMED_NOT_SENT)).isFalse();
        assertThat(resolve(job,AccountDeliveryOperations.Resolution.ABANDON)).isTrue();assertThat(state()).isEqualTo("DEAD");
    }
    @Test void twoAutomatedPollersShareTheDatabaseClaimWithoutDuplicateDelivery() throws Exception {
        issue();var first=runner();var second=runner();first.start();second.start();
        try{assertThat(sender.delivered.await(5,TimeUnit.SECONDS)).isTrue();}finally{first.stop();second.stop();}
        assertThat(sender.messages).hasSize(1);assertThat(sender.calls).isEqualTo(1);assertThat(state()).isEqualTo("SUCCEEDED");
    }
    @Test void staleLeaseMaintenanceIsBoundedAndMakesProgress(){
        issue();jdbc.update("update collector.outbox_jobs set state='RUNNING',lease_owner='crashed-worker',lease_expires_at=?,attempt_count=1",java.sql.Timestamp.from(clock.instant().minusSeconds(1)));
        jdbc.update("""
            insert into collector.outbox_jobs(job_type,payload_json,encrypted_payload,encryption_key_id,dedupe_key,state,
              lease_owner,lease_expires_at,attempt_count)
            select job_type,payload_json,encrypted_payload,encryption_key_id,'batch-'||n,'RUNNING',
              'crashed-worker',lease_expires_at,1 from collector.outbox_jobs cross join generate_series(1,100) n
            """);
        assertThat(worker.dispatchOne()).isFalse();
        assertThat(jdbc.queryForObject("select count(*) from collector.outbox_jobs where state='FAILED'",Long.class)).isEqualTo(100);
        assertThat(jdbc.queryForObject("select count(*) from collector.outbox_jobs where state='RUNNING'",Long.class)).isEqualTo(1);
        assertThat(operations.inspectHeld(10)).hasSize(10);worker.dispatchOne();
        assertThat(jdbc.queryForObject("select count(*) from collector.outbox_jobs where state='FAILED'",Long.class)).isEqualTo(101);
        assertThat(sender.calls).isZero();
    }
    @Test void operationsAndUnapprovedResendHaveNoPublicEndpoint() throws Exception {
        for(String path:List.of("auth/resend-verification","internal/account-delivery","auth/delivery/reconcile","actuator/account-delivery"))
            mvc.perform(postWithCsrf(path.startsWith("actuator")?"/"+path:"/api/v1/"+path,Map.of()))
                .andExpect(status().isForbidden()).andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        mvc.perform(get("/actuator/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
    }
}

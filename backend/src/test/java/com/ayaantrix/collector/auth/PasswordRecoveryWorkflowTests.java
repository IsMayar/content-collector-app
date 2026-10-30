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
class PasswordRecoveryWorkflowTests {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse(
        "public.ecr.aws/docker/library/postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873")
        .asCompatibleSubstituteFor("postgres"));
    private static final String EMAIL="recovery@example.test";
    private static final String OLD="synthetic original password";
    private static final String NEW="synthetic replacement password";
    private ConfigurableApplicationContext context;
    private JdbcTemplate jdbc;
    private MockMvc mvc;
    private JsonMapper json;
    private UserAccountRepository users;
    private AccountTokenRepository tokens;
    private PasswordRecoveryService recovery;
    private PasswordResetService reset;
    private VerificationDeliveryWorker worker;
    private VerificationOutbox outbox;
    private AccountRegistrationWorkflowTests.TestClock clock;
    private AccountRegistrationWorkflowTests.FakeMail sender;
    private CountingPasswords passwords;
    private final SecureAccountTokens secrets=new SecureAccountTokens();

    @org.springframework.boot.test.context.TestConfiguration(proxyBeanMethods=false)
    @Import(AccountRegistrationWorkflowTests.TestConfiguration.class)
    static class TestConfiguration {
        @Bean @Primary CountingPasswords countingPasswords() {return new CountingPasswords();}
    }
    static class CountingPasswords implements PasswordEncoder {
        final java.util.concurrent.atomic.AtomicInteger encodes=new java.util.concurrent.atomic.AtomicInteger();
        final PasswordEncoder delegate=new com.ayaantrix.collector.auth.security.PasswordConfiguration().passwordEncoder();
        public String encode(CharSequence raw){encodes.incrementAndGet();return delegate.encode(raw);}
        public boolean matches(CharSequence raw,String encoded){return delegate.matches(raw,encoded);}
    }
    @BeforeAll void start() {
        byte[] key=new byte[32];new java.security.SecureRandom().nextBytes(key);
        context=new SpringApplicationBuilder(CollectorApplication.class,TestConfiguration.class).profiles("test").run(
            "--server.port=0","--spring.datasource.url="+POSTGRES.getJdbcUrl(),
            "--spring.datasource.username="+POSTGRES.getUsername(),"--spring.datasource.password="+POSTGRES.getPassword(),
            "--collector.delivery.encryption-key="+Base64.getEncoder().encodeToString(key));
        jdbc=context.getBean(JdbcTemplate.class);json=context.getBean(JsonMapper.class);
        users=context.getBean(UserAccountRepository.class);tokens=context.getBean(AccountTokenRepository.class);
        recovery=context.getBean(PasswordRecoveryService.class);reset=context.getBean(PasswordResetService.class);
        worker=context.getBean(VerificationDeliveryWorker.class);outbox=context.getBean(VerificationOutbox.class);
        clock=context.getBean(AccountRegistrationWorkflowTests.TestClock.class);
        sender=context.getBean(AccountRegistrationWorkflowTests.FakeMail.class);passwords=context.getBean(CountingPasswords.class);
        mvc=MockMvcBuilders.webAppContextSetup((WebApplicationContext)context).apply(springSecurity())
            .addFilters(context.getBean(RequestTraceFilter.class)).build();
    }
    @AfterAll void close(){if(context!=null)context.close();}
    @BeforeEach void clear(){
        clock.now.set(Instant.parse("2026-10-26T12:00:00Z"));sender.reset();
        jdbc.update("delete from collector.outbox_jobs");jdbc.update("delete from collector.access_tokens");
        jdbc.update("delete from collector.users");jdbc.update("delete from collector.account_request_limits");passwords.encodes.set(0);
    }
    private UserAccount account(){
        var user=new UserAccount(EMAIL,"Alex",passwords.encode(OLD),clock.instant());user.markVerified(clock.instant());return users.saveAndFlush(user);
    }
    private MockHttpServletRequestBuilder postWithCsrf(String path,Object body) throws Exception {
        var csrf=mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isOk()).andReturn();
        return post(path).session((MockHttpSession)csrf.getRequest().getSession(false)).contentType("application/json")
            .header("X-XSRF-TOKEN",json.readTree(csrf.getResponse().getContentAsString()).get("token").asText())
            .header("X-Request-ID","recovery-test").content(json.writeValueAsString(body));
    }
    private String requestRecovery(String email) throws Exception {
        return mvc.perform(postWithCsrf("/api/v1/auth/forgot-password",Map.of("email",email)))
            .andExpect(status().isAccepted()).andExpect(header().string("X-Request-ID","recovery-test"))
            .andExpect(jsonPath("$.token").doesNotExist()).andReturn().getResponse().getContentAsString();
    }
    private String issueAndDeliver(){
        account();recovery.request(EMAIL,"recovery-test");assertThat(worker.dispatchOne()).isTrue();
        return sender.messages.getFirst().actionLink().getFragment().substring(6);
    }
    private AccountToken token(){return tokens.findByUserIdAndPurpose(users.findByEmailNormalized(EMAIL).orElseThrow().getId(),TokenPurpose.RESET_PASSWORD).getFirst();}
    private void resetWith(String raw){reset.reset(new PasswordResetRequest(raw,NEW));}
    private long count(String table){return jdbc.queryForObject("select count(*) from collector."+table,Long.class);}
    private String jobState(){return jdbc.queryForObject("select state from collector.outbox_jobs",String.class);}

    @Test void eligibleRecoveryNormalizesEmailAndQueuesEncryptedReset(CapturedOutput output) throws Exception {
        account();requestRecovery(" RECOVERY@EXAMPLE.TEST ");var token=token();
        assertThat(token.getPurpose()).isEqualTo(TokenPurpose.RESET_PASSWORD);
        assertThat(token.getExpiresAt()).isEqualTo(clock.instant().plusSeconds(1800));
        byte[] encrypted=jdbc.queryForObject("select encrypted_payload from collector.outbox_jobs",byte[].class);
        assertThat(sender.calls).isZero();assertThat(worker.dispatchOne()).isTrue();
        var message=sender.messages.getFirst();String raw=message.actionLink().getFragment().substring(6);
        assertThat(message.purpose()).isEqualTo(TokenPurpose.RESET_PASSWORD);
        assertThat(message.actionLink().getPath()).isEqualTo("/reset-password");
        assertThat(message.recipient()).isEqualTo(EMAIL);assertThat(secrets.digest(raw)).isEqualTo(token.getTokenHash());
        assertThat(new String(encrypted,java.nio.charset.StandardCharsets.UTF_8)).doesNotContain(raw);
        assertThat(jdbc.queryForObject("select payload_json::text from collector.outbox_jobs",String.class)).doesNotContain(raw,EMAIL);
        assertThat(output.getAll()).doesNotContain(raw,token.getTokenHash(),OLD);
    }
    @Test void unknownAndExistingAndCoalescedRequestsHaveIdenticalPublicBodiesAndWork() throws Exception {
        account();int before=passwords.encodes.get();String existing=requestRecovery(EMAIL);
        assertThat(passwords.encodes.get()-before).isEqualTo(1);
        before=passwords.encodes.get();String unknown=requestRecovery("unknown@example.test");
        assertThat(passwords.encodes.get()-before).isEqualTo(1);
        before=passwords.encodes.get();String repeated=requestRecovery(EMAIL);
        assertThat(passwords.encodes.get()-before).isEqualTo(1);
        assertThat(existing).isEqualTo(unknown).isEqualTo(repeated);
        assertThat(count("access_tokens")).isEqualTo(1);assertThat(count("outbox_jobs")).isEqualTo(1);
    }
    @Test void recoveryAppliesMinimumResponseBudgetForUnknownAccount(){
        long start=System.nanoTime();recovery.request("unknown@example.test","timing-test");
        assertThat(System.nanoTime()-start).isGreaterThanOrEqualTo(250_000_000L);
    }
    @ParameterizedTest @ValueSource(strings={"bad",""," ","a@","a"})
    void invalidRecoveryInputIsRejected(String email) throws Exception {
        mvc.perform(postWithCsrf("/api/v1/auth/forgot-password",Map.of("email",email)))
            .andExpect(status().isBadRequest()).andExpect(content().contentTypeCompatibleWith("application/problem+json"))
            .andExpect(jsonPath("$.code").value("VALIDATION_FAILED")).andExpect(jsonPath("$.traceId").value("recovery-test"));
        assertThat(count("access_tokens")).isZero();
    }
    @ParameterizedTest @ValueSource(strings={"UNVERIFIED","DISABLED"})
    void ineligibleAccountsReceiveGenericRecoveryWithoutIssuance(String state) throws Exception {
        var user=new UserAccount(EMAIL,"Alex",passwords.encode(OLD),clock.instant());
        if(state.equals("DISABLED")){user.markVerified(clock.instant());user.disable(clock.instant());}
        users.saveAndFlush(user);String body=requestRecovery(EMAIL);assertThat(body).isEqualTo(requestRecovery("unknown@example.test"));
        assertThat(count("access_tokens")).isZero();assertThat(count("outbox_jobs")).isZero();
        assertThat(users.findById(user.getId()).orElseThrow().getState().name()).isEqualTo(state);
    }
    @Test void repeatedAndConcurrentRecoveryRequestsIssueOneCapability() throws Exception {
        account();var go=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)){
            Callable<Boolean> task=()->{go.await();recovery.request(EMAIL,"concurrent-recovery");return true;};
            var a=pool.submit(task);var b=pool.submit(task);go.countDown();assertThat(a.get(20,TimeUnit.SECONDS)).isTrue();assertThat(b.get(20,TimeUnit.SECONDS)).isTrue();
        }
        assertThat(count("access_tokens")).isEqualTo(1);assertThat(count("outbox_jobs")).isEqualTo(1);
    }
    @Test void expiredCapabilityCanBeReplacedWithoutRetainingOldPendingPayload(){
        account();recovery.request(EMAIL,"first");var old=token();clock.advance(1800);recovery.request(EMAIL,"second");
        var all=tokens.findByUserIdAndPurpose(old.getUserId(),TokenPurpose.RESET_PASSWORD);
        assertThat(all).hasSize(2);assertThat(all.stream().filter(t->t.isUsableFor(TokenPurpose.RESET_PASSWORD,clock.instant())).count()).isEqualTo(1);
        assertThat(tokens.findById(old.getId()).orElseThrow().getRevokedAt()).isNotNull();
        assertThat(jdbc.queryForObject("select count(*) from collector.outbox_jobs where encrypted_payload is not null",Long.class)).isEqualTo(1);
    }
    @Test void failedRecoveryEnqueueRollsBackButRetainsGenericPublicResponse() throws Exception {
        account();jdbc.execute("alter table collector.outbox_jobs add constraint recovery_failure check(false) not valid");
        try{assertThat(requestRecovery(EMAIL)).isEqualTo(requestRecovery("unknown@example.test"));}
        finally{jdbc.execute("alter table collector.outbox_jobs drop constraint recovery_failure");}
        assertThat(count("access_tokens")).isZero();assertThat(count("outbox_jobs")).isZero();
    }
    @Test void rateLimitsAreSeparateFromRegistrationAndReset() throws Exception {
        for(int i=0;i<5;i++)requestRecovery("unknown@example.test");
        mvc.perform(postWithCsrf("/api/v1/auth/forgot-password",Map.of("email",EMAIL))).andExpect(status().isTooManyRequests())
            .andExpect(header().string("Retry-After","60")).andExpect(jsonPath("$.code").value("RATE_LIMITED"));
        clock.advance(60);requestRecovery("unknown@example.test");
    }
    @Test void resetReplacesPasswordPreservesVerificationAndDoesNotAuthenticate(CapturedOutput output) throws Exception {
        String raw=issueAndDeliver();var before=users.findByEmailNormalized(EMAIL).orElseThrow();
        mvc.perform(postWithCsrf("/api/v1/auth/reset-password",Map.of("token",raw,"password",NEW))).andExpect(status().isOk())
            .andExpect(content().json("{\"message\":\"Your password has been reset.\"}"))
            .andExpect(jsonPath("$.token").doesNotExist()).andExpect(jsonPath("$.accessToken").doesNotExist());
        var user=users.findById(before.getId()).orElseThrow();
        assertThat(user.getPasswordHash()).startsWith("{argon2}$argon2id$").isNotEqualTo(before.getPasswordHash());
        assertThat(passwords.matches(NEW,user.getPasswordHash())).isTrue();assertThat(passwords.matches(OLD,user.getPasswordHash())).isFalse();
        assertThat(user.getVerifiedAt()).isEqualTo(before.getVerifiedAt());assertThat(user.getState()).isEqualTo(AccountState.ACTIVE);
        assertThat(token().getConsumedAt()).isEqualTo(clock.instant());
        mvc.perform(get("/api/v1/me")).andExpect(status().isUnauthorized());
        assertThat(output.getAll()).doesNotContain(raw,NEW,OLD,user.getPasswordHash(),token().getTokenHash());
    }
    @ParameterizedTest @ValueSource(strings={"EXPIRED","REVOKED","CONSUMED","WRONG_PURPOSE","DISABLED","UNVERIFIED","EMAIL_CHANGED"})
    void unusableResetTokensNeverChangeCredentials(String condition) throws Exception {
        String raw=issueAndDeliver();var token=token();var user=users.findByEmailNormalized(EMAIL).orElseThrow();
        switch(condition){
            case "EXPIRED"->clock.advance(1800);
            case "REVOKED"->tokens.revoke(token.getId(),TokenPurpose.RESET_PASSWORD,clock.instant());
            case "CONSUMED"->tokens.consume(token.getId(),TokenPurpose.RESET_PASSWORD,clock.instant());
            case "WRONG_PURPOSE"->jdbc.update("update collector.access_tokens set purpose='VERIFY_EMAIL' where id=?",token.getId());
            case "DISABLED"->{user.disable(clock.instant());users.saveAndFlush(user);}
            case "UNVERIFIED"->jdbc.update("update collector.users set state='UNVERIFIED',verified_at=null where id=?",user.getId());
            case "EMAIL_CHANGED"->jdbc.update("update collector.users set email_normalized='changed@example.test' where id=?",user.getId());
        }
        mvc.perform(postWithCsrf("/api/v1/auth/reset-password",Map.of("token",raw,"password",NEW)))
            .andExpect(status().is(Set.of("EXPIRED","CONSUMED").contains(condition)?410:400))
            .andExpect(content().contentTypeCompatibleWith("application/problem+json")).andExpect(jsonPath("$.traceId").value("recovery-test"));
        assertThat(users.findById(user.getId()).orElseThrow().getPasswordHash()).isEqualTo(user.getPasswordHash());
    }
    @Test void invalidAndUnknownTokensUseSafeErrors() throws Exception {
        for(String raw:List.of("bad",secrets.generate()))
            mvc.perform(postWithCsrf("/api/v1/auth/reset-password",Map.of("token",raw,"password",NEW)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.traceId").value("recovery-test"));
    }
    @ParameterizedTest @ValueSource(strings={"","short","   ","LONG"})
    void invalidNewPasswordLeavesTokenUsable(String value) throws Exception {
        String raw=issueAndDeliver();String password=value.equals("LONG")?"x".repeat(129):value;
        mvc.perform(postWithCsrf("/api/v1/auth/reset-password",Map.of("token",raw,"password",password)))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        assertThat(token().getConsumedAt()).isNull();assertThat(passwords.matches(OLD,users.findByEmailNormalized(EMAIL).orElseThrow().getPasswordHash())).isTrue();
    }
    @Test void missingFieldsMalformedJsonAndMissingPasswordAreRejected() throws Exception {
        mvc.perform(postWithCsrf("/api/v1/auth/forgot-password",Map.of())).andExpect(status().isBadRequest());
        mvc.perform(postWithCsrf("/api/v1/auth/reset-password",Map.of("token",secrets.generate()))).andExpect(status().isBadRequest());
        mvc.perform(postWithCsrf("/api/v1/auth/reset-password",Map.of()).content("{broken"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }
    @Test void concurrentResetHasOneWinnerAndNoPasswordOverwrite() throws Exception {
        String raw=issueAndDeliver();var go=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)){
            Callable<Boolean> task=()->{go.await();try{resetWith(raw);return true;}catch(ApiException error){assertThat(error.getCode()).isEqualTo("TOKEN_CONSUMED");return false;}};
            var a=pool.submit(task);var b=pool.submit(task);go.countDown();assertThat(List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
        }
        assertThat(passwords.matches(NEW,users.findByEmailNormalized(EMAIL).orElseThrow().getPasswordHash())).isTrue();
    }
    @Test void passwordUpdateFailureRollsBackTokenAndPendingDelivery() throws Exception {
        String raw=issueAndDeliver();var old=users.findByEmailNormalized(EMAIL).orElseThrow();
        jdbc.execute("alter table collector.users add constraint reset_failure check(version=0) not valid");
        try{
            mvc.perform(postWithCsrf("/api/v1/auth/reset-password",Map.of("token",raw,"password",NEW))).andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_SERVER_ERROR"));
            assertThat(token().getConsumedAt()).isNull();assertThat(users.findById(old.getId()).orElseThrow().getPasswordHash()).isEqualTo(old.getPasswordHash());
        }finally{jdbc.execute("alter table collector.users drop constraint reset_failure");}
        resetWith(raw);assertThat(token().getConsumedAt()).isNotNull();
    }
    @Test void resetRevokesOtherTokensAndErasesTheirPendingDeliveryWithoutTouchingVerification(){
        String raw=issueAndDeliver();var user=users.findByEmailNormalized(EMAIL).orElseThrow();
        var tx=new TransactionTemplate(context.getBean(PlatformTransactionManager.class));
        var other=tx.execute(status->{String pending=secrets.generate();var t=tokens.saveAndFlush(new AccountToken(user,secrets.digest(pending),TokenPurpose.RESET_PASSWORD,clock.instant()));outbox.enqueue(t,pending,"extra");return t;});
        var verify=tokens.saveAndFlush(new AccountToken(user,secrets.digest(secrets.generate()),TokenPurpose.VERIFY_EMAIL,clock.instant()));
        resetWith(raw);
        assertThat(tokens.findById(other.getId()).orElseThrow().getRevokedAt()).isNotNull();
        assertThat(tokens.findById(verify.getId()).orElseThrow().getRevokedAt()).isNull();
        assertThat(jdbc.queryForObject("select count(*) from collector.outbox_jobs where encrypted_payload is not null",Long.class)).isZero();
        assertThat(worker.dispatchOne()).isFalse();assertThat(sender.messages).hasSize(1);
    }
    @Test void staleConsumedAndRevokedPendingJobsCannotDeliverCapabilities(){
        account();recovery.request(EMAIL,"pending");var token=token();resetWithRawDigestFixture(token);
        assertThat(worker.dispatchOne()).isFalse();assertThat(sender.calls).isZero();
    }
    private void resetWithRawDigestFixture(AccountToken token){
        // Simulate a legacy revocation while the message remains queued; worker must suppress it.
        tokens.revoke(token.getId(),TokenPurpose.RESET_PASSWORD,clock.instant());
        assertThat(worker.dispatchOne()).isTrue();assertThat(jobState()).isEqualTo("SUCCEEDED");
    }
    @Test void resetRejectsReplayWithoutChangingPasswordAgain() throws Exception {
        String raw=issueAndDeliver();resetWith(raw);String hash=users.findByEmailNormalized(EMAIL).orElseThrow().getPasswordHash();
        mvc.perform(postWithCsrf("/api/v1/auth/reset-password",Map.of("token",raw,"password","another valid synthetic password")))
            .andExpect(status().isGone()).andExpect(jsonPath("$.code").value("TOKEN_CONSUMED"));
        assertThat(users.findByEmailNormalized(EMAIL).orElseThrow().getPasswordHash()).isEqualTo(hash);
    }
    @Test void csrfAndWrongMethodsRemainDenied() throws Exception {
        for(String path:List.of("forgot-password","reset-password")){
            mvc.perform(post("/api/v1/auth/"+path).contentType("application/json").content("{}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
            mvc.perform(postWithCsrf("/api/v1/auth/"+path,Map.of()).with(request->{request.removeHeader("X-XSRF-TOKEN");request.addHeader("X-XSRF-TOKEN","bad");return request;}))
                .andExpect(status().isForbidden());
            mvc.perform(get("/api/v1/auth/"+path)).andExpect(status().isForbidden());
            mvc.perform(postWithCsrf("/api/v1/auth/"+path+"/child",Map.of())).andExpect(status().isForbidden());
        }
        for(String path:List.of("login/child","refresh/child","logout/child","resend-verification"))
            mvc.perform(postWithCsrf("/api/v1/auth/"+path,Map.of())).andExpect(status().isForbidden());
    }
    @Test void resetAttemptsHaveIndependentRateLimit() throws Exception {
        for(int i=0;i<20;i++)mvc.perform(postWithCsrf("/api/v1/auth/reset-password",Map.of("token",secrets.generate(),"password",NEW))).andExpect(status().isBadRequest());
        mvc.perform(postWithCsrf("/api/v1/auth/reset-password",Map.of("token",secrets.generate(),"password",NEW)))
            .andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After","60"));
    }
    @Test void resetDeliveryUnknownOutcomeIsHeldOnlyUntilResetExpiry(){
        account();recovery.request(EMAIL,"unknown-send");sender.failure="UNKNOWN";
        assertThat(worker.dispatchOne()).isTrue();assertThat(jobState()).isEqualTo("FAILED");
        clock.advance(1799);assertThat(worker.dispatchOne()).isFalse();assertThat(sender.calls).isEqualTo(1);
        clock.advance(1);worker.dispatchOne();assertThat(jobState()).isEqualTo("DEAD");
        assertThat(jdbc.queryForObject("select encrypted_payload is null from collector.outbox_jobs",Boolean.class)).isTrue();
    }
    @Test void concurrentWorkersDeliverResetOnce() throws Exception {
        account();recovery.request(EMAIL,"worker-race");var go=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)){
            Callable<Boolean> task=()->{go.await();return worker.dispatchOne();};var a=pool.submit(task);var b=pool.submit(task);go.countDown();
            assertThat(List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
        }
        assertThat(sender.messages).hasSize(1);assertThat(sender.messages.getFirst().purpose()).isEqualTo(TokenPurpose.RESET_PASSWORD);
    }
    @Test void v3UpgradePreservesQueuedVerificationCiphertext(){
        jdbc.execute("create database recovery_upgrade");
        var source=new DriverManagerDataSource("jdbc:postgresql://"+POSTGRES.getHost()+":"+POSTGRES.getMappedPort(5432)+"/recovery_upgrade",POSTGRES.getUsername(),POSTGRES.getPassword());
        var data=new JdbcTemplate(source);Flyway.configure().dataSource(source).target("3").load().migrate();
        UUID id=UUID.randomUUID();byte[] encrypted={1,2,3,4};
        data.update("insert into collector.outbox_jobs(id,job_type,payload_json,encrypted_payload,encryption_key_id,dedupe_key,state) values (?,'VERIFY_EMAIL','{}'::jsonb,?,'test-v1','upgrade','QUEUED')",id,encrypted);
        var flyway=Flyway.configure().dataSource(source).load();flyway.migrate();assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
        assertThat(flyway.info().applied()).hasSize(12);assertThat(data.queryForObject("select encrypted_payload from collector.outbox_jobs where id=?",byte[].class,id)).containsExactly(encrypted);
        data.update("insert into collector.outbox_jobs(job_type,payload_json,encrypted_payload,encryption_key_id,dedupe_key,state) values ('RESET_PASSWORD','{}'::jsonb,?,'test-v1','reset-upgrade','QUEUED')",encrypted);
    }
}

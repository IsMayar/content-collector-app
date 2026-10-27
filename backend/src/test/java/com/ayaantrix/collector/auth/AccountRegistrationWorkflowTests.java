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
class AccountRegistrationWorkflowTests {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse(
        "public.ecr.aws/docker/library/postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873")
        .asCompatibleSubstituteFor("postgres"));
    private static final String EMAIL="alex@example.test";
    private static final String PASSWORD="synthetic registration password";
    private ConfigurableApplicationContext context;
    private MockMvc mvc;
    private JsonMapper json;
    private JdbcTemplate jdbc;
    private UserAccountRepository users;
    private AccountTokenRepository tokens;
    private RegistrationService registration;
    private EmailVerificationService verification;
    private VerificationDeliveryWorker worker;
    private TestClock clock;
    private FakeMail sender;
    private final SecureAccountTokens secrets=new SecureAccountTokens();

    @org.springframework.boot.test.context.TestConfiguration(proxyBeanMethods=false)
    static class TestConfiguration {
        @Bean @Primary TestClock workflowClock() { return new TestClock(); }
        @Bean @Primary FakeMail workflowSender() { return new FakeMail(); }
    }
    static class TestClock extends Clock {
        final AtomicReference<Instant> now=new AtomicReference<>();
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now.get(); }
        void advance(long seconds) { now.updateAndGet(t->t.plusSeconds(seconds)); }
    }
    static class FakeMail implements VerificationMailSender {
        final List<Message> messages=new CopyOnWriteArrayList<>();
        volatile String failure;
        volatile int calls;
        public void send(Message message) {
            if (TransactionSynchronizationManager.isActualTransactionActive())
                throw new AssertionError("Delivery ran in an uncommitted transaction");
            calls++;
            if (failure!=null) throw new DeliveryFailure(failure.equals("UNKNOWN"));
            messages.add(message);
        }
        void reset() { messages.clear();failure=null;calls=0; }
    }
    @BeforeAll void start() {
        byte[] key=new byte[32];new java.security.SecureRandom().nextBytes(key);
        context=new SpringApplicationBuilder(CollectorApplication.class,TestConfiguration.class).profiles("test").run(
            "--server.port=0","--spring.datasource.url="+POSTGRES.getJdbcUrl(),
            "--spring.datasource.username="+POSTGRES.getUsername(),"--spring.datasource.password="+POSTGRES.getPassword(),
            "--collector.delivery.encryption-key="+Base64.getEncoder().encodeToString(key));
        json=context.getBean(JsonMapper.class);jdbc=context.getBean(JdbcTemplate.class);
        users=context.getBean(UserAccountRepository.class);tokens=context.getBean(AccountTokenRepository.class);
        registration=context.getBean(RegistrationService.class);verification=context.getBean(EmailVerificationService.class);
        worker=context.getBean(VerificationDeliveryWorker.class);clock=context.getBean(TestClock.class);sender=context.getBean(FakeMail.class);
        mvc=MockMvcBuilders.webAppContextSetup((WebApplicationContext)context).apply(springSecurity())
            .addFilters(context.getBean(RequestTraceFilter.class)).build();
    }
    @AfterAll void close() { if(context!=null)context.close(); }
    @BeforeEach void reset() {
        clock.now.set(Instant.parse("2026-10-26T10:00:00Z"));sender.reset();
        jdbc.update("delete from collector.outbox_jobs");jdbc.update("delete from collector.access_tokens");
        jdbc.update("delete from collector.users");jdbc.update("delete from collector.account_request_limits");
    }
    private Map<String,String> valid() { return Map.of("email",EMAIL,"displayName","Alex","password",PASSWORD); }
    private MockHttpServletRequestBuilder protectedPost(String path,Object body) throws Exception {
        var csrf=mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isOk()).andReturn();
        String token=json.readTree(csrf.getResponse().getContentAsString()).get("token").asText();
        return post(path).session((MockHttpSession)csrf.getRequest().getSession(false))
            .header("X-XSRF-TOKEN",token).header("X-Request-ID","workflow-test")
            .contentType("application/json").content(json.writeValueAsString(body));
    }
    private void issue() { registration.register(new RegistrationRequest(EMAIL,"Alex",PASSWORD),"workflow-test"); }
    private String deliveredToken() {
        issue();assertThat(worker.dispatchOne()).isTrue();
        return sender.messages.getFirst().verificationLink().getFragment().substring("token=".length());
    }
    private AccountToken issued() { return tokens.findByUserIdAndPurpose(users.findByEmailNormalized(EMAIL).orElseThrow().getId(),TokenPurpose.VERIFY_EMAIL).getFirst(); }
    private String state() { return jdbc.queryForObject("select state from collector.outbox_jobs",String.class); }
    private long count(String table) { return jdbc.queryForObject("select count(*) from collector."+table,Long.class); }

    @Test void registrationPersistsOnlySafeIdentityAndEncryptedDelivery(CapturedOutput output) throws Exception {
        var body=new HashMap<>(valid());body.put("email"," ALEX@EXAMPLE.TEST ");
        mvc.perform(protectedPost("/api/v1/auth/register",body)).andExpect(status().isAccepted())
            .andExpect(jsonPath("$.message").isString()).andExpect(jsonPath("$.token").doesNotExist())
            .andExpect(jsonPath("$.accessToken").doesNotExist()).andExpect(header().string("X-Request-ID","workflow-test"));
        var user=users.findByEmailNormalized(EMAIL).orElseThrow();
        assertThat(user.getState()).isEqualTo(AccountState.UNVERIFIED);
        assertThat(context.getBean(PasswordEncoder.class).matches(PASSWORD,user.getPasswordHash())).isTrue();
        assertThat(user.getPasswordHash()).startsWith("{argon2}$argon2id$").doesNotContain(PASSWORD);
        var token=issued();assertThat(token.getExpiresAt()).isEqualTo(clock.instant().plusSeconds(86400));
        assertThat(token.getPurpose()).isEqualTo(TokenPurpose.VERIFY_EMAIL);
        assertThat(sender.calls).isZero(); // Registration commits durable work; it never sends.
        assertThat(worker.dispatchOne()).isTrue();
        var mail=sender.messages.getFirst();String raw=mail.verificationLink().getFragment().substring(6);
        assertThat(mail.recipient()).isEqualTo(EMAIL);
        assertThat(mail.verificationLink().getPath()).isEqualTo("/verify-email");
        assertThat(secrets.digest(raw)).isEqualTo(token.getTokenHash());
        assertThat(jdbc.queryForObject("select payload_json::text from collector.outbox_jobs",String.class)).doesNotContain(raw,EMAIL);
        assertThat(jdbc.queryForObject("select encrypted_payload is null from collector.outbox_jobs",Boolean.class)).isTrue();
        assertThat(state()).isEqualTo("SUCCEEDED");
        assertThat(output.getAll()).doesNotContain(PASSWORD,raw,token.getTokenHash(),user.getPasswordHash());
    }
    @Test void duplicateRegistrationIsGenericAndDoesNotReplaceCredentialsOrTokens() throws Exception {
        String first=mvc.perform(protectedPost("/api/v1/auth/register",valid())).andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString();
        String oldHash=users.findByEmailNormalized(EMAIL).orElseThrow().getPasswordHash();
        var duplicate=new HashMap<>(valid());duplicate.put("password","another synthetic password");duplicate.put("displayName","Other");
        String second=mvc.perform(protectedPost("/api/v1/auth/register",duplicate)).andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString();
        assertThat(second).isEqualTo(first);assertThat(count("users")).isEqualTo(1);assertThat(count("access_tokens")).isEqualTo(1);
        assertThat(count("outbox_jobs")).isEqualTo(1);assertThat(users.findByEmailNormalized(EMAIL).orElseThrow().getPasswordHash()).isEqualTo(oldHash);
    }
    @Test void concurrentRegistrationCreatesExactlyOneAccountTokenAndJob() throws Exception {
        var go=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<Boolean> task=()->{go.await();registration.register(new RegistrationRequest(EMAIL,"Alex",PASSWORD),"race");return true;};
            var a=pool.submit(task);var b=pool.submit(task);go.countDown();assertThat(a.get(20,TimeUnit.SECONDS)).isTrue();assertThat(b.get(20,TimeUnit.SECONDS)).isTrue();
        }
        assertThat(count("users")).isEqualTo(1);assertThat(count("access_tokens")).isEqualTo(1);assertThat(count("outbox_jobs")).isEqualTo(1);
    }
    static Stream<Arguments> invalidBodies() {
        return Stream.of(Arguments.of("email","bad"),Arguments.of("email",""),Arguments.of("password","short"),
            Arguments.of("password","x".repeat(129)),Arguments.of("password",""),Arguments.of("displayName","x"),Arguments.of("displayName",""));
    }
    @ParameterizedTest @MethodSource("invalidBodies") void invalidRegistrationHasSafeFieldErrors(String field,String value) throws Exception {
        var body=new HashMap<>(valid());body.put(field,value);
        mvc.perform(protectedPost("/api/v1/auth/register",body)).andExpect(status().isBadRequest())
            .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
            .andExpect(jsonPath("$.code").value("VALIDATION_FAILED")).andExpect(jsonPath("$.traceId").value("workflow-test"));
        assertThat(count("users")).isZero();
    }
    @Test void missingFieldsAndMalformedJsonUseExistingErrorContract() throws Exception {
        mvc.perform(protectedPost("/api/v1/auth/register",Map.of())).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mvc.perform(protectedPost("/api/v1/auth/register",valid()).content("{broken-json"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }
    @Test void successfulVerificationIsAtomicAndDoesNotAuthenticate() throws Exception {
        String raw=deliveredToken();
        mvc.perform(protectedPost("/api/v1/auth/verify-email",Map.of("token",raw))).andExpect(status().isOk())
            .andExpect(content().json("{\"verified\":true}")).andExpect(jsonPath("$.accessToken").doesNotExist());
        assertThat(users.findByEmailNormalized(EMAIL).orElseThrow().getState()).isEqualTo(AccountState.ACTIVE);
        assertThat(issued().getConsumedAt()).isEqualTo(clock.instant());
        mvc.perform(get("/api/v1/me")).andExpect(status().isUnauthorized());
        mvc.perform(protectedPost("/api/v1/auth/verify-email",Map.of("token",raw))).andExpect(status().isGone()).andExpect(jsonPath("$.code").value("TOKEN_CONSUMED"));
    }
    @ParameterizedTest @ValueSource(strings={"EXPIRED","REVOKED","CONSUMED","WRONG_PURPOSE","DISABLED","EMAIL_CHANGED"})
    void unusableTokensDoNotVerifyAccount(String condition) throws Exception {
        String raw=deliveredToken();var token=issued();var user=users.findByEmailNormalized(EMAIL).orElseThrow();
        switch(condition) {
            case "EXPIRED" -> clock.advance(86400);
            case "REVOKED" -> tokens.revoke(token.getId(),TokenPurpose.VERIFY_EMAIL,clock.instant());
            case "CONSUMED" -> tokens.consume(token.getId(),TokenPurpose.VERIFY_EMAIL,clock.instant());
            case "WRONG_PURPOSE" -> jdbc.update("update collector.access_tokens set purpose='RESET_PASSWORD' where id=?",token.getId());
            case "DISABLED" -> {user.disable(clock.instant());users.saveAndFlush(user);}
            case "EMAIL_CHANGED" -> jdbc.update("update collector.users set email_normalized='changed@example.test' where id=?",user.getId());
        }
        int expected=Set.of("EXPIRED","CONSUMED").contains(condition)?410:400;
        mvc.perform(protectedPost("/api/v1/auth/verify-email",Map.of("token",raw))).andExpect(status().is(expected))
            .andExpect(content().contentTypeCompatibleWith("application/problem+json")).andExpect(jsonPath("$.traceId").value("workflow-test"));
        assertThat(users.findById(user.getId()).orElseThrow().getVerifiedAt()).isNull();
    }
    @Test void invalidTokenFormatAndUnknownDigestAreRejected() throws Exception {
        mvc.perform(protectedPost("/api/v1/auth/verify-email",Map.of("token","bad"))).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mvc.perform(protectedPost("/api/v1/auth/verify-email",Map.of("token",secrets.generate()))).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("TOKEN_INVALID"));
    }
    @Test void concurrentVerificationHasExactlyOneWinner() throws Exception {
        String raw=deliveredToken();var go=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<Boolean> task=()->{go.await();try{verification.verify(raw);return true;}catch(ApiException error){assertThat(error.getCode()).isEqualTo("TOKEN_CONSUMED");return false;}};
            var a=pool.submit(task);var b=pool.submit(task);go.countDown();
            assertThat(List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
        }
    }
    @Test void verificationFailureRollsBackTokenConsumption() throws Exception {
        String raw=deliveredToken();
        jdbc.execute("alter table collector.users add constraint workflow_failure check(state <> 'ACTIVE') not valid");
        try {
            mvc.perform(protectedPost("/api/v1/auth/verify-email",Map.of("token",raw)))
                .andExpect(status().isInternalServerError()).andExpect(jsonPath("$.code").value("INTERNAL_SERVER_ERROR"));
            assertThat(issued().getConsumedAt()).isNull();assertThat(users.findByEmailNormalized(EMAIL).orElseThrow().getState()).isEqualTo(AccountState.UNVERIFIED);
        } finally {jdbc.execute("alter table collector.users drop constraint workflow_failure");}
    }
    @Test void registrationFailureRollsBackAccountTokenAndOutbox() {
        jdbc.execute("alter table collector.outbox_jobs add constraint workflow_failure check(false) not valid");
        try {assertThatThrownBy(this::issue).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);}
        finally {jdbc.execute("alter table collector.outbox_jobs drop constraint workflow_failure");}
        assertThat(count("users")).isZero();assertThat(count("access_tokens")).isZero();assertThat(count("outbox_jobs")).isZero();
    }
    @Test void noDeliveryCanRunInsideUncommittedRegistrationTransaction() {
        var tx=new TransactionTemplate(context.getBean(PlatformTransactionManager.class));
        tx.executeWithoutResult(status->{issue();assertThatThrownBy(worker::dispatchOne).isInstanceOf(IllegalStateException.class);status.setRollbackOnly();});
        assertThat(sender.calls).isZero();assertThat(count("users")).isZero();assertThat(count("outbox_jobs")).isZero();
    }
    @Test void exactPathsAndCsrfRemainEnforced() throws Exception {
        mvc.perform(post("/api/v1/auth/register").contentType("application/json").content(json.writeValueAsString(valid())))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        mvc.perform(protectedPost("/api/v1/auth/register",valid()).with(request -> {
                request.removeHeader("X-XSRF-TOKEN");request.addHeader("X-XSRF-TOKEN","invalid");return request;
            }))
            .andExpect(status().isForbidden());
        for(String path:List.of("register","verify-email","csrf/child","register/child","resend-verification","login","refresh","forgot-password","reset-password","logout")) {
            mvc.perform(get("/api/v1/auth/"+path)).andExpect(status().isForbidden());
        }
        for(String path:List.of("csrf","register/child","verify-email/child","resend-verification","login/child","refresh/child","logout/child"))
            mvc.perform(protectedPost("/api/v1/auth/"+path,Map.of())).andExpect(status().isForbidden());
    }
    @Test void databaseBackedRateLimitIsGenericAndResetsInNextWindow() throws Exception {
        for(int i=0;i<5;i++) mvc.perform(protectedPost("/api/v1/auth/register",valid())).andExpect(status().isAccepted());
        mvc.perform(protectedPost("/api/v1/auth/register",valid())).andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After","60")).andExpect(jsonPath("$.code").value("RATE_LIMITED"));
        assertThat(jdbc.queryForObject("select key_hash from collector.account_request_limits",String.class)).matches("[0-9a-f]{64}");
        clock.advance(60);mvc.perform(protectedPost("/api/v1/auth/register",valid())).andExpect(status().isAccepted());
    }
    @Test void definiteDeliveryFailuresRetryWithCapAndEraseFinalPayload() {
        issue();sender.failure="DEFINITE";
        for(int i=0;i<5;i++){assertThat(worker.dispatchOne()).isTrue();clock.advance(3600);}
        assertThat(state()).isEqualTo("DEAD");assertThat(sender.calls).isEqualTo(5);
        assertThat(jdbc.queryForObject("select encrypted_payload is null from collector.outbox_jobs",Boolean.class)).isTrue();
    }
    @Test void unknownDeliveryOutcomeIsHeldWithoutBlindRetry() {
        issue();sender.failure="UNKNOWN";assertThat(worker.dispatchOne()).isTrue();assertThat(state()).isEqualTo("FAILED");
        clock.advance(3600);assertThat(worker.dispatchOne()).isFalse();assertThat(sender.calls).isEqualTo(1);
        clock.advance(86400);worker.dispatchOne();assertThat(state()).isEqualTo("DEAD");
        assertThat(jdbc.queryForObject("select encrypted_payload is null from collector.outbox_jobs",Boolean.class)).isTrue();
    }
    @Test void expiredLeaseIsHeldForReconciliation() {
        issue();jdbc.update("update collector.outbox_jobs set state='RUNNING',lease_owner='crashed',lease_expires_at=?,attempt_count=1",java.sql.Timestamp.from(clock.instant().minusSeconds(1)));
        assertThat(worker.dispatchOne()).isFalse();assertThat(state()).isEqualTo("FAILED");assertThat(sender.calls).isZero();
    }
    @Test void concurrentWorkersDoNotClaimSameJob() throws Exception {
        issue();var go=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<Boolean> task=()->{go.await();return worker.dispatchOne();};var a=pool.submit(task);var b=pool.submit(task);go.countDown();
            assertThat(List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
        }
        assertThat(sender.messages).hasSize(1);assertThat(state()).isEqualTo("SUCCEEDED");
    }
    @Test void v2DatabaseUpgradesWithoutLosingAccountData() {
        jdbc.execute("create database workflow_upgrade");
        var source=new DriverManagerDataSource("jdbc:postgresql://"+POSTGRES.getHost()+":"+POSTGRES.getMappedPort(5432)+"/workflow_upgrade",POSTGRES.getUsername(),POSTGRES.getPassword());
        var upgradeJdbc=new JdbcTemplate(source);Flyway.configure().dataSource(source).target("2").load().migrate();
        String hash=context.getBean(PasswordEncoder.class).encode(PASSWORD);
        upgradeJdbc.update("insert into collector.users(email_normalized,display_name,password_hash) values (?,'Alex',?)",EMAIL,hash);
        var flyway=Flyway.configure().dataSource(source).load();flyway.migrate();assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
        assertThat(flyway.info().applied()).hasSize(6);assertThat(upgradeJdbc.queryForObject("select password_hash from collector.users",String.class)).isEqualTo(hash);
        assertThat(upgradeJdbc.queryForObject("select count(*) from collector.outbox_jobs",Long.class)).isZero();
    }
}

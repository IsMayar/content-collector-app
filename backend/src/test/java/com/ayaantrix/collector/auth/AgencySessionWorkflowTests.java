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


import com.ayaantrix.collector.auth.security.*;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;

@Testcontainers @TestInstance(TestInstance.Lifecycle.PER_CLASS) @ExtendWith(OutputCaptureExtension.class)
class AgencySessionWorkflowTests {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse(
        "public.ecr.aws/docker/library/postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873").asCompatibleSubstituteFor("postgres"));
    @TempDir static Path directory;
    private static final String EMAIL="session@example.test",PASSWORD="synthetic session password",NEW="synthetic changed password";
    private static final String COOKIE="__Secure-collector_refresh";
    private final String pepper=Base64.getEncoder().encodeToString(new byte[32]);
    private SigningKeyFixture keys;private ConfigurableApplicationContext context;private MockMvc mvc;private JsonMapper json;private JdbcTemplate jdbc;
    private UserAccountRepository users;private AccountTokenRepository accountTokens;private AgencySessions sessions;
    private AccountRegistrationWorkflowTests.TestClock clock;private PasswordEncoder passwords;
    private final SecureAccountTokens secrets=new SecureAccountTokens();
    record SignedIn(String access,String refresh,UUID sid){@Override public String toString(){return "TestSession[redacted]";}}
    @org.springframework.boot.test.context.TestConfiguration(proxyBeanMethods=false)
    static class Configuration {
        @Bean @Primary AccountRegistrationWorkflowTests.TestClock sessionClock(){var clock=new AccountRegistrationWorkflowTests.TestClock();clock.now.set(Instant.parse("2026-10-27T01:00:00Z"));return clock;}
    }
    @BeforeAll void setup() throws Exception {keys=SigningKeyFixture.create(directory,"test-session");open();}
    private void open(){
        context=new SpringApplicationBuilder(CollectorApplication.class,Configuration.class).profiles("test").run(
            "--server.port=0","--spring.datasource.url="+POSTGRES.getJdbcUrl(),"--spring.datasource.username="+POSTGRES.getUsername(),"--spring.datasource.password="+POSTGRES.getPassword(),
            "--collector.jwt.private-key="+keys.privateFile(),"--collector.jwt.public-keys="+keys.publicFile(),"--collector.jwt.key-id="+keys.kid(),
            "--collector.jwt.issuer=https://issuer.test","--collector.jwt.audience=collector-api","--collector.auth.token-hash-pepper="+pepper,
            "--collector.delivery.worker-enabled=false","--collector.delivery.encryption-key="+pepper);
        jdbc=context.getBean(JdbcTemplate.class);json=context.getBean(JsonMapper.class);users=context.getBean(UserAccountRepository.class);
        accountTokens=context.getBean(AccountTokenRepository.class);sessions=context.getBean(AgencySessions.class);passwords=context.getBean(PasswordEncoder.class);
        clock=context.getBean(AccountRegistrationWorkflowTests.TestClock.class);
        mvc=MockMvcBuilders.webAppContextSetup((WebApplicationContext)context).apply(springSecurity()).addFilters(context.getBean(RequestTraceFilter.class)).build();
    }
    @AfterAll void close(){if(context!=null)context.close();}
    @BeforeEach void reset(){
        clock.now.set(Instant.parse("2026-10-27T01:00:00Z"));
        for(String table:List.of("session_tokens","auth_sessions","outbox_jobs","access_tokens","users","account_request_limits"))jdbc.update("delete from collector."+table);
    }
    private UserAccount account(String email){var user=new UserAccount(email,"Synthetic User",passwords.encode(PASSWORD),clock.instant());user.markVerified(clock.instant());return users.saveAndFlush(user);}
    private MockHttpServletRequestBuilder mutation(String path,Object body) throws Exception {
        var csrf=mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isOk()).andReturn();
        return post(path).session((MockHttpSession)csrf.getRequest().getSession(false)).header("X-XSRF-TOKEN",json.readTree(csrf.getResponse().getContentAsString()).get("token").asText())
            .header("X-Request-ID","session-test").contentType("application/json").content(json.writeValueAsString(body));
    }
    private SignedIn signIn() throws Exception {return login(EMAIL,PASSWORD);}
    private SignedIn login(String email,String password) throws Exception {
        var result=mvc.perform(mutation("/api/v1/auth/login",Map.of("email",email,"password",password))).andExpect(status().isOk()).andReturn();
        String access=json.readTree(result.getResponse().getContentAsString()).get("accessToken").asText();
        var jwt=context.getBean(AccessTokens.class).decode(access);return new SignedIn(access,refreshCookie(result),UUID.fromString(jwt.getClaimAsString("sid")));
    }
    private String refreshCookie(MvcResult result){return result.getResponse().getHeaders("Set-Cookie").stream().filter(v->v.startsWith(COOKIE+"=")).findFirst().orElseThrow().split(";",2)[0].substring(COOKIE.length()+1);}
    private MockHttpServletRequestBuilder refresh(String raw) throws Exception {return mutation("/api/v1/auth/refresh",Map.of()).cookie(new Cookie(COOKIE,raw));}
    private void me(SignedIn signed,int expected) throws Exception {mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+signed.access())).andExpect(status().is(expected));}
    private long count(String table){return jdbc.queryForObject("select count(*) from collector."+table,Long.class);}
    @Test void loginCreatesRealSessionAndSafeFrontendResponseAndCookie(CapturedOutput logs) throws Exception {
        var user=account(EMAIL);
        var result=mvc.perform(mutation("/api/v1/auth/login",Map.of("email","  SESSION@EXAMPLE.TEST  ","password",PASSWORD)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.expiresIn").value(300)).andExpect(jsonPath("$.user.id").value(user.getId().toString()))
            .andExpect(jsonPath("$.user.email").value(EMAIL)).andExpect(jsonPath("$.user.verified").value(true)).andExpect(header().string("Cache-Control","no-store")).andReturn();
        String raw=refreshCookie(result),body=result.getResponse().getContentAsString();
        assertThat(result.getResponse().getHeaders("Set-Cookie").toString()).contains("Secure","HttpOnly","SameSite=Lax","Path=/api/v1/auth","Max-Age=1209600").doesNotContain("Domain=");
        assertThat(body).doesNotContain(raw,PASSWORD,"passwordHash","tokenHash");assertThat(count("auth_sessions")).isEqualTo(1);assertThat(count("session_tokens")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select token_hash from collector.session_tokens",String.class)).isEqualTo(context.getBean(RefreshTokenHashes.class).digest(raw)).hasSize(64);
        assertThat(logs.getAll()).doesNotContain(raw,PASSWORD,pepper);
    }
    @ParameterizedTest @ValueSource(strings={"UNKNOWN","WRONG","UNVERIFIED","DISABLED"})
    void credentialsAndEligibilityAreEnforced(String state) throws Exception {
        if(!state.equals("UNKNOWN")){account(EMAIL);if(state.equals("UNVERIFIED"))jdbc.update("update collector.users set state='UNVERIFIED',verified_at=null");if(state.equals("DISABLED"))jdbc.update("update collector.users set state='DISABLED'");}
        mvc.perform(mutation("/api/v1/auth/login",Map.of("email",EMAIL,"password",state.equals("WRONG")?"wrong":PASSWORD)))
            .andExpect(status().is(state.equals("UNVERIFIED")?403:401)).andExpect(jsonPath("$.code").value(state.equals("UNVERIFIED")?"EMAIL_NOT_VERIFIED":"INVALID_CREDENTIALS"))
            .andExpect(jsonPath("$.traceId").value("session-test")).andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        assertThat(count("auth_sessions")).isZero();
    }
    @Test void unknownAndWrongPasswordHaveIdenticalErrors() throws Exception {
        var unknown=mvc.perform(mutation("/api/v1/auth/login",Map.of("email",EMAIL,"password","wrong"))).andReturn().getResponse().getContentAsString();
        account(EMAIL);var wrong=mvc.perform(mutation("/api/v1/auth/login",Map.of("email",EMAIL,"password","wrong"))).andReturn().getResponse().getContentAsString();assertThat(wrong).isEqualTo(unknown);
    }
    @Test void invalidAndMissingInputAndJsonUseSafe400() throws Exception {
        for(var body:List.of(Map.of(),Map.of("email",EMAIL),Map.of("email","bad","password",PASSWORD),Map.of("email",EMAIL,"password","")))
            mvc.perform(mutation("/api/v1/auth/login",body)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mvc.perform(mutation("/api/v1/auth/login",Map.of()).content("{broken")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }
    @Test void loginLimiterCannotBeBypassedWithForwardedHeaders() throws Exception {
        for(int i=0;i<10;i++)mvc.perform(mutation("/api/v1/auth/login",Map.of("email",EMAIL,"password","wrong")).header("X-Forwarded-For","10.0.0."+i)).andExpect(status().isUnauthorized());
        mvc.perform(mutation("/api/v1/auth/login",Map.of("email",EMAIL,"password","wrong"))).andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After","60"));
    }
    @Test void bootstrapReturnsSafeIdentityAndHonestEmptyMemberships() throws Exception {
        account(EMAIL);var signed=signIn();mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+signed.access()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.user.email").value(EMAIL)).andExpect(jsonPath("$.memberships").isEmpty()).andExpect(jsonPath("$.user.passwordHash").doesNotExist());
        mvc.perform(get("/api/v1/projects").header("Authorization","Bearer "+signed.access())).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from collector.workspaces",Long.class)).isZero();
    }
    @Test void rotationReplacesCookieAndRetainsOldDigestForRaceAndReuseChecks() throws Exception {
        account(EMAIL);var old=signIn();var rotated=mvc.perform(refresh(old.refresh())).andExpect(status().isOk()).andExpect(jsonPath("$.expiresIn").value(300)).andReturn();
        String next=refreshCookie(rotated);assertThat(next).isNotEqualTo(old.refresh());assertThat(count("session_tokens")).isEqualTo(2);
        mvc.perform(refresh(old.refresh())).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("REFRESH_ALREADY_ROTATED")).andExpect(jsonPath("$.accessToken").doesNotExist()).andExpect(jsonPath("$.refreshToken").doesNotExist()).andExpect(header().doesNotExist("Set-Cookie"));
        assertThat(jdbc.queryForObject("select revoked_at is null from collector.auth_sessions",Boolean.class)).isTrue();
        clock.advance(3);mvc.perform(refresh(old.refresh())).andExpect(status().isUnauthorized());
        assertThat(jdbc.queryForObject("select revoked_at is not null from collector.auth_sessions",Boolean.class)).isTrue();
        mvc.perform(refresh(next)).andExpect(status().isUnauthorized());me(old,401);
    }
    @Test void concurrentRefreshHasOneRotationAndSafeConflict() throws Exception {
        account(EMAIL);var signed=signIn();var go=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)){
            Callable<Integer> action=()->{go.await();try{sessions.refresh(signed.refresh());return 200;}catch(ApiException e){return e.getStatus().value();}};
            var a=pool.submit(action);var b=pool.submit(action);go.countDown();assertThat(List.of(a.get(10,TimeUnit.SECONDS),b.get(10,TimeUnit.SECONDS))).containsExactlyInAnyOrder(200,409);
        }assertThat(count("session_tokens")).isEqualTo(2);me(signed,200);
    }
    @ParameterizedTest @ValueSource(strings={"IDLE","ABSOLUTE","REVOKED","DISABLED","UNKNOWN"})
    void invalidSessionsCannotBootstrapOrRefresh(String mode) throws Exception {
        account(EMAIL);var signed=signIn();switch(mode){
            case "IDLE"->clock.advance(7*86400);case "ABSOLUTE"->clock.advance(14*86400);
            case "REVOKED"->jdbc.update("update collector.auth_sessions set revoked_at=created_at");
            case "DISABLED"->jdbc.update("update collector.users set state='DISABLED'");
        }
        mvc.perform(refresh(mode.equals("UNKNOWN")?secrets.generate():signed.refresh())).andExpect(status().isUnauthorized());
        if(!mode.equals("UNKNOWN"))me(signed,401);
    }
    @Test void jwtExpiryCanBeRecoveredWithUnexpiredRefreshCookie() throws Exception {
        account(EMAIL);var signed=signIn();clock.advance(331);me(signed,401);
        mvc.perform(refresh(signed.refresh()).header("Authorization","Bearer "+signed.access())).andExpect(status().isOk());
    }
    @Test void refreshExtendsIdleButNeverAbsoluteLifetime() throws Exception {
        account(EMAIL);var signed=signIn();clock.advance(6*86400);var first=sessions.refresh(signed.refresh());clock.advance(6*86400);var second=sessions.refresh(first.refreshToken());
        assertThat(second.expiresAt()).isEqualTo(Instant.parse("2026-11-10T01:00:00Z"));
        assertThat(context.getBean(AuthSessionRepository.class).findById(signed.sid()).orElseThrow().getIdleExpiresAt()).isEqualTo(second.expiresAt());
        clock.advance(2*86400);assertThatThrownBy(()->sessions.refresh(second.refreshToken())).isInstanceOf(ApiException.class);
    }
    @Test void logoutRevokesPersistentSessionAndIsIdempotentEvenWithExpiredBearer() throws Exception {
        account(EMAIL);var signed=signIn();clock.advance(331);
        for(int i=0;i<2;i++)mvc.perform(mutation("/api/v1/auth/logout",Map.of()).cookie(new Cookie(COOKIE,signed.refresh())).header("Authorization","Bearer "+signed.access()))
            .andExpect(status().isNoContent()).andExpect(header().string("Set-Cookie",org.hamcrest.Matchers.containsString("Max-Age=0")));
        mvc.perform(refresh(signed.refresh())).andExpect(status().isUnauthorized());
        mvc.perform(mutation("/api/v1/auth/logout",Map.of())).andExpect(status().isNoContent());
    }
    @Test void logoutAllRevokesOnlyTheCurrentUsersSessions() throws Exception {
        account(EMAIL);var a=signIn();var b=signIn();account("other@example.test");var other=login("other@example.test",PASSWORD);
        mvc.perform(mutation("/api/v1/auth/logout-all",Map.of()).header("Authorization","Bearer "+a.access())).andExpect(status().isNoContent());
        me(a,401);me(b,401);me(other,200);
    }
    @Test void listsAndRevokesOnlyOwnedSessions() throws Exception {
        account(EMAIL);var a=signIn();var b=signIn();account("other@example.test");var other=login("other@example.test",PASSWORD);
        mvc.perform(get("/api/v1/me/sessions").header("Authorization","Bearer "+a.access())).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(2)).andExpect(jsonPath("$.data[0].label").isString());
        mvc.perform(mutation("/api/v1/me/sessions/"+other.sid(),Map.of()).with(req->{req.setMethod("DELETE");return req;}).header("Authorization","Bearer "+a.access())).andExpect(status().isNotFound());
        mvc.perform(mutation("/api/v1/me/sessions/"+b.sid(),Map.of()).with(req->{req.setMethod("DELETE");return req;}).header("Authorization","Bearer "+a.access())).andExpect(status().isNoContent());me(b,401);me(a,200);me(other,200);
    }
    @Test void allMutationsKeepCsrfEvenWithBearerAndUntrustedOrigins() throws Exception {
        account(EMAIL);var signed=signIn();
        for(String path:List.of("login","refresh","logout","logout-all"))mvc.perform(post("/api/v1/auth/"+path).contentType("application/json").content("{}").header("Authorization","Bearer "+signed.access()))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        mvc.perform(delete("/api/v1/me/sessions/"+signed.sid()).header("Authorization","Bearer "+signed.access())).andExpect(status().isForbidden());
        mvc.perform(options("/api/v1/auth/login").header("Origin","https://evil.test").header("Access-Control-Request-Method","POST")).andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }
    @Test void loginInvalidatesOldCsrfTokenAndDoesNotPersistBearerIdentity() throws Exception {
        account(EMAIL);var result=mvc.perform(mutation("/api/v1/auth/login",Map.of("email",EMAIL,"password",PASSWORD))).andExpect(status().isOk()).andReturn();
        var oldCsrf=result.getRequest().getHeader("X-XSRF-TOKEN");var session=(MockHttpSession)result.getRequest().getSession(false);
        mvc.perform(post("/api/v1/auth/refresh").session(session).header("X-XSRF-TOKEN",oldCsrf).cookie(new Cookie(COOKIE,refreshCookie(result))).contentType("application/json").content("{}"))
            .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/me").session(session)).andExpect(status().isUnauthorized());
    }
    private String resetToken(){var user=users.findByEmailNormalized(EMAIL).orElseThrow();String raw=secrets.generate();accountTokens.saveAndFlush(new AccountToken(user,secrets.digest(raw),TokenPurpose.RESET_PASSWORD,clock.instant()));return raw;}
    @Test void passwordResetRevokesAllSessionsAndOldAccessImmediately() throws Exception {
        account(EMAIL);var a=signIn();var b=signIn();String raw=resetToken();
        mvc.perform(mutation("/api/v1/auth/reset-password",Map.of("token",raw,"password",NEW))).andExpect(status().isOk());
        me(a,401);me(b,401);mvc.perform(refresh(a.refresh())).andExpect(status().isUnauthorized());login(EMAIL,NEW);
        assertThat(passwords.matches(PASSWORD,users.findByEmailNormalized(EMAIL).orElseThrow().getPasswordHash())).isFalse();
    }
    @Test void failedSessionRevocationRollsBackPasswordAndTokenConsumption() throws Exception {
        account(EMAIL);var signed=signIn();String raw=resetToken();jdbc.execute("alter table collector.auth_sessions add constraint revoke_failure check(revoked_at is null) not valid");
        try{mvc.perform(mutation("/api/v1/auth/reset-password",Map.of("token",raw,"password",NEW))).andExpect(status().isInternalServerError());
            assertThat(passwords.matches(PASSWORD,users.findByEmailNormalized(EMAIL).orElseThrow().getPasswordHash())).isTrue();
            assertThat(accountTokens.findByTokenHashAndPurpose(secrets.digest(raw),TokenPurpose.RESET_PASSWORD).orElseThrow().getConsumedAt()).isNull();me(signed,200);
        }finally{jdbc.execute("alter table collector.auth_sessions drop constraint revoke_failure");}
    }
    @Test void failedLoginAndRefreshPersistenceRollbackEntireSessionMutation() throws Exception {
        account(EMAIL);jdbc.execute("alter table collector.session_tokens add constraint login_failure check(false) not valid");
        try{mvc.perform(mutation("/api/v1/auth/login",Map.of("email",EMAIL,"password",PASSWORD))).andExpect(status().isInternalServerError());assertThat(count("auth_sessions")).isZero();}
        finally{jdbc.execute("alter table collector.session_tokens drop constraint login_failure");}
        var signed=signIn();jdbc.execute("alter table collector.session_tokens add constraint rotate_failure check(rotated_at is null) not valid");
        try{mvc.perform(refresh(signed.refresh())).andExpect(status().isInternalServerError());assertThat(count("session_tokens")).isEqualTo(1);me(signed,200);}
        finally{jdbc.execute("alter table collector.session_tokens drop constraint rotate_failure");}
        mvc.perform(refresh(signed.refresh())).andExpect(status().isOk());
    }
    @Test void sessionAndSigningConfigurationSurviveRealApplicationRestart() throws Exception {
        account(EMAIL);var signed=signIn();context.close();open();me(signed,200);mvc.perform(refresh(signed.refresh())).andExpect(status().isOk());
        assertThat(context.getBean(Flyway.class).validateWithResult().validationSuccessful).isTrue();assertThat(context.getBean(Flyway.class).info().applied()).hasSize(17);
    }
    @Test void bearerOnlyLogoutIsIdempotentAndRevokesTheCurrentSession() throws Exception {
        account(EMAIL);var signed=signIn();
        for(int i=0;i<2;i++)mvc.perform(mutation("/api/v1/auth/logout",Map.of()).header("Authorization","Bearer "+signed.access())).andExpect(status().isNoContent());
        mvc.perform(refresh(signed.refresh())).andExpect(status().isUnauthorized());me(signed,401);
    }
    @Test void refreshRaceWindowClosesAtExactlyTwoSeconds() throws Exception {
        account(EMAIL);var signed=signIn();sessions.refresh(signed.refresh());clock.advance(2);
        mvc.perform(refresh(signed.refresh())).andExpect(status().isUnauthorized());me(signed,401);
    }
    @Test void replayRevokesOnlyItsFamilyAndPreservesOtherSessions() throws Exception {
        account(EMAIL);var replayed=signIn();var other=signIn();sessions.refresh(replayed.refresh());clock.advance(3);
        mvc.perform(refresh(replayed.refresh())).andExpect(status().isUnauthorized());me(replayed,401);me(other,200);
    }
    @Test void invalidBearerAndAmbiguousRefreshCookiesFailSafely() throws Exception {
        account(EMAIL);var signed=signIn();
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer malformed").header("X-Request-ID","invalid-bearer"))
            .andExpect(status().isUnauthorized()).andExpect(header().string("WWW-Authenticate","Bearer"))
            .andExpect(jsonPath("$.traceId").value("invalid-bearer")).andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
        mvc.perform(refresh(signed.refresh()).cookie(new Cookie(COOKIE,secrets.generate()))).andExpect(status().isUnauthorized());
        me(signed,200);
    }
    @Test void resetAndRefreshRaceCannotLeaveAnOldCredentialSessionAlive() throws Exception {
        account(EMAIL);var signed=signIn();String raw=resetToken();var go=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)){
            var resetting=pool.submit(()->{go.await();context.getBean(PasswordResetService.class).reset(new PasswordResetRequest(raw,NEW));return true;});
            var refreshing=pool.submit(()->{go.await();try{sessions.refresh(signed.refresh());return 200;}catch(ApiException invalid){return invalid.getStatus().value();}});
            go.countDown();assertThat(resetting.get(15,TimeUnit.SECONDS)).isTrue();assertThat(refreshing.get(15,TimeUnit.SECONDS)).isIn(200,401);
        }
        assertThat(jdbc.queryForObject("select count(*) from collector.auth_sessions where revoked_at is null",Long.class)).isZero();me(signed,401);
    }
    @ParameterizedTest @ValueSource(strings={"MALFORMED","UNKNOWN"})
    void invalidCookieCannotPreventLogoutOfAValidBearerSession(String mode) throws Exception {
        account(EMAIL);var signed=signIn();String cookie=mode.equals("MALFORMED")?"bad":secrets.generate();
        mvc.perform(mutation("/api/v1/auth/logout",Map.of()).cookie(new Cookie(COOKIE,cookie)).header("Authorization","Bearer "+signed.access()))
            .andExpect(status().isNoContent());
        me(signed,401);mvc.perform(refresh(signed.refresh())).andExpect(status().isUnauthorized());
    }
    @Test void revokedAccessAndRefreshRemainRevokedAfterRestart() throws Exception {
        account(EMAIL);var signed=signIn();sessions.logout(signed.refresh());context.close();open();
        me(signed,401);mvc.perform(refresh(signed.refresh())).andExpect(status().isUnauthorized());
    }
    @Test void signedTokenCannotBindOneUserToAnotherUsersSession() throws Exception {
        var first=account(EMAIL);account("other@example.test");var other=login("other@example.test",PASSWORD);
        String mismatched=context.getBean(AccessTokens.class).issue(first.getId(),other.sid());
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+mismatched)).andExpect(status().isUnauthorized());me(other,200);
    }
    @Test void upgradeFromV4PreservesExistingAccountAndQueuedDelivery(){
        jdbc.execute("create database session_upgrade");var source=new DriverManagerDataSource("jdbc:postgresql://"+POSTGRES.getHost()+":"+POSTGRES.getMappedPort(5432)+"/session_upgrade",POSTGRES.getUsername(),POSTGRES.getPassword());
        var data=new JdbcTemplate(source);Flyway.configure().dataSource(source).target("4").load().migrate();
        String hash=passwords.encode(PASSWORD);data.update("insert into collector.users(email_normalized,display_name,password_hash) values (?,'Synthetic',?)",EMAIL,hash);
        byte[] encrypted={1,2,3};data.update("insert into collector.outbox_jobs(job_type,payload_json,encrypted_payload,encryption_key_id,dedupe_key,state) values ('VERIFY_EMAIL','{}',?,'test','preserve','QUEUED')",encrypted);
        var flyway=Flyway.configure().dataSource(source).load();flyway.migrate();assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
        assertThat(data.queryForObject("select password_hash from collector.users",String.class)).isEqualTo(hash);
        assertThat(data.queryForObject("select encrypted_payload from collector.outbox_jobs",byte[].class)).containsExactly(encrypted);
    }
}

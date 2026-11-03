package com.ayaantrix.collector.workspace;
import com.ayaantrix.collector.workspace.entity.*;
import com.ayaantrix.collector.workspace.dto.*;
import com.ayaantrix.collector.workspace.repository.*;
import com.ayaantrix.collector.workspace.service.*;

import com.ayaantrix.collector.CollectorApplication;
import com.ayaantrix.collector.auth.entity.UserAccount;
import com.ayaantrix.collector.auth.repository.UserAccountRepository;
import com.ayaantrix.collector.auth.security.*;
import com.ayaantrix.collector.auth.service.AgencySessions;
import com.ayaantrix.collector.auth.dto.LoginRequest;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.web.RequestTraceFilter;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.json.JsonMapper;
import java.nio.file.Path;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Testcontainers @TestInstance(TestInstance.Lifecycle.PER_CLASS)
class WorkspaceFoundationTests {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse(
        "public.ecr.aws/docker/library/postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873").asCompatibleSubstituteFor("postgres"));
    @TempDir static Path directory;
    static final Instant NOW=Instant.parse("2026-10-27T08:00:00Z");
    static final String PASSWORD="synthetic workspace password",ROOT="/api/v1/workspaces";
    static class TestClock extends Clock {
        final AtomicReference<Instant> now=new AtomicReference<>(NOW);
        public ZoneId getZone(){return ZoneOffset.UTC;} public Clock withZone(ZoneId zone){return this;} public Instant instant(){return now.get();}
    }
    @org.springframework.boot.test.context.TestConfiguration(proxyBeanMethods=false)
    static class Configuration { @Bean @Primary TestClock workspaceClock(){return new TestClock();} }
    record Actor(UUID id,String access,Jwt jwt){@Override public String toString(){return "SyntheticActor[redacted]";}}
    private ConfigurableApplicationContext context;private SigningKeyFixture keys;private JdbcTemplate jdbc;private JsonMapper json;
    private MockMvc mvc;private UserAccountRepository users;private WorkspaceService service;private TestClock clock;
    private TransactionTemplate tx;private String passwordHash;
    @BeforeAll void start() throws Exception {keys=SigningKeyFixture.create(directory,"workspace-test");open();passwordHash=context.getBean(PasswordEncoder.class).encode(PASSWORD);}
    private void open(){
        context=new SpringApplicationBuilder(CollectorApplication.class,Configuration.class).profiles("test").run(
            "--server.port=0","--spring.datasource.url="+POSTGRES.getJdbcUrl(),"--spring.datasource.username="+POSTGRES.getUsername(),"--spring.datasource.password="+POSTGRES.getPassword(),
            "--collector.jwt.private-key="+keys.privateFile(),"--collector.jwt.public-keys="+keys.publicFile(),"--collector.jwt.key-id="+keys.kid(),
            "--collector.jwt.issuer=https://workspace.test","--collector.jwt.audience=collector-api","--collector.auth.token-hash-pepper="+Base64.getEncoder().encodeToString(new byte[32]),
            "--collector.delivery.worker-enabled=false");
        jdbc=context.getBean(JdbcTemplate.class);json=context.getBean(JsonMapper.class);users=context.getBean(UserAccountRepository.class);
        service=context.getBean(WorkspaceService.class);clock=context.getBean(TestClock.class);tx=new TransactionTemplate(context.getBean(PlatformTransactionManager.class));
        mvc=MockMvcBuilders.webAppContextSetup((WebApplicationContext)context).apply(springSecurity()).addFilters(context.getBean(RequestTraceFilter.class)).build();
    }
    @AfterAll void stop(){if(context!=null)context.close();}
    @BeforeEach void reset(){
        SecurityContextHolder.clearContext();clock.now.set(NOW);
        for(String table:List.of("subscriptions","workspace_members","workspaces","session_tokens","auth_sessions","outbox_jobs","access_tokens","users","account_request_limits"))jdbc.update("delete from collector."+table);
    }
    private Actor actor(String email){
        var user=new UserAccount(email,"Synthetic User",passwordHash,NOW);user.markVerified(NOW);users.saveAndFlush(user);
        var issued=context.getBean(AgencySessions.class).login(new LoginRequest(email,PASSWORD));
        return new Actor(user.getId(),issued.accessToken(),context.getBean(AccessTokens.class).decode(issued.accessToken()));
    }
    private <T>T as(Actor actor,Supplier<T> operation){
        var previous=SecurityContextHolder.getContext();var security=SecurityContextHolder.createEmptyContext();
        security.setAuthentication(new JwtAuthenticationToken(actor.jwt(),List.of()));SecurityContextHolder.setContext(security);
        try{return operation.get();}finally{SecurityContextHolder.setContext(previous);}
    }
    private WorkspaceDtos.View create(Actor actor){return as(actor,()->service.create(new WorkspaceDtos.Create("Workspace","UTC",PlanKey.AGENCY)));}
    private long count(String table){return jdbc.queryForObject("select count(*) from collector."+table,Long.class);}
    private MockHttpServletRequestBuilder write(String method,String path,Object body,Actor actor) throws Exception {
        var csrf=mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isOk()).andReturn();
        return (method.equals("PATCH")?patch(path):post(path)).session((MockHttpSession)csrf.getRequest().getSession(false))
            .header("X-XSRF-TOKEN",json.readTree(csrf.getResponse().getContentAsString()).get("token").asText())
            .header("Authorization","Bearer "+actor.access()).header("X-Request-ID","workspace-test").contentType("application/json").content(json.writeValueAsString(body));
    }
    private void member(UUID workspace,Actor actor){
        tx.executeWithoutResult(s->context.getBean(WorkspaceMemberRepository.class).saveAndFlush(new WorkspaceMember(workspace,actor.id(),WorkspaceRole.MEMBER,NOW)));
    }
    @ParameterizedTest @ValueSource(strings={"SOLO","AGENCY"})
    void createsOwnerAndLocalTrialAtomicallyWithExactPlanDefinitions(String plan) throws Exception {
        var owner=actor("owner@example.test");
        var result=mvc.perform(write("POST",ROOT,Map.of("name","  My studio  ","timezone","Asia/Kabul","planKey",plan),owner))
            .andExpect(status().isCreated()).andExpect(header().string("X-Request-ID","workspace-test"))
            .andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.workspace.name").value("My studio"))
            .andExpect(jsonPath("$.workspace.state").value("ACTIVE")).andExpect(jsonPath("$.workspace.version").value(0)).andReturn();
        UUID id=UUID.fromString(json.readTree(result.getResponse().getContentAsString()).at("/workspace/id").asText());
        assertThat(count("workspaces")).isEqualTo(1);assertThat(count("workspace_members")).isEqualTo(1);assertThat(count("subscriptions")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select user_id from collector.workspace_members where workspace_id=? and role='OWNER' and state='ACTIVE'",UUID.class,id)).isEqualTo(owner.id());
        assertThat(jdbc.queryForObject("select current_period_end from collector.subscriptions",Instant.class)).isEqualTo(NOW.plus(Duration.ofDays(14)));
        mvc.perform(get(ROOT+"/"+id).header("Authorization","Bearer "+owner.access())).andExpect(status().isOk())
            .andExpect(jsonPath("$.entitlements.planKey").value(plan)).andExpect(jsonPath("$.entitlements.seats").value(plan.equals("SOLO")?1:5))
            .andExpect(jsonPath("$.entitlements.storageLimitBytes").value(50_000_000_000L)).andExpect(jsonPath("$.entitlements.canWrite").value(true))
            .andExpect(jsonPath("$.entitlements.aiDraftAllowance").value(0)).andExpect(jsonPath("$.entitlements.aiEnabled").value(false))
            .andExpect(jsonPath("$.entitlements.smsEnabled").value(false));
        assertThat(PlanKey.SOLO.aiDrafts()).isEqualTo(100);assertThat(PlanKey.AGENCY.aiDrafts()).isEqualTo(300);
        assertThat(PlanKey.SOLO.smsSegments()).isEqualTo(25);assertThat(PlanKey.AGENCY.smsSegments()).isEqualTo(100);
    }
    @Test void omittedPlanAndTimezoneUseSafeSpecificationDefaults() throws Exception {
        var owner=actor("owner@example.test");mvc.perform(write("POST",ROOT,Map.of("name","Studio"),owner)).andExpect(status().isCreated()).andExpect(jsonPath("$.workspace.timezone").value("America/Chicago"));
        assertThat(jdbc.queryForObject("select plan_key from collector.subscriptions",String.class)).isEqualTo("SOLO");
    }
    @ParameterizedTest @ValueSource(strings={"", "Mars/Olympus", "GMT+10", " Asia/Kabul"})
    void invalidTimezoneCannotLeavePartialWorkspace(String timezone) throws Exception {
        var owner=actor("owner@example.test");mvc.perform(write("POST",ROOT,Map.of("name","Studio","timezone",timezone),owner)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));assertThat(count("workspaces")).isZero();
    }
    @Test void unknownPlanAndInvalidFieldsFailBeforePersistence() throws Exception {
        var owner=actor("owner@example.test");
        for(var body:List.of(Map.of("name","Studio","planKey","ENTERPRISE"),Map.of("name"," "),Map.of("name","x".repeat(151))))
            mvc.perform(write("POST",ROOT,body,owner)).andExpect(status().isBadRequest());
        assertThat(count("workspaces")).isZero();
    }
    @Test void userCanOwnOnlyOneWorkspaceAndCanJoinAnotherAsMember() throws Exception {
        var one=actor("one@example.test");var two=actor("two@example.test");var a=create(one);var b=create(two);member(b.id(),one);
        mvc.perform(write("POST",ROOT,Map.of("name","Duplicate"),one)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("WORKSPACE_ALREADY_OWNED"));
        mvc.perform(get(ROOT).header("Authorization","Bearer "+one.access())).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(2));
        assertThat(as(one,service::list)).extracting(WorkspaceDtos.Membership::role).containsExactlyInAnyOrder(WorkspaceRole.OWNER,WorkspaceRole.MEMBER);
        assertThat(count("workspaces")).isEqualTo(2);
    }
    @Test void scopedRepositoriesHaveNoGlobalFindAllOrUnscopedIdShortcut(){
        assertThat(Arrays.stream(WorkspaceRepository.class.getMethods()).map(java.lang.reflect.Method::getName)).doesNotContain("findAll","findById","deleteById");
        assertThat(Arrays.stream(WorkspaceMemberRepository.class.getMethods()).map(java.lang.reflect.Method::getName)).doesNotContain("findAll","findById");
        assertThat(Arrays.stream(WorkspaceSubscriptionRepository.class.getMethods()).map(java.lang.reflect.Method::getName)).doesNotContain("findAll","findById");
    }
    @Test void unrelatedTenantsCannotReadModifyOrRetrieveEachOthersPlan() throws Exception {
        var one=actor("one@example.test");var two=actor("two@example.test");var a=create(one);var b=create(two);
        for(UUID id:List.of(b.id(),UUID.randomUUID())){
            mvc.perform(get(ROOT+"/"+id).header("Authorization","Bearer "+one.access())).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
            mvc.perform(write("PATCH",ROOT+"/"+id,Map.of("name","stolen","expectedVersion",0),one)).andExpect(status().isNotFound());
        }
        mvc.perform(get(ROOT).header("Authorization","Bearer "+one.access())).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1)).andExpect(jsonPath("$.data[0].workspaceId").value(a.id().toString()));
        assertThat(as(two,()->service.read(b.id())).workspace().name()).isEqualTo("Workspace");
    }
    @Test void memberReadsOwnWorkspaceButCannotPerformOwnerWrite() throws Exception {
        var owner=actor("owner@example.test");var member=actor("member@example.test");var w=create(owner);member(w.id(),member);
        mvc.perform(get(ROOT+"/"+w.id()).header("Authorization","Bearer "+member.access())).andExpect(status().isOk());
        mvc.perform(write("PATCH",ROOT+"/"+w.id(),Map.of("name","Denied","expectedVersion",0),member)).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }
    @ParameterizedTest @ValueSource(strings={"DISABLED","REMOVED"})
    void inactiveOrRemovedMembershipImmediatelyDeniesAccess(String state) throws Exception {
        var owner=actor("owner@example.test");var member=actor("member@example.test");var w=create(owner);member(w.id(),member);
        if(state.equals("DISABLED"))jdbc.update("update collector.workspace_members set state='DISABLED' where workspace_id=? and user_id=?",w.id(),member.id());
        else jdbc.update("delete from collector.workspace_members where workspace_id=? and user_id=?",w.id(),member.id());
        mvc.perform(get(ROOT+"/"+w.id()).header("Authorization","Bearer "+member.access())).andExpect(status().isNotFound());
        mvc.perform(get(ROOT).header("Authorization","Bearer "+member.access())).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(0));
    }
    @ParameterizedTest @ValueSource(strings={"DISABLED","UNVERIFIED"})
    void accountEligibilityIsRecheckedForCreationAndExistingAccess(String state) throws Exception {
        var owner=actor("owner@example.test");var w=create(owner);
        jdbc.update("update collector.users set state=?,verified_at=case when ?='UNVERIFIED' then null else verified_at end where id=?",state,state,owner.id());
        mvc.perform(get(ROOT+"/"+w.id()).header("Authorization","Bearer "+owner.access())).andExpect(status().isUnauthorized());
        assertThatThrownBy(()->as(owner,()->service.create(new WorkspaceDtos.Create("Denied","UTC",null)))).isInstanceOf(ApiException.class);
        assertThat(count("workspaces")).isEqualTo(1);
    }
    @Test void noJwtMeansNoServiceCreation(){
        assertThatThrownBy(()->service.create(new WorkspaceDtos.Create("Denied","UTC",null))).isInstanceOf(ApiException.class).extracting(e->((ApiException)e).getStatus().value()).isEqualTo(401);
        assertThat(count("workspaces")).isZero();
    }
    @Test void jwtRevocationIsRecheckedByWorkspaceService(){
        var owner=actor("owner@example.test");var w=create(owner);context.getBean(AgencySessions.class).logoutAll(owner.jwt());
        assertThatThrownBy(()->as(owner,()->service.read(w.id()))).isInstanceOf(ApiException.class);
    }
    @Test void ownerSettingsUpdateReturnsNewVersionAndRejectsStaleWrite() throws Exception {
        var owner=actor("owner@example.test");var w=create(owner);
        mvc.perform(write("PATCH",ROOT+"/"+w.id(),Map.of("name","Updated","timezone","Asia/Kabul","expectedVersion",0),owner))
            .andExpect(status().isOk()).andExpect(jsonPath("$.workspace.version").value(1));
        mvc.perform(write("PATCH",ROOT+"/"+w.id(),Map.of("name","Stale","expectedVersion",0),owner)).andExpect(status().isConflict());
        mvc.perform(write("PATCH",ROOT+"/"+w.id(),Map.of("name","Missing version"),owner)).andExpect(status().isBadRequest());
    }
    @Test void optimisticVersionBeyondBoxedLongCacheUsesNumericEquality() throws Exception {
        var owner=actor("owner@example.test");var w=create(owner);
        jdbc.update("update collector.workspaces set version=128 where id=?",w.id());
        mvc.perform(write("PATCH",ROOT+"/"+w.id(),Map.of("name","Updated at 128","expectedVersion",128),owner))
            .andExpect(status().isOk()).andExpect(jsonPath("$.workspace.version").value(129));
        mvc.perform(write("PATCH",ROOT+"/"+w.id(),Map.of("name","Stale","expectedVersion",128),owner)).andExpect(status().isConflict());
    }
    @Test void bodyUserOwnerPlanAndStateCannotEscalatePrivileges() throws Exception {
        var owner=actor("owner@example.test");var other=actor("other@example.test");
        var result=mvc.perform(write("POST",ROOT,Map.of("name","Studio","userId",other.id(),"state","ACTIVE","subscriptionState","ACTIVE"),owner)).andExpect(status().isCreated()).andReturn();
        UUID id=UUID.fromString(json.readTree(result.getResponse().getContentAsString()).at("/workspace/id").asText());
        assertThat(jdbc.queryForObject("select user_id from collector.workspace_members",UUID.class)).isEqualTo(owner.id());
        mvc.perform(write("PATCH",ROOT+"/"+id,Map.of("expectedVersion",0,"planKey","AGENCY","ownerId",other.id(),"state","ACTIVE"),owner)).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select plan_key from collector.subscriptions",String.class)).isEqualTo("SOLO");
        assertThat(jdbc.queryForObject("select state from collector.subscriptions",String.class)).isEqualTo("TRIALING");
    }
    @Test void missingEntitlementFailsClosedWithoutLeakingAnotherPlan(){
        var owner=actor("owner@example.test");var w=create(owner);jdbc.update("delete from collector.subscriptions where workspace_id=?",w.id());
        var e=as(owner,()->service.read(w.id())).entitlements();assertThat(e.canWrite()).isFalse();assertThat(e.seats()).isZero();assertThat(e.storageLimitBytes()).isZero();
        assertThatThrownBy(()->as(owner,()->service.update(w.id(),new WorkspaceDtos.Update("Denied",null,0L)))).isInstanceOf(ApiException.class);
    }
    @Test void trialExpiryChecksClockAtExactBoundaryWithoutCleanupJob(){
        var owner=actor("owner@example.test");var w=create(owner);
        // Service uses the real session checker; keep that session usable to isolate entitlement expiry.
        jdbc.update("update collector.auth_sessions set expires_at=?,idle_expires_at=?",java.sql.Timestamp.from(NOW.plus(Duration.ofDays(20))),java.sql.Timestamp.from(NOW.plus(Duration.ofDays(20))));
        clock.now.set(NOW.plus(Duration.ofDays(14)).minusSeconds(1));assertThat(as(owner,()->service.read(w.id())).entitlements().canWrite()).isTrue();
        clock.now.set(NOW.plus(Duration.ofDays(14)));assertThat(as(owner,()->service.read(w.id())).entitlements().canWrite()).isFalse();
    }
    @ParameterizedTest @ValueSource(strings={"READ_ONLY","SUSPENDED","DELETION_PENDING"})
    void workspaceStateBlocksWritesEvenWithUnexpiredTrial(String state){
        var owner=actor("owner@example.test");var w=create(owner);jdbc.update("update collector.workspaces set state=? where id=?",state,w.id());
        assertThat(as(owner,()->service.read(w.id())).entitlements().canWrite()).isFalse();
        assertThatThrownBy(()->as(owner,()->service.update(w.id(),new WorkspaceDtos.Update("Denied",null,0L)))).isInstanceOf(ApiException.class);
    }
    @ParameterizedTest @ValueSource(strings={"workspace_members","subscriptions"})
    void failedOwnerOrTrialInsertRollsBackEntireCreation(String table) throws Exception {
        var owner=actor("owner@example.test");jdbc.execute("alter table collector."+table+" add constraint creation_failure check(false) not valid");
        try{mvc.perform(write("POST",ROOT,Map.of("name","Rollback"),owner)).andExpect(status().isInternalServerError());
            assertThat(count("workspaces")).isZero();assertThat(count("workspace_members")).isZero();assertThat(count("subscriptions")).isZero();
        }finally{jdbc.execute("alter table collector."+table+" drop constraint creation_failure");}
    }
    @ParameterizedTest @ValueSource(strings={"duplicate_member","duplicate_owner","second_owned","foreign_workspace","foreign_user","invalid_role","invalid_state","duplicate_plan","negative_storage","invalid_period","invalid_plan"})
    void postgresEnforcesCriticalIntegrity(String scenario){
        var owner=actor("owner@example.test");var other=actor("other@example.test");var a=create(owner);var b=create(other);
        Runnable violation=switch(scenario){
            case "duplicate_member" -> ()->jdbc.update("insert into collector.workspace_members(workspace_id,user_id,role) values (?,?,'MEMBER')",a.id(),owner.id());
            case "duplicate_owner" -> ()->jdbc.update("insert into collector.workspace_members(workspace_id,user_id,role) values (?,?,'OWNER')",a.id(),other.id());
            case "second_owned" -> ()->{var extra=UUID.randomUUID();jdbc.update("insert into collector.workspaces(id,name) values (?,'extra')",extra);jdbc.update("insert into collector.workspace_members(workspace_id,user_id,role) values (?,?,'OWNER')",extra,owner.id());};
            case "foreign_workspace" -> ()->jdbc.update("insert into collector.workspace_members(workspace_id,user_id,role) values (?,?,'MEMBER')",UUID.randomUUID(),owner.id());
            case "foreign_user" -> ()->jdbc.update("insert into collector.workspace_members(workspace_id,user_id,role) values (?,?,'MEMBER')",a.id(),UUID.randomUUID());
            case "invalid_role" -> ()->jdbc.update("update collector.workspace_members set role='ADMIN' where workspace_id=?",a.id());
            case "invalid_state" -> ()->jdbc.update("update collector.workspace_members set state='REVOKED' where workspace_id=?",a.id());
            case "duplicate_plan" -> ()->jdbc.update("insert into collector.subscriptions(workspace_id,plan_key,state,current_period_start,current_period_end) select workspace_id,plan_key,state,current_period_start,current_period_end from collector.subscriptions where workspace_id=?",a.id());
            case "negative_storage" -> ()->jdbc.update("update collector.workspaces set storage_reserved_bytes=-1 where id=?",a.id());
            case "invalid_period" -> ()->jdbc.update("update collector.subscriptions set current_period_end=current_period_start where workspace_id=?",a.id());
            default -> ()->jdbc.update("update collector.subscriptions set plan_key='UNLIMITED' where workspace_id=?",a.id());
        };
        assertThatThrownBy(violation::run).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(as(other,()->service.read(b.id())).workspace().id()).isEqualTo(b.id());
    }
    @Test void csrfAnonymousCorsAndClosedFutureRoutesRemainProtected() throws Exception {
        var owner=actor("owner@example.test");var w=create(owner);
        mvc.perform(get(ROOT)).andExpect(status().isUnauthorized());mvc.perform(get(ROOT+"/"+w.id())).andExpect(status().isUnauthorized());
        mvc.perform(write("POST",ROOT,Map.of("name","Anonymous"),owner).with(request->{request.removeHeader("Authorization");return request;})).andExpect(status().isUnauthorized());
        mvc.perform(post(ROOT).header("Authorization","Bearer "+owner.access()).contentType("application/json").content("{\"name\":\"Denied\"}"))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        mvc.perform(patch(ROOT+"/"+w.id()).header("Authorization","Bearer "+owner.access()).contentType("application/json").content("{}")) .andExpect(status().isForbidden());
        mvc.perform(options(ROOT).header("Origin","https://untrusted.example").header("Access-Control-Request-Method","POST"))
            .andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
        for(String suffix:List.of("/members/closed/extra","/projects/closed/sections","/ownership-transfer"))
            mvc.perform(get(ROOT+"/"+w.id()+suffix).header("Authorization","Bearer "+owner.access())).andExpect(status().isForbidden());
        var result=mvc.perform(get(ROOT+"/"+UUID.randomUUID()).header("Authorization","Bearer "+owner.access()).header("X-Request-ID","tenant-safe"))
            .andExpect(status().isNotFound()).andExpect(header().string("X-Request-ID","tenant-safe")).andExpect(jsonPath("$.traceId").value("tenant-safe")).andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain(owner.id().toString(),w.id().toString(),"password", "subscription");
    }
    @Test void concurrentCreationHasExactlyOneCompleteWinner() throws Exception {
        var owner=actor("owner@example.test");var ready=new CountDownLatch(2);var go=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)){
            Callable<Integer> task=()->{ready.countDown();go.await();try{as(owner,()->service.create(new WorkspaceDtos.Create("Concurrent","UTC",null)));return 201;}catch(ApiException e){return e.getStatus().value();}};
            var a=pool.submit(task);var b=pool.submit(task);assertThat(ready.await(5,TimeUnit.SECONDS)).isTrue();go.countDown();
            assertThat(List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder(201,409);
        }finally{go.countDown();}
        assertThat(count("workspaces")).isEqualTo(1);assertThat(count("workspace_members")).isEqualTo(1);assertThat(count("subscriptions")).isEqualTo(1);
    }
    @Test void concurrentOwnerUpdatesHaveOneVersionWinner() throws Exception {
        var owner=actor("owner@example.test");var w=create(owner);var go=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)){
            Callable<Integer> task=()->{go.await();try{as(owner,()->service.update(w.id(),new WorkspaceDtos.Update(UUID.randomUUID().toString(),null,0L)));return 200;}catch(ApiException e){return e.getStatus().value();}};
            var a=pool.submit(task);var b=pool.submit(task);go.countDown();assertThat(List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder(200,409);
        }finally{go.countDown();}
    }
    @ParameterizedTest @ValueSource(strings={"DEMOTE","DISABLE"})
    void committedMembershipChangeDuringBlockedWriteIsRechecked(String changeKind) throws Exception {
        var owner=actor("owner@example.test");var successor=actor("successor@example.test");var w=create(owner);member(w.id(),successor);
        var locked=new CountDownLatch(1);var release=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)){
            var change=pool.submit(()->tx.executeWithoutResult(s->{
                jdbc.queryForObject("select id from collector.workspaces where id=? for update",UUID.class,w.id());locked.countDown();
                try{if(!release.await(10,TimeUnit.SECONDS))throw new IllegalStateException("Test synchronization failed.");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}
                jdbc.update("update collector.workspace_members set role='MEMBER',state=? where workspace_id=? and user_id=?",changeKind.equals("DISABLE")?"DISABLED":"ACTIVE",w.id(),owner.id());
                jdbc.update("update collector.workspace_members set role='OWNER' where workspace_id=? and user_id=?",w.id(),successor.id());
            }));
            assertThat(locked.await(5,TimeUnit.SECONDS)).isTrue();
            var write=pool.submit(()->{try{as(owner,()->service.update(w.id(),new WorkspaceDtos.Update("Denied",null,0L)));return 200;}catch(ApiException e){return e.getStatus().value();}});
            // Prove the command has reached the PostgreSQL lock, rather than relying on thread timing.
            long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
            while(jdbc.queryForObject("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%workspaces%' and pid<>pg_backend_pid()",Integer.class)==0 && System.nanoTime()<deadline)Thread.sleep(10);
            assertThat(jdbc.queryForObject("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%workspaces%' and pid<>pg_backend_pid()",Integer.class)).isGreaterThan(0);
            release.countDown();change.get(15,TimeUnit.SECONDS);assertThat(write.get(15,TimeUnit.SECONDS)).isEqualTo(changeKind.equals("DISABLE")?404:403);
        }finally{release.countDown();}
        assertThat(as(successor,()->service.read(w.id())).workspace().name()).isEqualTo("Workspace");
    }
    @Test void cleanMigrationsHibernateValidationAndRestartPreserveTenantState(){
        var owner=actor("owner@example.test");var w=create(owner);context.close();open();
        assertThat(context.getBean(Flyway.class).validateWithResult().validationSuccessful).isTrue();assertThat(context.getBean(Flyway.class).info().applied()).hasSize(23);
        assertThat(context.getEnvironment().getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("validate");
        assertThat(as(owner,()->service.read(w.id())).workspace().id()).isEqualTo(w.id());assertThat(count("workspace_members")).isEqualTo(1);
    }
    @Test void upgradeFromV5PreservesIdentityAndPersistentSessions(){
        jdbc.execute("create database workspace_upgrade");var source=new DriverManagerDataSource("jdbc:postgresql://"+POSTGRES.getHost()+":"+POSTGRES.getMappedPort(5432)+"/workspace_upgrade",POSTGRES.getUsername(),POSTGRES.getPassword());
        var data=new JdbcTemplate(source);Flyway.configure().dataSource(source).target("5").load().migrate();UUID user=UUID.randomUUID(),session=UUID.randomUUID();
        data.update("insert into collector.users(id,email_normalized,display_name,password_hash) values (?,'upgrade@example.test','Synthetic',?)",user,passwordHash);
        data.update("insert into collector.auth_sessions(id,user_id,principal_kind,family_id,expires_at,idle_expires_at,created_at,updated_at,last_seen_at) values (?,?,'USER',?,now()+interval '14 days',now()+interval '7 days',now(),now(),now())",session,user,session);
        var upgrade=Flyway.configure().dataSource(source).load();upgrade.migrate();assertThat(upgrade.validateWithResult().validationSuccessful).isTrue();
        assertThat(data.queryForObject("select count(*) from collector.auth_sessions where id=?",Integer.class,session)).isEqualTo(1);
        assertThat(data.queryForObject("select password_hash from collector.users where id=?",String.class,user)).isEqualTo(passwordHash);
        assertThat(data.queryForObject("select count(*) from collector.workspaces",Integer.class)).isZero();
    }
    private MvcResult me(Actor actor) throws Exception {
        return mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+actor.access()).header("X-Request-ID","membership-test"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(header().string("X-Request-ID","membership-test")).andReturn();
    }
    @Test void mePreservesUserAndEmptyMembershipContractWithoutCreatingWorkspace() throws Exception {
        var owner=actor("owner@example.test");var result=me(owner);
        var body=json.readTree(result.getResponse().getContentAsString());assertThat(body.at("/user/id").asText()).isEqualTo(owner.id().toString());
        assertThat(body.at("/user/verified").asBoolean()).isTrue();assertThat(body.get("memberships").size()).isZero();assertThat(count("workspaces")).isZero();
        mvc.perform(get("/api/v1/auth/me").header("Authorization","Bearer "+owner.access())).andExpect(status().isForbidden());
    }
    @Test void creationImmediatelyAppearsInMeWithUnchangedAccessJwtAndConsistentTrial() throws Exception {
        var owner=actor("owner@example.test");me(owner);var w=create(owner);var body=json.readTree(me(owner).getResponse().getContentAsString());
        assertThat(body.get("memberships").size()).isEqualTo(1);var membership=body.at("/memberships/0");
        assertThat(membership.get("workspaceId").asText()).isEqualTo(w.id().toString());assertThat(membership.get("workspaceName").asText()).isEqualTo("Workspace");
        assertThat(membership.get("role").asText()).isEqualTo("OWNER");assertThat(membership.properties()).hasSize(4);
        assertThat(membership.get("memberId").asText()).isEqualTo(jdbc.queryForObject("select id from collector.workspace_members where workspace_id=?",UUID.class,w.id()).toString());
        mvc.perform(get(ROOT+"/"+w.id()).header("Authorization","Bearer "+owner.access())).andExpect(status().isOk()).andExpect(jsonPath("$.entitlements.planKey").value("AGENCY"));
    }
    @Test void meProjectsOnlyOwnActiveOwnerAndMemberWorkspacesInOneJoin() throws Exception {
        var owner=actor("owner@example.test");var second=actor("second@example.test");var unrelated=actor("unrelated@example.test");
        var a=create(owner);var b=create(second);var c=create(unrelated);member(b.id(),owner);
        var body=json.readTree(me(owner).getResponse().getContentAsString());assertThat(body.get("memberships").size()).isEqualTo(2);
        assertThat(body.toString()).contains(a.id().toString(),b.id().toString(),"OWNER","MEMBER").doesNotContain(c.id().toString(),second.id().toString(),unrelated.id().toString());
        // DTO constructor projection is a single workspace/member join, not entity traversal/N+1.
        var memberships=context.getBean(WorkspaceRepository.class).memberships(owner.id());assertThat(memberships).hasSize(2);
    }
    @ParameterizedTest @ValueSource(strings={"DISABLED","REMOVED"})
    void meExcludesMembershipImmediatelyAfterDisableOrRemoval(String state) throws Exception {
        var owner=actor("owner@example.test");var member=actor("member@example.test");var w=create(owner);member(w.id(),member);
        assertThat(json.readTree(me(member).getResponse().getContentAsString()).get("memberships").size()).isEqualTo(1);
        if(state.equals("DISABLED"))jdbc.update("update collector.workspace_members set state='DISABLED' where workspace_id=? and user_id=?",w.id(),member.id());
        else jdbc.update("delete from collector.workspace_members where workspace_id=? and user_id=?",w.id(),member.id());
        assertThat(json.readTree(me(member).getResponse().getContentAsString()).get("memberships").size()).isZero();
        mvc.perform(get(ROOT+"/"+w.id()).header("Authorization","Bearer "+member.access())).andExpect(status().isNotFound());
    }
    @Test void meReflectsRoleAndNameChangesWithoutReissuingJwt() throws Exception {
        var owner=actor("owner@example.test");var member=actor("member@example.test");var w=create(owner);member(w.id(),member);me(owner);
        tx.executeWithoutResult(t->{jdbc.update("update collector.workspace_members set role='MEMBER' where workspace_id=? and user_id=?",w.id(),owner.id());
            jdbc.update("update collector.workspace_members set role='OWNER' where workspace_id=? and user_id=?",w.id(),member.id());
            jdbc.update("update collector.workspaces set name='Renamed' where id=?",w.id());});
        var body=json.readTree(me(owner).getResponse().getContentAsString());assertThat(body.at("/memberships/0/role").asText()).isEqualTo("MEMBER");
        assertThat(body.at("/memberships/0/workspaceName").asText()).isEqualTo("Renamed");
        mvc.perform(write("PATCH",ROOT+"/"+w.id(),Map.of("name","Denied","expectedVersion",0),owner)).andExpect(status().isForbidden());
    }
    @Test void membershipProjectionAfterRefreshUsesDatabaseNotOldTokenClaims() throws Exception {
        var owner=actor("owner@example.test");var w=create(owner);var sessions=context.getBean(AgencySessions.class);
        var issued=sessions.login(new LoginRequest("owner@example.test",PASSWORD));
        var refreshed=sessions.refresh(issued.refreshToken());
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+refreshed.accessToken())).andExpect(status().isOk())
            .andExpect(jsonPath("$.memberships[0].workspaceId").value(w.id().toString()));
        var jwt=context.getBean(AccessTokens.class).decode(refreshed.accessToken());assertThat(jwt.getClaims()).doesNotContainKeys("memberships","roles","workspaceId");
    }
    @ParameterizedTest @ValueSource(strings={"DISABLED","REVOKED"})
    void meNeverProjectsMembershipForDisabledAccountOrRevokedSession(String state) throws Exception {
        var owner=actor("owner@example.test");create(owner);
        if(state.equals("DISABLED"))jdbc.update("update collector.users set state='DISABLED' where id=?",owner.id());
        else context.getBean(AgencySessions.class).logoutAll(owner.jwt());
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+owner.access()).header("X-Request-ID","revoked-me"))
            .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.memberships").doesNotExist()).andExpect(jsonPath("$.traceId").value("revoked-me"));
    }
    @Test void meIgnoresForgedUserQueryAndWorkspaceHeaders() throws Exception {
        var owner=actor("owner@example.test");var other=actor("other@example.test");var a=create(owner);var b=create(other);
        var result=mvc.perform(get("/api/v1/me").param("userId",other.id().toString()).header("X-Workspace-ID",b.id().toString()).header("Authorization","Bearer "+owner.access()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.user.id").value(owner.id().toString())).andReturn();
        assertThat(result.getResponse().getContentAsString()).contains(a.id().toString()).doesNotContain(b.id().toString(),other.id().toString());
    }
    @Test void persistedMembershipProjectionAndAuthorizationSurviveRestart() throws Exception {
        var owner=actor("owner@example.test");var w=create(owner);me(owner);context.close();open();
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+owner.access())).andExpect(status().isOk()).andExpect(jsonPath("$.memberships[0].workspaceId").value(w.id().toString()));
        mvc.perform(get(ROOT+"/"+w.id()).header("Authorization","Bearer "+owner.access())).andExpect(status().isOk());
    }
    @Test void passwordResetRevokesWorkspaceAndMeAccessTogether() throws Exception {
        var owner=actor("owner@example.test");var w=create(owner);var secrets=context.getBean(SecureAccountTokens.class);String reset=secrets.generate();
        context.getBean(com.ayaantrix.collector.auth.repository.AccountTokenRepository.class).saveAndFlush(new com.ayaantrix.collector.auth.entity.AccountToken(
            users.findById(owner.id()).orElseThrow(),secrets.digest(reset),com.ayaantrix.collector.auth.entity.TokenPurpose.RESET_PASSWORD,NOW));
        mvc.perform(write("POST","/api/v1/auth/reset-password",Map.of("token",reset,"password","synthetic changed workspace password"),owner)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+owner.access())).andExpect(status().isUnauthorized());
        mvc.perform(get(ROOT+"/"+w.id()).header("Authorization","Bearer "+owner.access())).andExpect(status().isUnauthorized());
    }

}

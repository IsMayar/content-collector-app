package com.ayaantrix.collector.project;
import com.ayaantrix.collector.project.entity.*;
import com.ayaantrix.collector.project.dto.ProjectDtos;
import com.ayaantrix.collector.project.dto.ProjectDtos.*;
import com.ayaantrix.collector.project.service.ProjectService;
import com.ayaantrix.collector.project.repository.*;
import com.ayaantrix.collector.template.entity.Template.ProjectType;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import java.time.*;
import java.util.stream.Stream;
import org.junit.jupiter.params.provider.*;


import com.ayaantrix.collector.CollectorApplication;
import com.ayaantrix.collector.auth.entity.UserAccount;
import com.ayaantrix.collector.auth.repository.UserAccountRepository;
import com.ayaantrix.collector.auth.security.*;
import com.ayaantrix.collector.auth.service.AgencySessions;
import com.ayaantrix.collector.auth.dto.LoginRequest;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.web.RequestTraceFilter;
import com.ayaantrix.collector.template.seed.BuiltInTemplateSeeder;
import com.ayaantrix.collector.template.service.TemplateCatalogService;
import com.ayaantrix.collector.template.repository.TemplateCatalogRepository;
import com.ayaantrix.collector.workspace.entity.*;
import com.ayaantrix.collector.workspace.dto.WorkspaceDtos;
import com.ayaantrix.collector.workspace.service.WorkspaceService;
import com.ayaantrix.collector.workspace.repository.WorkspaceMemberRepository;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Testcontainers @TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ProjectFoundationTests {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse(
        "public.ecr.aws/docker/library/postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873").asCompatibleSubstituteFor("postgres"));
    @TempDir static Path directory;
    static final Instant NOW=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS);
    static class TestClock extends Clock {public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}public Instant instant(){return NOW;}}
    @org.springframework.boot.test.context.TestConfiguration(proxyBeanMethods=false)
    static class Configuration { @Bean @Primary TestClock projectClock(){return new TestClock();} }
    static final String PASSWORD="synthetic template test password";
    static final String KEY="website.plumber";
    static final UUID VERSION=BuiltInTemplateSeeder.versionId(KEY,1);
    record Actor(UUID id,String access,Jwt jwt){@Override public String toString(){return "SyntheticActor[redacted]";}}
    record Tenant(Actor actor,UUID workspace,UUID client) {String root(){return "/api/v1/workspaces/"+workspace;}}
    private ConfigurableApplicationContext context;private SigningKeyFixture keys;
    private JdbcTemplate jdbc;private JsonMapper json;private MockMvc mvc;private String hash;
    @BeforeAll void start() throws Exception { keys=SigningKeyFixture.create(directory,"catalog-test");open();hash=context.getBean(PasswordEncoder.class).encode(PASSWORD); }
    ConfigurableApplicationContext start(String url){
        return new SpringApplicationBuilder(CollectorApplication.class,Configuration.class).profiles("test").run(
            "--server.port=0","--spring.datasource.url="+url,"--spring.datasource.username="+POSTGRES.getUsername(),"--spring.datasource.password="+POSTGRES.getPassword(),
            "--collector.jwt.private-key="+keys.privateFile(),"--collector.jwt.public-keys="+keys.publicFile(),"--collector.jwt.key-id="+keys.kid(),
            "--collector.jwt.issuer=https://catalog.test","--collector.jwt.audience=collector-api","--collector.auth.token-hash-pepper="+Base64.getEncoder().encodeToString(new byte[32]),
            "--collector.delivery.worker-enabled=false");
    }
    void open(){
        context=start(POSTGRES.getJdbcUrl());jdbc=context.getBean(JdbcTemplate.class);json=context.getBean(JsonMapper.class);
        mvc=MockMvcBuilders.webAppContextSetup((WebApplicationContext)context).apply(springSecurity()).addFilters(context.getBean(RequestTraceFilter.class)).build();
    }
    @AfterAll void stop(){if(context!=null)context.close();}
    @AfterEach void clear(){SecurityContextHolder.clearContext();}
    Actor actor(){
        String email="catalog-"+UUID.randomUUID()+"@example.test";
        var user=new UserAccount(email,"Synthetic User",hash,NOW);user.markVerified(NOW);context.getBean(UserAccountRepository.class).saveAndFlush(user);
        var issued=context.getBean(AgencySessions.class).login(new LoginRequest(email,PASSWORD));
        return new Actor(user.getId(),issued.accessToken(),context.getBean(AccessTokens.class).decode(issued.accessToken()));
    }
    <T>T as(Actor actor,Supplier<T> operation){
        var previous=SecurityContextHolder.getContext();var security=SecurityContextHolder.createEmptyContext();
        security.setAuthentication(new JwtAuthenticationToken(actor.jwt(),List.of()));SecurityContextHolder.setContext(security);
        try{return operation.get();}finally{SecurityContextHolder.setContext(previous);}
    }
    Tenant tenant(){var a=actor();UUID w=as(a,()->context.getBean(WorkspaceService.class).create(new WorkspaceDtos.Create("Project studio","UTC",null))).id();UUID client=as(a,()->service().createCustomer(w,new CustomerCreate("Synthetic customer",null,null))).id();return new Tenant(a,w,client);}
    BuiltInTemplateSeeder seed(){return context.getBean(BuiltInTemplateSeeder.class);}
    ProjectService service(){return context.getBean(ProjectService.class);}
    String bearer(Tenant t){return "Bearer "+t.actor().access();}
    TransactionTemplate tx(){return new TransactionTemplate(context.getBean(PlatformTransactionManager.class));}

    Create input(Tenant t,ProjectType type){String key=switch(type){case WEBSITE->"website.plumber";case WEB_APP->"web_app.starter";case MOBILE_APP->"mobile_app.starter";};return new Create(t.client(),"Synthetic "+type,type,LocalDate.of(2026,12,20),"Asia/Kabul",BuiltInTemplateSeeder.versionId(key,1));}
    View create(Tenant t,ProjectType type){return as(t.actor(),()->service().create(t.workspace(),input(t,type),UUID.randomUUID().toString()));}
    org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder postProject(Tenant t,Object body,String key){return post(t.root()+"/projects").with(csrf().asHeader()).header("Authorization",bearer(t)).header("Idempotency-Key",key).contentType("application/json").content(json.writeValueAsString(body));}
    long count(Tenant t,String table){return jdbc.queryForObject("select count(*) from collector."+table+" where workspace_id=?",Long.class,t.workspace());}
    @ParameterizedTest @ValueSource(strings={"WEBSITE","WEB_APP","MOBILE_APP"})
    void createsAllThreeTypesWithExactFrontendShapeAndGenuineInitialProgress(String name) throws Exception {
        var t=tenant();var input=input(t,ProjectType.valueOf(name));
        var result=mvc.perform(postProject(t,input,UUID.randomUUID().toString()).header("X-Request-ID","project-create"))
            .andExpect(status().isCreated()).andExpect(header().string("X-Request-ID","project-create")).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$.project.projectType").value(name)).andExpect(jsonPath("$.project.state").value("DRAFT"))
            .andExpect(jsonPath("$.project.version").value(1)).andExpect(jsonPath("$.project.structureVersion").value(1))
            .andExpect(jsonPath("$.project.aiEnabled").value(false)).andExpect(jsonPath("$.project.progress.submittedRequired").value(0))
            .andExpect(jsonPath("$.project.progress.approvedRequired").value(0)).andReturn();
        var body=json.readTree(result.getResponse().getContentAsString());assertThat(body.propertyNames()).containsExactly("project");
        UUID id=UUID.fromString(body.at("/project/id").asText());var detail=as(t.actor(),()->service().read(t.workspace(),id));
        assertThat(detail.project().clientId()).isEqualTo(t.client());assertThat(detail.progress().requiredTotal()).isGreaterThan(0);
        assertThat(detail.progress().clientActionRequired()).isEqualTo(detail.progress().requiredTotal());
        assertThat(count(t,"projects")).isEqualTo(1);assertThat(count(t,"project_snapshots")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select created_by_user_id from collector.projects where workspace_id=?",UUID.class,t.workspace())).isEqualTo(t.actor().id());
        mvc.perform(get(t.root()+"/projects/"+id).header("Authorization",bearer(t))).andExpect(status().isOk())
            .andExpect(jsonPath("$.structure[0].items[0].version").value(1)).andExpect(jsonPath("$.structure[0].items[0].state").value("NOT_STARTED"));
    }
    @Test void allTenSourceDefinitionsRetainEveryFieldOrderAndConfiguration() {
        var t=tenant();
        for(var original:seed().originals()){
            var input=new Create(t.client(),"Original template",ProjectType.valueOf(original.get("projectType").asText()),LocalDate.of(2026,12,20),"UTC",BuiltInTemplateSeeder.versionId(original.get("key").asText(),1));
            var project=as(t.actor(),()->service().create(t.workspace(),input,UUID.randomUUID().toString()));
            var snapshot=context.getBean(ProjectSnapshotRepository.class).findByWorkspaceIdAndProjectId(t.workspace(),project.id()).orElseThrow();
            assertThat(snapshot.id()).isNotEqualTo(project.id()).isNotEqualTo(input.templateVersionId());assertThat(json.readTree(snapshot.definition())).isEqualTo(original);
            var detail=as(t.actor(),()->service().read(t.workspace(),project.id()));assertThat(detail.structure()).hasSize(original.get("sections").size());
            for(int s=0;s<detail.structure().size();s++){
                var section=detail.structure().get(s);var source=original.get("sections").get(s);assertThat(section.get("key")).isEqualTo(source.get("key"));assertThat(section.get("sortOrder").asInt()).isEqualTo(s);
                for(int i=0;i<section.get("items").size();i++){
                    var item=section.get("items").get(i);var sourceItem=source.get("items").get(i);
                    for(var property:sourceItem.properties())assertThat(item.get(property.getKey())).isEqualTo(property.getValue());
                    assertThat(item.get("sortOrder").asInt()).isEqualTo(i);assertThat(item.get("sectionId")).isEqualTo(section.get("id"));
                }
            }
        }
        assertThat(count(t,"projects")).isEqualTo(10);assertThat(count(t,"sections")).isEqualTo(68);assertThat(count(t,"items")).isEqualTo(220);
    }
    static Stream<String> invalidBodies(){return Stream.of(
        "{\"title\":\" \"}","{\"projectType\":\"NATIVE\"}","{\"dueDate\":\"2026-02-30\"}","{\"timezone\":\"Mars/Test\"}",
        "{\"templateVersionId\":null}","{\"clientId\":null}","{\"title\":null}","{\"dueDate\":null}","{\"projectType\":null}",
        "{\"clientId\":\"not-a-uuid\"}","{\"title\":\""+"x".repeat(201)+"\"}");}
    @ParameterizedTest @MethodSource("invalidBodies") void invalidFieldsNeverPersistProjectOrSnapshot(String changes) throws Exception {
        var t=tenant();var body=(ObjectNode)json.valueToTree(input(t,ProjectType.WEBSITE));body.setAll((ObjectNode)json.readTree(changes));
        mvc.perform(postProject(t,body,UUID.randomUUID().toString())).andExpect(status().isBadRequest()).andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        assertThat(count(t,"projects")).isZero();assertThat(count(t,"project_snapshots")).isZero();assertThat(count(t,"idempotency_records")).isZero();
    }
    @ParameterizedTest @ValueSource(strings={"MISSING","FOREIGN","INCOMPATIBLE"}) void invalidTemplateScopeAndTypeAreRejected(String kind) throws Exception {
        var t=tenant();UUID version=UUID.randomUUID();int expected=404;
        if(kind.equals("INCOMPATIBLE")){version=BuiltInTemplateSeeder.versionId("mobile_app.starter",1);expected=400;}
        if(kind.equals("FOREIGN")){var other=tenant();version=workspaceTemplate(other,seed().originals().get(0),1);}
        var input=new Create(t.client(),"Rejected",ProjectType.WEBSITE,LocalDate.of(2026,12,20),"UTC",version);
        mvc.perform(postProject(t,input,UUID.randomUUID().toString())).andExpect(status().is(expected));assertThat(count(t,"projects")).isZero();
    }
    @Test void foreignCustomerCannotBeAttachedToOwnProject() throws Exception {
        var t=tenant();var other=tenant();var input=new Create(other.client(),"Rejected",ProjectType.WEBSITE,LocalDate.of(2026,12,20),"UTC",VERSION);
        mvc.perform(postProject(t,input,UUID.randomUUID().toString())).andExpect(status().isNotFound());assertThat(count(t,"projects")).isZero();
    }
    @Test void anonymousCreationAndReadsRequireIdentityAndWritesRequireCsrf() throws Exception {
        var t=tenant();mvc.perform(postProject(t,input(t,ProjectType.WEBSITE),"one").with(request->{request.removeHeader("Authorization");return request;})).andExpect(status().isUnauthorized());
        mvc.perform(post(t.root()+"/projects").header("Authorization",bearer(t)).header("Idempotency-Key","one").contentType("application/json").content(json.writeValueAsString(input(t,ProjectType.WEBSITE))))
            .andExpect(status().isForbidden());
        for(String path:List.of("/projects","/projects/"+UUID.randomUUID(),"/clients"))mvc.perform(get(t.root()+path)).andExpect(status().isUnauthorized());
    }
    @Test void crossTenantListDetailAndSourceReadsNeverLeakData() throws Exception {
        var a=tenant();var b=tenant();var project=create(a,ProjectType.WEBSITE);
        mvc.perform(get(a.root()+"/projects").header("Authorization",bearer(b))).andExpect(status().isNotFound());
        mvc.perform(get(b.root()+"/projects/"+project.id()).header("Authorization",bearer(b))).andExpect(status().isNotFound());
        mvc.perform(get(a.root()+"/projects/"+project.id()).header("Authorization",bearer(b))).andExpect(status().isNotFound());
        mvc.perform(postProject(a,input(a,ProjectType.WEBSITE),"forged").with(r->{r.removeHeader("Authorization");r.addHeader("Authorization",bearer(b));return r;})).andExpect(status().isNotFound());
        mvc.perform(get(b.root()+"/projects").header("Authorization",bearer(b))).andExpect(jsonPath("$.data.length()").value(0));
    }
    @ParameterizedTest @ValueSource(strings={"DISABLED","REMOVED"}) void membershipRevocationImmediatelyBlocksEveryProjectOperation(String kind) throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);
        if(kind.equals("REMOVED"))jdbc.update("delete from collector.workspace_members where workspace_id=?",t.workspace());else jdbc.update("update collector.workspace_members set state='DISABLED' where workspace_id=?",t.workspace());
        for(String suffix:List.of("/projects","/projects/"+p.id(),"/clients"))mvc.perform(get(t.root()+suffix).header("Authorization",bearer(t))).andExpect(status().isNotFound());
        mvc.perform(postProject(t,input(t,ProjectType.WEBSITE),"revoked")).andExpect(status().isNotFound());
    }
    @Test void membersCannotCreateAndUnassignedMembersSeeNoCustomerOrProjectData() throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var member=actor();context.getBean(WorkspaceMemberRepository.class).saveAndFlush(new WorkspaceMember(t.workspace(),member.id(),WorkspaceRole.MEMBER,NOW));
        for(String suffix:List.of("/projects","/clients"))mvc.perform(get(t.root()+suffix).header("Authorization","Bearer "+member.access())).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(0)).andExpect(jsonPath("$.page.totalElements").value(0));
        mvc.perform(get(t.root()+"/projects/"+p.id()).header("Authorization","Bearer "+member.access())).andExpect(status().isNotFound());
        mvc.perform(postProject(t,input(t,ProjectType.WEBSITE),"member").with(request->{request.removeHeader("Authorization");request.addHeader("Authorization","Bearer "+member.access());return request;})).andExpect(status().isForbidden());
    }
    @ParameterizedTest @ValueSource(strings={"DISABLED","UNVERIFIED","LOGOUT"}) void accountOrSessionRevocationIsCheckedForDirectAndHttpCalls(String kind) throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);
        if(kind.equals("LOGOUT"))context.getBean(AgencySessions.class).logoutAll(t.actor().jwt());else jdbc.update("update collector.users set state=?,verified_at=case when ?='UNVERIFIED' then null else verified_at end where id=?",kind,kind,t.actor().id());
        mvc.perform(get(t.root()+"/projects/"+p.id()).header("Authorization",bearer(t))).andExpect(status().isUnauthorized());
        assertThatThrownBy(()->as(t.actor(),()->service().create(t.workspace(),input(t,ProjectType.WEBSITE),"denied"))).isInstanceOf(ApiException.class);
    }
    @Test void serviceCannotBeInvokedWithoutTrustedIdentity(){var t=tenant();assertThatThrownBy(()->service().create(t.workspace(),input(t,ProjectType.WEBSITE),"no-actor")).isInstanceOf(ApiException.class);}
    @ParameterizedTest @ValueSource(strings={"READ_ONLY","SUSPENDED","DELETION_PENDING","EXPIRED","MISSING_PLAN"}) void existingPlanPolicyDeniesNewWritesAndRetainsReadAccess(String state) throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);
        if(state.equals("EXPIRED"))jdbc.update("update collector.subscriptions set current_period_start=?,current_period_end=? where workspace_id=?",java.sql.Timestamp.from(NOW.minusSeconds(86400)),java.sql.Timestamp.from(NOW),t.workspace());
        else if(state.equals("MISSING_PLAN"))jdbc.update("delete from collector.subscriptions where workspace_id=?",t.workspace());else jdbc.update("update collector.workspaces set state=? where id=?",state,t.workspace());
        mvc.perform(postProject(t,input(t,ProjectType.WEBSITE),"readonly")).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("WORKSPACE_READ_ONLY"));
        mvc.perform(get(t.root()+"/projects/"+p.id()).header("Authorization",bearer(t))).andExpect(status().isOk()).andExpect(jsonPath("$.project.permissions.canEditStructure").value(false));assertThat(count(t,"projects")).isEqualTo(1);
    }
    @Test void noArbitraryProjectCapOrProviderUsageIsCharged() {
        var t=tenant();String before=jdbc.queryForObject("select row_to_json(w)::text from collector.workspaces w where id=?",String.class,t.workspace());
        for(int i=0;i<7;i++)create(t,ProjectType.WEB_APP);
        assertThat(count(t,"projects")).isEqualTo(7);assertThat(jdbc.queryForObject("select row_to_json(w)::text from collector.workspaces w where id=?",String.class,t.workspace())).isEqualTo(before);
        assertThat(jdbc.queryForObject("select count(*) from collector.outbox_jobs",Integer.class)).isZero();
    }

    @Test void idempotentRetryReturnsExactOriginalAndChangedInputConflicts() throws Exception {
        var t=tenant();var body=input(t,ProjectType.WEBSITE);String key="creation-retry";
        var first=mvc.perform(postProject(t,body,key)).andExpect(status().isCreated()).andReturn();var second=mvc.perform(postProject(t,body,key)).andExpect(status().isCreated()).andReturn();
        assertThat(json.readTree(second.getResponse().getContentAsString())).isEqualTo(json.readTree(first.getResponse().getContentAsString()));
        var changed=new Create(t.client(),"Different title",body.projectType(),body.dueDate(),body.timezone(),body.templateVersionId());
        mvc.perform(postProject(t,changed,key)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
        assertThat(count(t,"projects")).isEqualTo(1);assertThat(count(t,"project_snapshots")).isEqualTo(1);assertThat(count(t,"idempotency_records")).isEqualTo(1);
    }
    @Test void idempotencyKeysAreWorkspaceActorScopedAndExpireAfter24Hours() {
        var a=tenant();var b=tenant();var one=as(a.actor(),()->service().create(a.workspace(),input(a,ProjectType.WEBSITE),"shared"));
        var two=as(b.actor(),()->service().create(b.workspace(),input(b,ProjectType.WEBSITE),"shared"));assertThat(two.id()).isNotEqualTo(one.id());
        jdbc.update("update collector.idempotency_records set created_at=?,expires_at=? where workspace_id=?",java.sql.Timestamp.from(NOW.minusSeconds(90000)),java.sql.Timestamp.from(NOW),a.workspace());
        var afterExpiry=as(a.actor(),()->service().create(a.workspace(),input(a,ProjectType.WEBSITE),"shared"));assertThat(afterExpiry.id()).isNotEqualTo(one.id());
    }
    @ParameterizedTest @ValueSource(strings={"", "spaces not allowed", "missing"}) void requestKeysAreRequiredAndValidated(String key) throws Exception {
        var t=tenant();var request=postProject(t,input(t,ProjectType.WEBSITE),key);if(key.equals("missing"))request.with(r->{r.removeHeader("Idempotency-Key");return r;});
        mvc.perform(request).andExpect(status().isBadRequest());assertThat(count(t,"projects")).isZero();
    }
    @ParameterizedTest @ValueSource(strings={"project_snapshots","sections","items","idempotency_records"}) void anyPersistenceStageFailureRollsBackEntireProject(String table) throws Exception {
        var t=tenant();jdbc.execute("create function collector.fail_project_test() returns trigger language plpgsql as $$ begin raise exception 'Synthetic failure'; end; $$");
        jdbc.execute("create trigger fail_project_test before insert on collector."+table+" for each row execute function collector.fail_project_test()");
        try{
            mvc.perform(postProject(t,input(t,ProjectType.WEBSITE),"rollback").header("X-Request-ID","rollback-safe")).andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_SERVER_ERROR")).andExpect(jsonPath("$.traceId").value("rollback-safe"))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("Synthetic failure"))));
            for(String entity:List.of("projects","project_snapshots","sections","items","idempotency_records"))assertThat(count(t,entity)).isZero();
        }finally{jdbc.execute("drop trigger fail_project_test on collector."+table);jdbc.execute("drop function collector.fail_project_test()");}
    }
    @ParameterizedTest @ValueSource(booleans={true,false}) void concurrentCreationIsAtomicForSameAndDifferentKeys(boolean same) throws Exception {
        var t=tenant();var gate=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)){
            var a=pool.submit(()->{gate.await();return as(t.actor(),()->service().create(t.workspace(),input(t,ProjectType.WEBSITE),"concurrent-a"));});
            var b=pool.submit(()->{gate.await();return as(t.actor(),()->service().create(t.workspace(),input(t,ProjectType.WEBSITE),same?"concurrent-a":"concurrent-b"));});
            gate.countDown();var x=a.get(20,TimeUnit.SECONDS);var y=b.get(20,TimeUnit.SECONDS);assertThat(x.id().equals(y.id())).isEqualTo(same);
            assertThat(count(t,"projects")).isEqualTo(same?1:2);assertThat(count(t,"project_snapshots")).isEqualTo(same?1:2);
        }
    }
    @Test void listingSupportsSearchCombinedFiltersStableSortAndBoundedPagination() throws Exception {
        var t=tenant();create(t,ProjectType.WEBSITE);create(t,ProjectType.WEB_APP);create(t,ProjectType.MOBILE_APP);
        mvc.perform(get(t.root()+"/projects").param("size","1").param("page","1").param("sort","title").header("Authorization",bearer(t)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1)).andExpect(jsonPath("$.page.page").value(1)).andExpect(jsonPath("$.page.size").value(1)).andExpect(jsonPath("$.page.totalElements").value(3));
        mvc.perform(get(t.root()+"/projects").param("search","SYnTheTiC").param("projectType","WEB_APP").param("state","DRAFT").param("sort","dueDate").header("Authorization",bearer(t)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1)).andExpect(jsonPath("$.data[0].projectType").value("WEB_APP"));
        var response=mvc.perform(get(t.root()+"/projects").header("Authorization",bearer(t))).andExpect(status().isOk()).andReturn();
        assertThat(json.readTree(response.getResponse().getContentAsString()).at("/data/0").propertyNames()).containsExactlyInAnyOrder("id","workspaceId","title","clientBusinessName","projectType","state","dueDate","timezone","progress","updatedAt");
        for(String search:List.of("%","_","!"))mvc.perform(get(t.root()+"/projects").param("search",search).header("Authorization",bearer(t))).andExpect(jsonPath("$.data.length()").value(search.equals("_")?2:0));
        mvc.perform(get(t.root()+"/projects").param("page","10").header("Authorization",bearer(t))).andExpect(jsonPath("$.data.length()").value(0)).andExpect(jsonPath("$.page.totalElements").value(3));
    }
    @ParameterizedTest @ValueSource(strings={"size=0","size=101","page=-1","sort=unsafe","projectType=OTHER","state=OTHER"}) void invalidFiltersUseStandard400Problem(String query) throws Exception {
        var t=tenant();mvc.perform(get(t.root()+"/projects?"+query).header("Authorization",bearer(t))).andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors").isArray());
    }
    @Test void unknownProjectHasCorrelatedSafe404() throws Exception {var t=tenant();mvc.perform(get(t.root()+"/projects/"+UUID.randomUUID()).header("Authorization",bearer(t)).header("X-Request-ID","project-missing")).andExpect(status().isNotFound()).andExpect(jsonPath("$.traceId").value("project-missing")).andExpect(header().string("X-Request-ID","project-missing"));}
    @Test void customerCreationAndListingMatchWizardWithoutCreatingGrant() throws Exception {
        var t=tenant();mvc.perform(post(t.root()+"/clients").with(csrf().asHeader()).header("Authorization",bearer(t)).contentType("application/json").content("{\"businessName\":\"New customer\",\"contactName\":\"Synthetic Person\",\"email\":\"Customer@Example.TEST\"}"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.client.email").value("customer@example.test")).andExpect(jsonPath("$.client.version").value(0));
        mvc.perform(get(t.root()+"/clients").header("Authorization",bearer(t))).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(2));
        assertThat(count(t,"answers")).isZero();assertThat(jdbc.queryForObject("select count(*) from collector.submission_revisions",Integer.class)).isZero();
    }
    UUID workspaceTemplate(Tenant t,tools.jackson.databind.JsonNode definition,int version){
        UUID template=UUID.randomUUID(),id=UUID.randomUUID();jdbc.update("insert into collector.templates(id,workspace_id,template_key,project_type,industry,title,is_builtin,version) values (?,?,? ,?,'GENERAL','Custom',false,1)",template,t.workspace(),"custom."+template,definition.get("projectType").asText());
        jdbc.update("insert into collector.template_versions(id,template_id,version_no,schema_version,definition) values (?,?,?,1,?::jsonb)",id,template,version,definition.toString());return id;
    }
    @Test void visibleConditionsAndRepeaterConfigSurviveCopyWithUnansweredDependenciesHidden() {
        var t=tenant();var original=(ObjectNode)seed().originals().get(0).deepCopy();var first=(ObjectNode)original.at("/sections/0/items/0");first.put("type","SINGLE_SELECT");first.putObject("validation").putArray("options").addObject().put("key","yes").put("label","Yes");
        ((ObjectNode)original.at("/sections/0/items/1")).putObject("visibleWhen").put("dependsOnItemKey","home.headline").put("operator","EQUALS").put("optionKey","yes");
        UUID version=workspaceTemplate(t,original,1);var input=new Create(t.client(),"Conditional",ProjectType.WEBSITE,LocalDate.of(2026,12,20),"UTC",version);
        var p=as(t.actor(),()->service().create(t.workspace(),input,"conditional"));var detail=as(t.actor(),()->service().read(t.workspace(),p.id()));
        assertThat(detail.structure().get(0).at("/items/1/visibleWhen")).isEqualTo(original.at("/sections/0/items/1/visibleWhen"));
        assertThat(detail.structure().get(0).at("/items/1/visible").asBoolean()).isFalse();assertThat(detail.structure().get(2).at("/items/1/validation")).isEqualTo(original.at("/sections/2/items/1/validation"));
    }
    @Test void newerPublishedVersionAndAnotherProjectNeverMutateExistingSnapshots() {
        var t=tenant();var old=create(t,ProjectType.WEBSITE);var before=as(t.actor(),()->service().read(t.workspace(),old.id()));
        tx().executeWithoutResult(status->{
            status.setRollbackOnly();var newer=(ObjectNode)seed().originals().get(0).deepCopy();newer.put("version",2);((ObjectNode)newer.at("/sections/0/items/0")).put("label","Published v2 heading");UUID version=BuiltInTemplateSeeder.versionId(KEY,2);
            jdbc.update("insert into collector.template_versions(id,template_id,version_no,schema_version,definition) values (?,?,2,1,?::jsonb)",version,BuiltInTemplateSeeder.templateId(KEY),newer.toString());
            var p=as(t.actor(),()->service().create(t.workspace(),new Create(t.client(),"New version",ProjectType.WEBSITE,LocalDate.of(2026,12,20),"UTC",version),"new-version"));
            var detail=as(t.actor(),()->service().read(t.workspace(),p.id()));assertThat(detail.structure().get(0).at("/items/0/label").asText()).isEqualTo("Published v2 heading");
            ((ObjectNode)detail.structure().get(0)).put("title","Changed response copy");assertThat(as(t.actor(),()->service().read(t.workspace(),old.id()))).isEqualTo(before);
            assertThat(as(t.actor(),()->service().read(t.workspace(),p.id())).structure().get(0).get("id")).isNotEqualTo(before.structure().get(0).get("id"));
            jdbc.update("update collector.items set label='Project-only edit',schema_json=jsonb_set(schema_json,'{label}','\"Project-only edit\"') where workspace_id=? and project_id=? and item_key='home.headline'",t.workspace(),p.id());
            assertThat(as(t.actor(),()->service().read(t.workspace(),old.id()))).isEqualTo(before);
            assertThat(json.readTree(jdbc.queryForObject("select definition::text from collector.project_snapshots where workspace_id=? and project_id=?",String.class,t.workspace(),p.id()))).isEqualTo(newer);
        });
    }
    @Test void databasePreventsForeignCustomerSnapshotStructureAndMutableInitialDefinition(){
        var a=tenant();var b=tenant();create(a,ProjectType.WEBSITE);var other=create(b,ProjectType.WEBSITE);
        assertThatThrownBy(()->jdbc.update("update collector.projects set client_id=? where workspace_id=?",b.client(),a.workspace())).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(()->jdbc.update("insert into collector.project_snapshots(workspace_id,project_id,source_template_version_id,definition) values (?,?,?,'{\"schemaVersion\":1}')",a.workspace(),other.id(),VERSION)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(()->jdbc.update("update collector.project_snapshots set definition='{}' where workspace_id=?",a.workspace())).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(()->jdbc.update("delete from collector.project_snapshots where workspace_id=?",a.workspace())).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        UUID sid=jdbc.queryForObject("select id from collector.sections where workspace_id=? and section_key='home'",UUID.class,b.workspace());
        assertThatThrownBy(()->jdbc.update("update collector.items set section_id=? where workspace_id=?",sid,a.workspace())).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }
    @Test void onlyRequiredRoutesOpenAndUnsupportedDescendantsStayDenied() throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);
        for(String suffix:List.of("/publish/closed","/pause/closed","/complete/closed","/sections/delete","/assignments","/contacts/closed/invite/closed","/client-preview/closed"))
            mvc.perform(post(t.root()+"/projects/"+p.id()+suffix).with(csrf().asHeader()).header("Authorization",bearer(t))).andExpect(status().isForbidden());
        mvc.perform(patch(t.root()+"/projects/"+p.id()).with(csrf().asHeader()).header("Authorization",bearer(t)).contentType("application/json").content("{}")) .andExpect(status().isForbidden());
        mvc.perform(options(t.root()+"/projects").header("Origin","https://untrusted.example").header("Access-Control-Request-Method","POST")).andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
        for(Class<?> repo:List.of(ProjectRepository.class,ProjectSnapshotRepository.class,ProjectCustomerRepository.class))assertThat(Arrays.stream(repo.getMethods()).map(java.lang.reflect.Method::getName)).doesNotContain("findAll","findById","deleteById");
    }
    @Test void cleanFlywayHibernateAndRestartPreserveProjectSnapshotAndSession() throws Exception {
        var t=tenant();var p=create(t,ProjectType.MOBILE_APP);var before=as(t.actor(),()->service().read(t.workspace(),p.id()));context.close();open();
        assertThat(context.getBean(Flyway.class).info().applied()).hasSize(22);assertThat(context.getBean(Flyway.class).validateWithResult().validationSuccessful).isTrue();
        assertThat(context.getEnvironment().getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("validate");assertThat(as(t.actor(),()->service().read(t.workspace(),p.id()))).isEqualTo(before);
        mvc.perform(get(t.root()+"/projects/"+p.id()).header("Authorization",bearer(t))).andExpect(status().isOk());seed().seed();assertThat(count(t,"projects")).isEqualTo(1);
    }
    @Test void v7UpgradePreservesCatalogWorkspaceAndIdentity() throws Exception {
        jdbc.execute("create database project_v7_upgrade");String url="jdbc:postgresql://"+POSTGRES.getHost()+":"+POSTGRES.getMappedPort(5432)+"/project_v7_upgrade";
        var source=new DriverManagerDataSource(url,POSTGRES.getUsername(),POSTGRES.getPassword());var data=new JdbcTemplate(source);Flyway.configure().dataSource(source).target("7").load().migrate();
        UUID user=UUID.randomUUID(),w=UUID.randomUUID();data.update("insert into collector.users(id,email_normalized,display_name,password_hash) values (?,'upgrade@example.test','Synthetic',?)",user,hash);data.update("insert into collector.workspaces(id,name,timezone) values (?,'Preserved','UTC')",w);
        var original=seed().originals().get(0);data.update("insert into collector.templates(id,template_key,project_type,industry,title,is_builtin,version) values (?,?,'WEBSITE','PLUMBER',?,true,1)",BuiltInTemplateSeeder.templateId(KEY),KEY,original.get("title").asText());
        data.update("insert into collector.template_versions(id,template_id,version_no,schema_version,definition) values (?,?,1,1,?::jsonb)",VERSION,BuiltInTemplateSeeder.templateId(KEY),original.toString());
        try(var upgraded=start(url)){
            assertThat(upgraded.getBean(Flyway.class).info().applied()).hasSize(22);assertThat(upgraded.getBean(Flyway.class).validateWithResult().validationSuccessful).isTrue();
            assertThat(data.queryForObject("select name from collector.workspaces where id=?",String.class,w)).isEqualTo("Preserved");assertThat(data.queryForObject("select password_hash from collector.users where id=?",String.class,user)).isEqualTo(hash);
            assertThat(json.readTree(data.queryForObject("select definition::text from collector.template_versions where id=?",String.class,VERSION))).isEqualTo(original);assertThat(data.queryForObject("select count(*) from collector.templates where is_builtin",Integer.class)).isEqualTo(10);
        }
    }

    @ParameterizedTest @ValueSource(strings={"DISABLE","DEMOTE","READ_ONLY","EXPIRE_PLAN"})
    void authorizationAndPlanAreRecheckedAfterConcurrentWorkspaceChange(String kind) throws Exception {
        var t=tenant();var held=new CountDownLatch(1);var release=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)){
            var change=pool.submit(()->tx().executeWithoutResult(status->{
                jdbc.queryForObject("select id from collector.workspaces where id=? for update",UUID.class,t.workspace());held.countDown();
                try{if(!release.await(12,TimeUnit.SECONDS))throw new IllegalStateException("Synthetic lock wait timed out");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException("Interrupted test");}
                if(kind.equals("DISABLE"))jdbc.update("update collector.workspace_members set state='DISABLED' where workspace_id=?",t.workspace());
                else if(kind.equals("DEMOTE"))jdbc.update("update collector.workspace_members set role='MEMBER' where workspace_id=?",t.workspace());
                else if(kind.equals("READ_ONLY"))jdbc.update("update collector.workspaces set state='READ_ONLY' where id=?",t.workspace());
                else jdbc.update("update collector.subscriptions set current_period_start=?,current_period_end=? where workspace_id=?",java.sql.Timestamp.from(NOW.minusSeconds(86400)),java.sql.Timestamp.from(NOW),t.workspace());
            }));
            assertThat(held.await(5,TimeUnit.SECONDS)).isTrue();
            var write=pool.submit(()->{try{create(t,ProjectType.WEBSITE);return 201;}catch(ApiException e){return e.getStatus().value();}});
            try{
                long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(6);int waiting=0;
                while(waiting==0 && System.nanoTime()<until){waiting=jdbc.queryForObject("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%workspaces%' and pid<>pg_backend_pid()",Integer.class);if(waiting==0)Thread.sleep(10);}
                assertThat(waiting).isGreaterThan(0);
            }finally{release.countDown();}
            change.get(15,TimeUnit.SECONDS);assertThat(write.get(15,TimeUnit.SECONDS)).isEqualTo(kind.equals("DISABLE")?404:403);
        }finally{release.countDown();}
        for(String table:List.of("projects","project_snapshots","sections","items","idempotency_records"))assertThat(count(t,table)).isZero();
    }
}

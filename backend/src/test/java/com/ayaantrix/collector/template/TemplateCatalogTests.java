package com.ayaantrix.collector.template;

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
class TemplateCatalogTests {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse(
        "public.ecr.aws/docker/library/postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873").asCompatibleSubstituteFor("postgres"));
    @TempDir static Path directory;
    static final String PASSWORD="synthetic template test password";
    static final String KEY="website.plumber";
    static final UUID VERSION=BuiltInTemplateSeeder.versionId(KEY,1);
    record Actor(UUID id,String access,Jwt jwt){@Override public String toString(){return "SyntheticActor[redacted]";}}
    record Tenant(Actor actor,UUID workspace) {String root(){return "/api/v1/workspaces/"+workspace;}}
    // Catalog authorization tests do not exercise elapsed time. Keep fixture sessions
    // independent of host clock adjustments, like the existing project integration fixtures.
    @org.springframework.context.annotation.Configuration(proxyBeanMethods=false)
    static class Configuration {
        @org.springframework.context.annotation.Bean @org.springframework.context.annotation.Primary
        java.time.Clock catalogClock() {
            return java.time.Clock.fixed(Instant.parse("2026-11-01T00:00:00Z"), java.time.ZoneOffset.UTC);
        }
    }
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
        var user=new UserAccount(email,"Synthetic User",hash,Instant.now());user.markVerified(Instant.now());context.getBean(UserAccountRepository.class).saveAndFlush(user);
        var issued=context.getBean(AgencySessions.class).login(new LoginRequest(email,PASSWORD));
        return new Actor(user.getId(),issued.accessToken(),context.getBean(AccessTokens.class).decode(issued.accessToken()));
    }
    <T>T as(Actor actor,Supplier<T> operation){
        var previous=SecurityContextHolder.getContext();var security=SecurityContextHolder.createEmptyContext();
        security.setAuthentication(new JwtAuthenticationToken(actor.jwt(),List.of()));SecurityContextHolder.setContext(security);
        try{return operation.get();}finally{SecurityContextHolder.setContext(previous);}
    }
    Tenant tenant(){var a=actor();return new Tenant(a,as(a,()->context.getBean(WorkspaceService.class).create(new WorkspaceDtos.Create("Catalog studio","UTC",null))).id());}
    BuiltInTemplateSeeder seed(){return context.getBean(BuiltInTemplateSeeder.class);}
    TemplateCatalogService service(){return context.getBean(TemplateCatalogService.class);}
    String bearer(Tenant t){return "Bearer "+t.actor().access();}
    TransactionTemplate tx(){return new TransactionTemplate(context.getBean(PlatformTransactionManager.class));}
    long count(String table){return jdbc.queryForObject("select count(*) from collector."+table+" where "+(table.equals("templates")?"is_builtin":"template_id in (select id from collector.templates where is_builtin)"),Long.class);}

    @Test void cleanMigrationHibernateAndAllStoredDefinitionsMatchOriginals() {
        assertThat(context.getBean(Flyway.class).validateWithResult().validationSuccessful).isTrue();
        assertThat(context.getBean(Flyway.class).info().applied()).hasSize(15);
        assertThat(context.getBean(Flyway.class).info().pending()).isEmpty();
        assertThat(context.getEnvironment().getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("validate");
        assertThat(count("templates")).isEqualTo(10);assertThat(count("template_versions")).isEqualTo(10);
        var tenant=tenant();
        for(var original:seed().originals()){
            String key=original.get("key").asText();var version=BuiltInTemplateSeeder.versionId(key,1);
            assertThat(as(tenant.actor(),()->service().read(tenant.workspace(),version)).definition()).isEqualTo(original);
            assertThat(jdbc.queryForObject("select template_key from collector.templates where id=?",String.class,BuiltInTemplateSeeder.templateId(key))).isEqualTo(key);
        }
    }
    @Test void listUsesExactFrontendEnvelopeStableIdsAndNoEntityInternals() throws Exception {
        var t=tenant();var result=mvc.perform(get(t.root()+"/templates").header("Authorization",bearer(t)).header("X-Request-ID","template-catalog"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(header().string("X-Request-ID","template-catalog")).andExpect(jsonPath("$.data.length()").value(10)).andReturn();
        var body=json.readTree(result.getResponse().getContentAsString());assertThat(body.propertyNames()).containsExactly("data");
        var summary=body.get("data").get(0);assertThat(summary.propertyNames()).containsExactlyInAnyOrder("id","title","projectType","industry","isBuiltin","version","versionId");
        assertThat(summary.get("isBuiltin").asBoolean()).isTrue();assertThat(summary.get("version").asInt()).isEqualTo(1);
        UUID.fromString(summary.get("id").asText());UUID.fromString(summary.get("versionId").asText());
    }
    @ParameterizedTest @ValueSource(strings={"WEBSITE","WEB_APP","MOBILE_APP"})
    void filtersByExactProjectType(String type) throws Exception {
        var t=tenant();mvc.perform(get(t.root()+"/templates").param("projectType",type).header("Authorization",bearer(t)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(type.equals("WEBSITE")?8:1))
            .andExpect(jsonPath("$.data[0].projectType").value(type));
    }
    @Test void filtersByIndustryAndCombinesFiltersWithoutFabricatedMatches() throws Exception {
        var t=tenant();mvc.perform(get(t.root()+"/templates").param("industry","PLUMBER").param("projectType","WEBSITE").header("Authorization",bearer(t)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1)).andExpect(jsonPath("$.data[0].versionId").value(VERSION.toString()));
        mvc.perform(get(t.root()+"/templates").param("industry","PLUMBER").param("projectType","MOBILE_APP").header("Authorization",bearer(t)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(0));
    }
    @Test void detailEnvelopeIsExactOriginalAndIndependentBetweenReads() throws Exception {
        var t=tenant();var result=mvc.perform(get(t.root()+"/template-versions/"+VERSION).header("Authorization",bearer(t)))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andReturn();
        var body=json.readTree(result.getResponse().getContentAsString());assertThat(body.propertyNames()).containsExactly("definition");
        assertThat(body.get("definition")).isEqualTo(seed().originals().get(0));
        var copy=as(t.actor(),()->service().read(t.workspace(),VERSION)).definition();((ObjectNode)copy.at("/sections/0/items/0")).put("label","consumer changed this");
        assertThat(as(t.actor(),()->service().read(t.workspace(),VERSION)).definition()).isEqualTo(seed().originals().get(0));
    }
    @Test void unknownVersionHasCorrelatedSafeProblem() throws Exception {
        var t=tenant();mvc.perform(get(t.root()+"/template-versions/"+UUID.randomUUID()).header("Authorization",bearer(t)).header("X-Request-ID","unknown-template"))
            .andExpect(status().isNotFound()).andExpect(content().contentTypeCompatibleWith("application/problem+json"))
            .andExpect(jsonPath("$.code").value("NOT_FOUND")).andExpect(jsonPath("$.traceId").value("unknown-template"))
            .andExpect(jsonPath("$.errors").isArray()).andExpect(header().string("X-Request-ID","unknown-template"));
    }
    @ParameterizedTest @ValueSource(strings={"/templates","/template-versions/"})
    void anonymousReadsRequireAgencyIdentity(String path) throws Exception {
        var t=tenant();mvc.perform(get(t.root()+path+(path.endsWith("/")?VERSION:"")))
            .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }
    @Test void foreignWorkspaceAndMissingWorkspaceBothReturn404() throws Exception {
        var owner=tenant();var stranger=actor();
        for(UUID id:List.of(owner.workspace(),UUID.randomUUID()))
            for(String suffix:List.of("/templates","/template-versions/"+VERSION))
                mvc.perform(get("/api/v1/workspaces/"+id+suffix).header("Authorization","Bearer "+stranger.access())).andExpect(status().isNotFound());
    }
    @Test void activeMemberCanReadButDisabledMemberImmediatelyLosesCatalog() throws Exception {
        var t=tenant();var member=actor();context.getBean(WorkspaceMemberRepository.class).saveAndFlush(new WorkspaceMember(t.workspace(),member.id(),WorkspaceRole.MEMBER,Instant.now()));
        mvc.perform(get(t.root()+"/templates").header("Authorization","Bearer "+member.access())).andExpect(status().isOk());
        jdbc.update("update collector.workspace_members set state='DISABLED' where workspace_id=? and user_id=?",t.workspace(),member.id());
        mvc.perform(get(t.root()+"/templates").header("Authorization","Bearer "+member.access())).andExpect(status().isNotFound());
        mvc.perform(get(t.root()+"/template-versions/"+VERSION).header("Authorization","Bearer "+member.access())).andExpect(status().isNotFound());
    }
    @Test void revokedSessionDeniesHttpAndDirectServiceReads() throws Exception {
        var t=tenant();context.getBean(AgencySessions.class).logoutAll(t.actor().jwt());
        mvc.perform(get(t.root()+"/templates").header("Authorization",bearer(t))).andExpect(status().isUnauthorized());
        assertThatThrownBy(()->as(t.actor(),()->service().read(t.workspace(),VERSION))).isInstanceOf(ApiException.class);
    }
    @Test void serviceItselfRequiresIdentityAndTenantAuthorization() {
        assertThatThrownBy(()->service().list(UUID.randomUUID(),null,null)).isInstanceOf(ApiException.class);
        var t=tenant();assertThatThrownBy(()->as(t.actor(),()->service().read(UUID.randomUUID(),VERSION))).isInstanceOf(ApiException.class);
        assertThat(Arrays.stream(TemplateCatalogRepository.class.getMethods()).map(java.lang.reflect.Method::getName)).doesNotContain("findAll","findById","save","deleteById");
    }
    @ParameterizedTest @ValueSource(strings={"/templates","/template-versions/"})
    void unsupportedMethodsStayDefaultDeniedEvenWithValidCsrf(String suffix) throws Exception {
        var t=tenant();String path=t.root()+suffix+(suffix.endsWith("/")?VERSION:"");
        for(String method:List.of("POST","PUT","PATCH","DELETE"))
            mvc.perform(request(org.springframework.http.HttpMethod.valueOf(method),path).with(csrf().asHeader()).header("Authorization",bearer(t)).contentType("application/json").content("{}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }
    @Test void unsupportedDescendantsProjectRoutesAndCrossOriginRemainClosed() throws Exception {
        var t=tenant();for(String suffix:List.of("/templates/other","/templates/other/versions","/projects/closed/sections","/template-versions/"+VERSION+"/extra"))
            mvc.perform(get(t.root()+suffix).header("Authorization",bearer(t))).andExpect(status().isForbidden());
        mvc.perform(options(t.root()+"/templates").header("Origin","https://untrusted.example").header("Access-Control-Request-Method","GET"))
            .andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }
    @Test void invalidFiltersAndIdentifiersHaveSafe400Problems() throws Exception {
        var t=tenant();for(String query:List.of("?projectType=NATIVE","?industry="+"x".repeat(81)))
            mvc.perform(get(t.root()+"/templates"+query).header("Authorization",bearer(t))).andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        mvc.perform(get(t.root()+"/templates").param("industry"," ").header("Authorization",bearer(t))).andExpect(status().isBadRequest());
        mvc.perform(get(t.root()+"/template-versions/not-a-uuid").header("Authorization",bearer(t))).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }
    @Test void readOnlyWorkspaceCanStillReadExistingCatalog() throws Exception {
        var t=tenant();jdbc.update("update collector.workspaces set state='READ_ONLY' where id=?",t.workspace());
        mvc.perform(get(t.root()+"/templates").header("Authorization",bearer(t))).andExpect(status().isOk());
    }
    void custom(Tenant t,UUID id,UUID version) {
        var d=seed().originals().get(0);
        jdbc.update("insert into collector.templates(id,workspace_id,template_key,project_type,industry,title,is_builtin,version) values (?,?,?,'WEBSITE','PLUMBER','Custom',false,1)",id,t.workspace(),"custom."+id);
        jdbc.update("insert into collector.template_versions(id,template_id,version_no,schema_version,definition) values (?,?,1,1,?::jsonb)",version,id,d.toString());
    }
    @Test void scopedRepositoryDoesNotLeakAnotherWorkspaceDefinitionOrCatalogEntry() throws Exception {
        var a=tenant();var b=tenant();UUID id=UUID.randomUUID(),version=UUID.randomUUID();custom(a,id,version);
        mvc.perform(get(a.root()+"/templates").header("Authorization",bearer(a))).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(11));
        mvc.perform(get(b.root()+"/templates").header("Authorization",bearer(b))).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(10));
        mvc.perform(get(b.root()+"/template-versions/"+version).header("Authorization",bearer(b))).andExpect(status().isNotFound());
        mvc.perform(get(a.root()+"/template-versions/"+version).header("Authorization",bearer(a))).andExpect(status().isOk());
    }
    @Test void concurrentSeedRunsAreIdempotentAndPreserveUserCreatedCatalog() throws Exception {
        var t=tenant();UUID id=UUID.randomUUID(),version=UUID.randomUUID();custom(t,id,version);
        String before=jdbc.queryForObject("select row_to_json(v)::text from collector.template_versions v where id=?",String.class,version);
        var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(4)){
            var jobs=new ArrayList<Future<?>>();for(int i=0;i<4;i++)jobs.add(pool.submit(()->{start.await();seed().seed();return null;}));
            start.countDown();for(var job:jobs)job.get(20,TimeUnit.SECONDS);
        }
        assertThat(count("templates")).isEqualTo(10);assertThat(count("template_versions")).isEqualTo(10);
        assertThat(jdbc.queryForObject("select row_to_json(v)::text from collector.template_versions v where id=?",String.class,version)).isEqualTo(before);
    }
    @Test void databaseRejectsDuplicateIdentityVersionUnsupportedTypeAndMutablePublishedContent() {
        UUID id=BuiltInTemplateSeeder.templateId(KEY);
        assertThatThrownBy(()->jdbc.update("insert into collector.templates(template_key,project_type,title,is_builtin) values (?,'WEBSITE','Duplicate',true)",KEY)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(()->jdbc.update("insert into collector.template_versions(template_id,version_no,schema_version,definition) values (?,1,1,'{}')",id)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(()->jdbc.update("insert into collector.templates(template_key,project_type,title,is_builtin) values ('invalid','NATIVE','Invalid',true)")).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(()->jdbc.update("update collector.template_versions set definition='{}' where id=?",VERSION)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(()->jdbc.update("delete from collector.template_versions where id=?",VERSION)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }
    @Test void seedDetectsPublishedConflictAndRollsBackWholeBatchWithoutOverwriting() {
        // Corruption is test-only, inside a rollback transaction with the immutable trigger temporarily disabled.
        tx().executeWithoutResult(status->{
            status.setRollbackOnly();jdbc.execute("alter table collector.template_versions disable trigger template_versions_immutable");
            var last=BuiltInTemplateSeeder.versionId("mobile_app.starter",1);
            jdbc.update("update collector.template_versions set definition=jsonb_set(definition,'{title}','\"Conflicting published title\"') where id=?",last);
            assertThatThrownBy(()->seed().seed()).isInstanceOf(IllegalStateException.class).hasMessageNotContaining("Conflicting published title");
            assertThat(jdbc.queryForObject("select definition->>'title' from collector.template_versions where id=?",String.class,last)).isEqualTo("Conflicting published title");
        });
        seed().seed();assertThat(count("template_versions")).isEqualTo(10);
    }
    @Test void failedStartupRollsBackNewSeedsAndPreservesConflictingPublishedDefinition() throws Exception {
        jdbc.execute("create database template_seed_conflict");String url="jdbc:postgresql://"+POSTGRES.getHost()+":"+POSTGRES.getMappedPort(5432)+"/template_seed_conflict";
        var source=new DriverManagerDataSource(url,POSTGRES.getUsername(),POSTGRES.getPassword());var data=new JdbcTemplate(source);
        Flyway.configure().dataSource(source).load().migrate();
        String key="mobile_app.starter";UUID id=BuiltInTemplateSeeder.templateId(key),version=BuiltInTemplateSeeder.versionId(key,1);
        var original=seed().originals().get(9);var conflict=(ObjectNode)original.deepCopy();conflict.put("title","Previously published title");
        data.update("insert into collector.templates(id,template_key,project_type,industry,title,is_builtin,version) values (?,?,'MOBILE_APP','GENERAL',?,true,1)",id,key,original.get("title").asText());
        data.update("insert into collector.template_versions(id,template_id,version_no,schema_version,definition) values (?,?,1,1,?::jsonb)",version,id,conflict.toString());
        assertThatThrownBy(()->start(url)).isInstanceOf(IllegalStateException.class).hasStackTraceContaining("No seed data was overwritten");
        assertThat(data.queryForObject("select count(*) from collector.templates",Integer.class)).isEqualTo(1);
        assertThat(data.queryForObject("select count(*) from collector.template_versions",Integer.class)).isEqualTo(1);
        assertThat(json.readTree(data.queryForObject("select definition::text from collector.template_versions where id=?",String.class,version))).isEqualTo(conflict);
    }
    @Test void seedingPreservesLaterPublishedVersionsAndHistoricReadsStayStable() {
        var t=tenant();
        tx().executeWithoutResult(status->{
            status.setRollbackOnly();var next=(ObjectNode)seed().originals().get(0).deepCopy();next.put("version",2).put("title","Next published version");
            UUID version=BuiltInTemplateSeeder.versionId(KEY,2);
            jdbc.update("insert into collector.template_versions(id,template_id,version_no,schema_version,definition) values (?,?,2,1,?::jsonb)",version,BuiltInTemplateSeeder.templateId(KEY),next.toString());
            seed().seed();
            assertThat(as(t.actor(),()->service().list(t.workspace(),null,"PLUMBER")).data()).singleElement().satisfies(summary->{
                assertThat(summary.version()).isEqualTo(2);assertThat(summary.versionId()).isEqualTo(version);
            });
            assertThat(as(t.actor(),()->service().read(t.workspace(),VERSION)).definition()).isEqualTo(seed().originals().get(0));
            assertThat(as(t.actor(),()->service().read(t.workspace(),version)).definition()).isEqualTo(next);
        });
    }
    @Test void restartingPreservesExactSeedsIdsTimestampsAndLiveWorkspaceSession() throws Exception {
        var t=tenant();String before=jdbc.queryForObject("select jsonb_agg(to_jsonb(v) order by id)::text from collector.template_versions v",String.class);
        context.close();open();
        assertThat(jdbc.queryForObject("select jsonb_agg(to_jsonb(v) order by id)::text from collector.template_versions v",String.class)).isEqualTo(before);
        mvc.perform(get(t.root()+"/template-versions/"+VERSION).header("Authorization",bearer(t))).andExpect(status().isOk());
        assertThat(count("templates")).isEqualTo(10);
    }
    @Test void v6UpgradePreservesExistingIdentityWorkspaceAndMembershipAcrossStartup() throws Exception {
        jdbc.execute("create database template_v6_upgrade");String url="jdbc:postgresql://"+POSTGRES.getHost()+":"+POSTGRES.getMappedPort(5432)+"/template_v6_upgrade";
        var source=new DriverManagerDataSource(url,POSTGRES.getUsername(),POSTGRES.getPassword());var data=new JdbcTemplate(source);
        Flyway.configure().dataSource(source).target("6").load().migrate();UUID user=UUID.randomUUID(),workspace=UUID.randomUUID();
        data.update("insert into collector.users(id,email_normalized,display_name,password_hash) values (?,'upgrade@example.test','Synthetic',?)",user,hash);
        data.update("insert into collector.workspaces(id,name,timezone) values (?,'Preserved workspace','UTC')",workspace);
        data.update("insert into collector.workspace_members(workspace_id,user_id,role) values (?,?,'OWNER')",workspace,user);
        try(var upgraded=start(url)){
            assertThat(upgraded.getBean(Flyway.class).info().applied()).hasSize(15);
            assertThat(upgraded.getBean(Flyway.class).validateWithResult().validationSuccessful).isTrue();
            assertThat(data.queryForObject("select name from collector.workspaces where id=?",String.class,workspace)).isEqualTo("Preserved workspace");
            assertThat(data.queryForObject("select count(*) from collector.workspace_members where workspace_id=? and user_id=?",Integer.class,workspace,user)).isEqualTo(1);
            assertThat(data.queryForObject("select password_hash from collector.users where id=?",String.class,user)).isEqualTo(hash);
            assertThat(data.queryForObject("select count(*) from collector.templates",Integer.class)).isEqualTo(10);
        }
    }
}

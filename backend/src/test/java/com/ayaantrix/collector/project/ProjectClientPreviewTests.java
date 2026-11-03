package com.ayaantrix.collector.project;
import com.ayaantrix.collector.project.entity.*;
import com.ayaantrix.collector.project.dto.ProjectDtos;
import com.ayaantrix.collector.project.dto.ProjectDtos.*;
import com.ayaantrix.collector.project.service.ProjectService;
import com.ayaantrix.collector.project.service.ProjectStructureService;
import com.ayaantrix.collector.project.dto.ProjectStructureDtos.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
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
class ProjectClientPreviewTests {
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
    ProjectStructureService editor(){return context.getBean(ProjectStructureService.class);}
    Detail detail(Tenant t,View p){return as(t.actor(),()->service().read(t.workspace(),p.id()));}
    UUID id(JsonNode n){return UUID.fromString(n.get("id").asText());}
    ObjectNode definition(JsonNode n){return ProjectStructureRepository.definition(n);}
    ObjectNode field(String key,String type){
        var n=json.createObjectNode().put("key",key).put("label","Synthetic field").put("type",type).put("instructions","").put("example","").put("required",true).put("enabled",true);
        var v=n.putObject("validation");switch(type){
            case "SHORT_TEXT"->v.put("maxLength",200);case "LONG_TEXT"->v.put("minLength",2).put("maxLength",10000);
            case "URL"->v.putArray("allowedSchemes").add("https").add("http");
            case "SINGLE_SELECT","MULTI_SELECT"->{v.putArray("options").addObject().put("key","yes").put("label","Yes");if(type.equals("MULTI_SELECT"))v.put("minOptions",0).put("maxOptions",1);}
            case "IMAGE","FILE"->{v.put("minFiles",0).put("maxFiles",10);v.putArray("allowedExtensions").add("png");}
            case "REPEATER"->{v.put("maxRows",20);var a=v.putArray("columns");for(String ct:List.of("SHORT_TEXT","LONG_TEXT","URL","NUMBER","SINGLE_SELECT","IMAGE")){var c=a.addObject().put("key",ct.toLowerCase()).put("label",ct).put("type",ct).put("required",true);if(ct.equals("SINGLE_SELECT"))c.putArray("options").addObject().put("key","yes").put("label","Yes");}}
        }return n;
    }
    JsonNode add(Tenant t,View p,UUID section,ObjectNode field){long v=detail(t,p).project().structureVersion();return as(t.actor(),()->editor().createItem(t.workspace(),p.id(),section,new ItemCreate(field,v)));}
    UUID emptySection(Tenant t,View p){long v=detail(t,p).project().structureVersion();return id(as(t.actor(),()->editor().createSection(t.workspace(),p.id(),new SectionCreate(null,"New section",v))));}
    Reorder ordering(Detail d){var sections=new ArrayList<UUID>();var items=new LinkedHashMap<UUID,List<UUID>>();for(var s:d.structure()){sections.add(id(s));var order=new ArrayList<UUID>();for(var i:s.get("items"))order.add(id(i));items.put(id(s),order);}return new Reorder(sections,items,d.project().structureVersion());}
    org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder write(Tenant t,View p,String method,String suffix,Object body){return request(org.springframework.http.HttpMethod.valueOf(method),t.root()+"/projects/"+p.id()+suffix).with(csrf().asHeader()).header("Authorization",bearer(t)).contentType("application/json").content(json.writeValueAsString(body));}
    void rejected(Tenant t,View p,Runnable operation,String code){var before=detail(t,p);long logs=count(t,"audit_logs");assertThatThrownBy(operation::run).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.getCode()).isEqualTo(code));assertThat(detail(t,p)).isEqualTo(before);assertThat(count(t,"audit_logs")).isEqualTo(logs);}
    com.ayaantrix.collector.project.service.ProjectClientService clients(){return context.getBean(com.ayaantrix.collector.project.service.ProjectClientService.class);}
    String projectRoot(Tenant t,View p){return t.root()+"/projects/"+p.id();}
    ObjectNode contactBody(Tenant t){return json.createObjectNode().put("clientId",t.client().toString()).put("name","Synthetic contact").put("email","Contact@Example.TEST").put("accessExpiresAt",NOW.plusSeconds(86400).toString());}
    org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder contactPost(Tenant t,View p,ObjectNode body){return post(projectRoot(t,p)+"/contacts").header("Authorization",bearer(t)).with(csrf().asHeader()).contentType("application/json").content(body.toString());}
    Map<String,Object> contentState(Tenant t){var map=new TreeMap<String,Object>();for(String table:List.of("clients","projects","project_snapshots","sections","items","audit_logs","project_contacts"))map.put(table,jdbc.queryForList("select to_jsonb(t)::text as row from collector."+table+" t where workspace_id=? order by id",t.workspace()));map.put("outbox",jdbc.queryForList("select to_jsonb(t)::text as row from collector.outbox_jobs t order by id"));return map;}

    @Test void contactsCreateListNormalizeAndNeverCreateIdentityOrDelivery() throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);long users=jdbc.queryForObject("select count(*) from collector.users",Long.class), members=count(t,"workspace_members"), outbox=jdbc.queryForObject("select count(*) from collector.outbox_jobs",Long.class);
        mvc.perform(contactPost(t,p,contactBody(t))).andExpect(status().isCreated()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$.contact.email").value("contact@example.test")).andExpect(jsonPath("$.contact.state").value("ACTIVE"));
        mvc.perform(get(projectRoot(t,p)+"/contacts").header("Authorization",bearer(t))).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1));
        assertThat(jdbc.queryForObject("select count(*) from collector.users",Long.class)).isEqualTo(users);assertThat(count(t,"workspace_members")).isEqualTo(members);assertThat(jdbc.queryForObject("select count(*) from collector.outbox_jobs",Long.class)).isEqualTo(outbox);
        assertThat(jdbc.queryForObject("select client_id from collector.project_contacts where workspace_id=?",UUID.class,t.workspace())).isEqualTo(t.client());
    }
    @Test void normalizedDuplicateIsProjectScopedAndSafeToRetry() throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);mvc.perform(contactPost(t,p,contactBody(t))).andExpect(status().isCreated());
        mvc.perform(contactPost(t,p,contactBody(t).put("email","contact@example.test"))).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONTACT_EXISTS"));
        var other=create(t,ProjectType.WEBSITE);mvc.perform(contactPost(t,other,contactBody(t))).andExpect(status().isCreated());assertThat(count(t,"project_contacts")).isEqualTo(2);
    }
    @Test void existingCustomersDoNotAcquireInventedEmailUniqueness() {
        var t=tenant();var a=as(t.actor(),()->service().createCustomer(t.workspace(),new CustomerCreate("Business A","Contact","same@example.test")));
        var b=as(t.actor(),()->service().createCustomer(t.workspace(),new CustomerCreate("Business B","Contact","same@example.test")));
        assertThat(a.id()).isNotEqualTo(b.id());
    }
    @ParameterizedTest @ValueSource(strings={"name-empty","name-long","email-invalid","email-blank","past","too-far","missing-client","missing-expiry"})
    void invalidContactInputsAreRejectedWithoutPartialWrites(String kind) throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var body=contactBody(t);
        switch(kind){case "name-empty"->body.put("name"," ");case "name-long"->body.put("name","x".repeat(151));case "email-invalid"->body.put("email","invalid");case "email-blank"->body.put("email","");case "past"->body.put("accessExpiresAt",NOW.toString());case "too-far"->body.put("accessExpiresAt",NOW.plusSeconds(90*86400L+1).toString());case "missing-client"->body.remove("clientId");case "missing-expiry"->body.remove("accessExpiresAt");}
        var before=contentState(t);mvc.perform(contactPost(t,p,body)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));assertThat(contentState(t)).isEqualTo(before);
    }
    @Test void foreignOrUnrelatedCustomerAndProjectAreHidden() throws Exception {
        var t=tenant();var other=tenant();var p=create(t,ProjectType.WEBSITE);var foreign=create(other,ProjectType.WEBSITE);
        for(UUID client:List.of(other.client(),UUID.randomUUID(),as(t.actor(),()->service().createCustomer(t.workspace(),new CustomerCreate("Other customer",null,null))).id()))
            mvc.perform(contactPost(t,p,contactBody(t).put("clientId",client.toString()))).andExpect(status().isNotFound());
        mvc.perform(contactPost(t,foreign,contactBody(t))).andExpect(status().isNotFound());
        mvc.perform(get(projectRoot(t,foreign)+"/contacts").header("Authorization",bearer(t))).andExpect(status().isNotFound());
        assertThat(count(t,"project_contacts")).isZero();
    }
    @Test void customerRenameUsesExactOptimisticVersionAndPreservesAssociatedContent() throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var before=contentState(t);String path=t.root()+"/clients/"+t.client();
        mvc.perform(patch(path).with(csrf().asHeader()).header("Authorization",bearer(t)).contentType("application/json").content("{\"businessName\":\"Renamed business\",\"expectedVersion\":0}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.client.version").value(1));
        mvc.perform(patch(path).with(csrf().asHeader()).header("Authorization",bearer(t)).contentType("application/json").content("{\"businessName\":\"Stale\",\"expectedVersion\":0}"))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("VERSION_CONFLICT")).andExpect(jsonPath("$.currentVersion").value(1));
        assertThat(detail(t,p).project().clientBusinessName()).isEqualTo("Renamed business");var after=contentState(t);before.remove("clients");after.remove("clients");assertThat(after).isEqualTo(before);
    }
    @ParameterizedTest @ValueSource(strings={"{}","{\"businessName\":\" \",\"expectedVersion\":0}","{\"businessName\":\"Valid\",\"expectedVersion\":-1}"})
    void invalidCustomerPatch(String body) throws Exception {var t=tenant();mvc.perform(patch(t.root()+"/clients/"+t.client()).with(csrf().asHeader()).header("Authorization",bearer(t)).contentType("application/json").content(body)).andExpect(status().isBadRequest());}
    @ParameterizedTest @ValueSource(strings={"DRAFT","ACTIVE","PAUSED","COMPLETED","ARCHIVED","DELETION_PENDING"})
    void previewNeverMutatesAnyProjectContentOrIssuesClientCapabilities(String state) throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);jdbc.update("update collector.projects set state=? where workspace_id=? and id=?",state,t.workspace(),p.id());var before=contentState(t);
        var res=mvc.perform(get(projectRoot(t,p)+"/client-preview").header("Authorization",bearer(t)).header("X-Request-ID","preview-test-123")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(header().doesNotExist("Set-Cookie")).andExpect(header().string("X-Request-ID","preview-test-123")).andExpect(jsonPath("$.preview.project.aiEnabled").value(false)).andReturn();
        var preview=json.readTree(res.getResponse().getContentAsString()).get("preview");assertThat(preview.get("sections").isArray()).isTrue();
        for(var section:preview.get("sections"))for(var item:section.get("items")){assertThat(item.get("canEdit").asBoolean()).isFalse();assertThat(item.get("answer").isNull()).isTrue();assertThat(item.get("comments").isEmpty()).isTrue();assertThat(item.get("assets").isEmpty()).isTrue();assertThat(item.has("currentRevisionId")).isFalse();}
        assertThat(contentState(t)).isEqualTo(before);
    }
    @ParameterizedTest @ValueSource(strings={"SHORT_TEXT","LONG_TEXT","URL","SINGLE_SELECT","MULTI_SELECT","IMAGE","FILE","REPEATER"})
    void previewUsesExistingSchemaAndAllEightFieldPresentations(String type) {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);UUID sid=emptySection(t,p);var added=add(t,p,sid,field("preview.field",type));
        var preview=as(t.actor(),()->clients().preview(t.workspace(),p.id()));var item=preview.sections().getLast().at("/items/0");assertThat(item.get("validation")).isEqualTo(added.get("validation"));assertThat(id(item)).isEqualTo(id(added));assertThat(item.get("required").asBoolean()).isTrue();
    }
    @Test void previewFiltersDisabledAndUnansweredConditionsAndPreservesOrderingAndSnapshots() {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);UUID sid=emptySection(t,p);var controller=add(t,p,sid,field("preview.choice","SINGLE_SELECT"));var dependent=field("preview.dependent","LONG_TEXT");dependent.putObject("visibleWhen").put("dependsOnItemKey","preview.choice").put("operator","EQUALS").put("optionKey","yes");add(t,p,sid,dependent);
        var disabled=add(t,p,sid,field("preview.disabled","SHORT_TEXT"));var def=definition(disabled);def.put("enabled",false);as(t.actor(),()->editor().patchItem(t.workspace(),p.id(),id(disabled),new ItemPatch(def,detail(t,p).project().structureVersion(),false)));
        var initial=detail(t,p);UUID first=id(initial.structure().getFirst());as(t.actor(),()->editor().patchSection(t.workspace(),p.id(),first,new SectionPatch(null,false,initial.project().structureVersion())));
        var order=ordering(detail(t,p));Collections.reverse(order.sectionIds());as(t.actor(),()->editor().reorder(t.workspace(),p.id(),order));
        String snapshot=jdbc.queryForObject("select definition::text from collector.project_snapshots where workspace_id=? and project_id=?",String.class,t.workspace(),p.id());
        var preview=as(t.actor(),()->clients().preview(t.workspace(),p.id()));assertThat(id(preview.sections().getFirst())).isEqualTo(sid);assertThat(preview.sections().getFirst().get("items").size()).isEqualTo(1);assertThat(id(preview.sections().getFirst().at("/items/0"))).isEqualTo(id(controller));assertThat(preview.sections().stream().map(this::id)).doesNotContain(first);
        assertThat(jdbc.queryForObject("select definition::text from collector.project_snapshots where workspace_id=? and project_id=?",String.class,t.workspace(),p.id())).isEqualTo(snapshot);
    }
    @Test void projectContactsAreCompositeForeignKeySafeAndCannotOrphanCustomer() {
        var t=tenant();var other=tenant();var p=create(t,ProjectType.WEBSITE);
        assertThatThrownBy(()->jdbc.update("insert into collector.project_contacts(workspace_id,project_id,client_id,name,email_normalized,access_expires_at) values(?,?,?,'Synthetic','fk@example.test',now()+interval '1 day')",t.workspace(),p.id(),other.client())).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(()->jdbc.update("delete from collector.clients where workspace_id=? and id=?",t.workspace(),t.client())).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }
    @Test void contactAndPreviewPersistAcrossRestartWithHibernateValidation() {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var contact=as(t.actor(),()->clients().createContact(t.workspace(),p.id(),new com.ayaantrix.collector.project.dto.ProjectClientDtos.ContactCreate(t.client(),"Synthetic","restart@example.test",NOW.plusSeconds(86400))));var preview=as(t.actor(),()->clients().preview(t.workspace(),p.id()));context.close();open();
        assertThat(as(t.actor(),()->clients().contacts(t.workspace(),p.id()))).containsExactly(contact);assertThat(as(t.actor(),()->clients().preview(t.workspace(),p.id()))).isEqualTo(preview);assertThat(context.getBean(Flyway.class).info().applied()).hasSize(22);assertThat(context.getBean(Flyway.class).validateWithResult().validationSuccessful).isTrue();
    }
    @Test void anonymousCsrfCrossTenantRevocationAndUnsupportedRoutesRemainClosed() throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);String root=projectRoot(t,p);var other=tenant();
        for(String suffix:List.of("/contacts","/client-preview")){
            mvc.perform(get(root+suffix)).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
            mvc.perform(get(root+suffix).header("Authorization",bearer(other))).andExpect(status().isNotFound());
        }
        mvc.perform(post(root+"/contacts").header("Authorization",bearer(t)).contentType("application/json").content(contactBody(t).toString())).andExpect(status().isForbidden());
        mvc.perform(patch(t.root()+"/clients/"+t.client()).header("Authorization",bearer(t)).contentType("application/json").content("{}" )).andExpect(status().isForbidden());
        for(String suffix:List.of("/contacts/unknown/invite/closed","/contacts/unknown/access"))mvc.perform(post(root+suffix).header("Authorization",bearer(t)).with(csrf().asHeader())).andExpect(status().isForbidden());
        jdbc.update("update collector.workspace_members set state='DISABLED' where workspace_id=? and user_id=?",t.workspace(),t.actor().id());
        mvc.perform(get(root+"/client-preview").header("Authorization",bearer(t))).andExpect(status().isNotFound());
        var otherProject=create(other,ProjectType.WEBSITE);jdbc.update("update collector.auth_sessions set revoked_at=now() where user_id=?",other.actor().id());
        mvc.perform(get(projectRoot(other,otherProject)+"/client-preview").header("Authorization",bearer(other))).andExpect(status().isUnauthorized());
    }
    @Test void unassignedMemberCannotReadPreviewOrContactEmails() throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var member=actor();jdbc.update("insert into collector.workspace_members(workspace_id,user_id,role) values(?,?,'MEMBER')",t.workspace(),member.id());
        for(String suffix:List.of("/contacts","/client-preview"))mvc.perform(get(projectRoot(t,p)+suffix).header("Authorization","Bearer "+member.access())).andExpect(status().isNotFound());
    }

    @ParameterizedTest @ValueSource(strings={"COMPLETED","ARCHIVED","DELETION_PENDING"})
    void closedProjectsRejectContactWrites(String state) throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);jdbc.update("update collector.projects set state=? where workspace_id=? and id=?",state,t.workspace(),p.id());
        mvc.perform(contactPost(t,p,contactBody(t))).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("READ_ONLY"));assertThat(count(t,"project_contacts")).isZero();
    }
    @Test void simultaneousDuplicateContactsHaveExactlyOneWinner() throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var pool=Executors.newFixedThreadPool(2);var gate=new CountDownLatch(1);
        Callable<String> task=()->{gate.await();try{as(t.actor(),()->clients().createContact(t.workspace(),p.id(),new com.ayaantrix.collector.project.dto.ProjectClientDtos.ContactCreate(t.client(),"Synthetic","race@example.test",NOW.plusSeconds(86400))));return "created";}catch(ApiException e){return "conflict";}};
        try{var a=pool.submit(task);var b=pool.submit(task);gate.countDown();assertThat(List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS))).containsExactlyInAnyOrder("created","conflict");assertThat(count(t,"project_contacts")).isEqualTo(1);}finally{pool.shutdownNow();}
    }
    @Test void v9UpgradePreservesCustomerRowsAndV10IsAdditive() {
        String database="t12_upgrade_"+UUID.randomUUID().toString().replace("-","");jdbc.execute("create database "+database);String url=POSTGRES.getJdbcUrl().substring(0,POSTGRES.getJdbcUrl().lastIndexOf('/')+1)+database;
        var source=new DriverManagerDataSource(url,POSTGRES.getUsername(),POSTGRES.getPassword());var data=new JdbcTemplate(source);
        var old=Flyway.configure().dataSource(source).target("9").load();old.migrate();UUID workspace=UUID.randomUUID(),customer=UUID.randomUUID();
        data.update("insert into collector.workspaces(id,name,timezone) values(?,'Preserved studio','UTC')",workspace);
        data.update("insert into collector.clients(id,workspace_id,business_name,contact_name,email_normalized) values(?,?,'Preserved customer','Synthetic contact','preserve@example.test')",customer,workspace);
        var before=data.queryForMap("select * from collector.clients where id=?",customer);
        try(var upgraded=start(url)){assertThat(upgraded.getBean(Flyway.class).info().applied()).hasSize(22);assertThat(data.queryForMap("select * from collector.clients where id=?",customer)).isEqualTo(before);assertThat(data.queryForObject("select count(*) from collector.project_contacts",Long.class)).isZero();}
    }
}

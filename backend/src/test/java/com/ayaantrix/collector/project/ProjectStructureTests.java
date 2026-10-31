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
class ProjectStructureTests {
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
    @Test void sectionLifecycleIsSoftStableVersionedAndAudited() throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var before=detail(t,p);
        var response=mvc.perform(write(t,p,"POST","/sections",Map.of("title","New section","expectedStructureVersion",1)))
            .andExpect(status().isCreated()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.section.items").isEmpty()).andReturn();
        UUID section=id(json.readTree(response.getResponse().getContentAsString()).get("section"));
        mvc.perform(write(t,p,"PATCH","/sections/"+section,new SectionPatch("Renamed",false,2L))).andExpect(status().isOk()).andExpect(jsonPath("$.section.id").value(section.toString())).andExpect(jsonPath("$.section.enabled").value(false));
        as(t.actor(),()->editor().patchSection(t.workspace(),p.id(),section,new SectionPatch(null,true,3L)));
        var after=detail(t,p);assertThat(after.project().structureVersion()).isEqualTo(4);assertThat(after.project().version()).isEqualTo(4);assertThat(after.structure()).hasSize(before.structure().size()+1);
        assertThat(count(t,"audit_logs")).isEqualTo(3);assertThat(jdbc.queryForList("select metadata_json::text from collector.audit_logs where workspace_id=?",String.class,t.workspace())).allSatisfy(m->assertThat(json.readTree(m).propertyNames()).containsExactly("structureVersion"));
        assertThat(jdbc.queryForObject("select count(*) from collector.project_snapshots where workspace_id=? and structure_version=1",Integer.class,t.workspace())).isEqualTo(1);
    }
    @ParameterizedTest @ValueSource(strings={"SHORT_TEXT","LONG_TEXT","URL","SINGLE_SELECT","MULTI_SELECT","IMAGE","FILE","REPEATER"})
    void everySupportedFieldCreatesEditsDisablesAndPreservesConfiguration(String type) throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);UUID s=emptySection(t,p);var def=field("new.field",type);
        var response=mvc.perform(write(t,p,"POST","/sections/"+s+"/items",new ItemCreate(def,2L))).andExpect(status().isCreated()).andExpect(jsonPath("$.item.type").value(type)).andExpect(jsonPath("$.item.version").value(1)).andReturn();
        var item=json.readTree(response.getResponse().getContentAsString()).get("item");var updated=definition(item);updated.put("label","Changed label").put("instructions","Changed instructions").put("example","Example").put("enabled",false);
        mvc.perform(write(t,p,"PATCH","/items/"+id(item)+"/schema",new ItemPatch(updated,3L,false))).andExpect(status().isOk()).andExpect(jsonPath("$.item.version").value(2)).andExpect(jsonPath("$.item.enabled").value(false)).andExpect(jsonPath("$.item.visible").value(false));
        var persisted=detail(t,p).structure().getLast().get("items").get(0);assertThat(persisted.get("validation")).isEqualTo(def.get("validation"));assertThat(id(persisted)).isEqualTo(id(item));assertThat(persisted.get("state").asText()).isEqualTo("NOT_STARTED");
        updated.put("enabled",true);as(t.actor(),()->editor().patchItem(t.workspace(),p.id(),id(item),new ItemPatch(updated,4L,false)));assertThat(detail(t,p).structure().getLast().at("/items/0/visible").asBoolean()).isTrue();
    }
    static Stream<String> badDefinitions(){return Stream.of(
        "{\"type\":\"BOOLEAN\"}","{\"type\":\"DATE\"}","{\"type\":\"NUMBER\"}","{\"key\":\"bad key\"}","{\"label\":\" \"}","{\"required\":\"yes\"}","{\"enabled\":null}","{\"unexpected\":true}","{\"version\":2}","{\"validation\":{\"maxLength\":201}}","{\"validation\":{\"minLength\":6,\"maxLength\":5}}","{\"validation\":{\"maxLength\":1.5}}","{\"validation\":{}}",
        "{\"type\":\"URL\",\"validation\":{\"allowedSchemes\":[\"javascript\"]}}","{\"type\":\"SINGLE_SELECT\",\"validation\":{\"options\":[]}}",
        "{\"type\":\"MULTI_SELECT\",\"validation\":{\"options\":[{\"key\":\"a\",\"label\":\"A\"}],\"maxOptions\":2}}",
        "{\"type\":\"FILE\",\"validation\":{\"maxFiles\":51}}","{\"type\":\"IMAGE\",\"validation\":{\"maxFiles\":1,\"allowedExtensions\":[\".png\"]}}",
        "{\"type\":\"REPEATER\",\"validation\":{\"maxRows\":21,\"columns\":[]}}","{\"type\":\"REPEATER\",\"validation\":{\"maxRows\":20,\"columns\":[{\"key\":\"x\",\"label\":\"X\",\"type\":\"REPEATER\",\"required\":true}]}}",
        "{\"ai\":{\"enabled\":true,\"targetWords\":150}}","{\"visibleWhen\":{\"dependsOnItemKey\":\"foreign\",\"operator\":\"EQUALS\",\"optionKey\":\"yes\"}}"
    );}
    @ParameterizedTest @MethodSource("badDefinitions") void invalidConfigurationRollsBack(String changes) throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);UUID s=emptySection(t,p);var def=field("invalid","SHORT_TEXT");def.setAll((ObjectNode)json.readTree(changes));
        var before=detail(t,p);mvc.perform(write(t,p,"POST","/sections/"+s+"/items",new ItemCreate(def,2L))).andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED")).andExpect(jsonPath("$.errors").isArray());assertThat(detail(t,p)).isEqualTo(before);assertThat(count(t,"audit_logs")).isEqualTo(1);
    }
    @Test void fullResultValidationProtectsDependenciesAndRejectsCyclesAndOptionChanges(){
        var t=tenant();var p=create(t,ProjectType.WEBSITE);UUID s=emptySection(t,p);var controller=add(t,p,s,field("controller","SINGLE_SELECT"));
        var def=field("dependent","LONG_TEXT");def.putObject("visibleWhen").put("dependsOnItemKey","controller").put("operator","EQUALS").put("optionKey","yes");var dependent=add(t,p,s,def);
        assertThat(dependent.get("visible").asBoolean()).isFalse();
        var change=definition(controller);change.put("enabled",false);rejected(t,p,()->as(t.actor(),()->editor().patchItem(t.workspace(),p.id(),id(controller),new ItemPatch(change,4L,false))),"VALIDATION_FAILED");
        var option=definition(controller);((ObjectNode)option.at("/validation/options/0")).put("key","no");rejected(t,p,()->as(t.actor(),()->editor().patchItem(t.workspace(),p.id(),id(controller),new ItemPatch(option,4L,false))),"VALIDATION_FAILED");
        var type=field("controller","SHORT_TEXT");rejected(t,p,()->as(t.actor(),()->editor().patchItem(t.workspace(),p.id(),id(controller),new ItemPatch(type,4L,false))),"VALIDATION_FAILED");
        var cycle=definition(controller);cycle.putObject("visibleWhen").put("dependsOnItemKey","dependent").put("operator","EQUALS").put("optionKey","yes");rejected(t,p,()->as(t.actor(),()->editor().patchItem(t.workspace(),p.id(),id(controller),new ItemPatch(cycle,4L,false))),"VALIDATION_FAILED");
        var order=ordering(detail(t,p));Collections.reverse(order.itemOrderBySection().get(s));rejected(t,p,()->as(t.actor(),()->editor().reorder(t.workspace(),p.id(),order)),"VALIDATION_FAILED");
        var clear=definition(dependent);clear.remove("visibleWhen");as(t.actor(),()->editor().patchItem(t.workspace(),p.id(),id(dependent),new ItemPatch(clear,4L,false)));assertThat(detail(t,p).structure().getLast().at("/items/1/visible").asBoolean()).isTrue();
    }
    @Test void stableKeysAndCrossSectionDependencyAreRejected(){
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var d=detail(t,p);var item=d.structure().getFirst().at("/items/0");var changed=definition(item);changed.put("key","different");
        rejected(t,p,()->as(t.actor(),()->editor().patchItem(t.workspace(),p.id(),id(item),new ItemPatch(changed,1L,false))),"VALIDATION_FAILED");
        UUID a=emptySection(t,p),b=emptySection(t,p);add(t,p,a,field("only.a","SINGLE_SELECT"));var def=field("only.b","LONG_TEXT");def.putObject("visibleWhen").put("dependsOnItemKey","only.a").put("operator","EQUALS").put("optionKey","yes");
        rejected(t,p,()->as(t.actor(),()->editor().createItem(t.workspace(),p.id(),b,new ItemCreate(def,4L))),"VALIDATION_FAILED");
    }
    @Test void duplicatesAndEmptyPatchesRejectWithoutLosingState() throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var section=detail(t,p).structure().getFirst();
        rejected(t,p,()->as(t.actor(),()->editor().createSection(t.workspace(),p.id(),new SectionCreate(section.get("key").asText(),"Duplicate",1L))),"VALIDATION_FAILED");
        rejected(t,p,()->as(t.actor(),()->editor().createItem(t.workspace(),p.id(),id(section),new ItemCreate(definition(section.at("/items/0")),1L))),"VALIDATION_FAILED");
        rejected(t,p,()->as(t.actor(),()->editor().patchSection(t.workspace(),p.id(),id(section),new SectionPatch(null,null,1L))),"VALIDATION_FAILED");
    }
    @ParameterizedTest @ValueSource(strings={"DRAFT","ACTIVE","PAUSED","COMPLETED","ARCHIVED","DELETION_PENDING"}) void projectLifecycleRestrictsEditingAndPermissionDto(String state) throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);jdbc.update("update collector.projects set state=? where workspace_id=? and id=?",state,t.workspace(),p.id());boolean allowed=List.of("DRAFT","ACTIVE","PAUSED").contains(state);
        mvc.perform(write(t,p,"POST","/sections",new SectionCreate(null,"State test",1L))).andExpect(status().is(allowed?201:409));assertThat(detail(t,p).project().permissions().canEditStructure()).isEqualTo(allowed);
    }
    @ParameterizedTest @ValueSource(strings={"NOT_STARTED","DRAFT","SUBMITTED","APPROVED","CHANGES_REQUESTED"}) void collectedWorkCannotBeSilentlyResetOrFakeReopened(String state){
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var item=detail(t,p).structure().getFirst().at("/items/0");jdbc.update("update collector.items set state=? where workspace_id=? and id=?",state,t.workspace(),id(item));
        var def=definition(item);def.put("required",false);
        if(state.equals("NOT_STARTED"))as(t.actor(),()->editor().patchItem(t.workspace(),p.id(),id(item),new ItemPatch(def,1L,true)));
        else rejected(t,p,()->as(t.actor(),()->editor().patchItem(t.workspace(),p.id(),id(item),new ItemPatch(def,1L,true))),"REOPEN_REQUIRED");
        assertThat(jdbc.queryForObject("select state from collector.items where workspace_id=? and id=?",String.class,t.workspace(),id(item))).isEqualTo(state);
    }
    @Test void disablingSectionHidesItemsAndChangesProgressWithoutDeleting(){
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var before=detail(t,p);var section=before.structure().getFirst();long items=count(t,"items");
        as(t.actor(),()->editor().patchSection(t.workspace(),p.id(),id(section),new SectionPatch(null,false,1L)));var after=detail(t,p);assertThat(after.progress().requiredTotal()).isLessThan(before.progress().requiredTotal());
        for(var item:after.structure().getFirst().get("items"))assertThat(item.get("visible").asBoolean()).isFalse();assertThat(count(t,"items")).isEqualTo(items);as(t.actor(),()->editor().patchSection(t.workspace(),p.id(),id(section),new SectionPatch(null,true,2L)));assertThat(detail(t,p).progress()).isEqualTo(before.progress());
    }
    @Test void reordersBothLevelsWithDeferredUniquenessAndStableIds(){
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var before=detail(t,p);var order=ordering(before);Collections.reverse(order.sectionIds());order.itemOrderBySection().values().forEach(Collections::reverse);
        assertThat(as(t.actor(),()->editor().reorder(t.workspace(),p.id(),order))).isEqualTo(2);var after=detail(t,p);assertThat(id(after.structure().getFirst())).isEqualTo(id(before.structure().getLast()));
        assertThat(id(after.structure().getLast().get("items").get(0))).isEqualTo(id(before.structure().getFirst().get("items").get(before.structure().getFirst().get("items").size()-1)));
        assertThat(after.progress()).isEqualTo(before.progress());assertThat(count(t,"audit_logs")).isEqualTo(1);
    }
    @ParameterizedTest @ValueSource(strings={"DUPLICATE_SECTION","MISSING_SECTION","FOREIGN_SECTION","MISSING_MAP","DUPLICATE_ITEM","MISSING_ITEM","MOVE_ITEM"})
    void reorderMustBeExactPermutationInEachSection(String kind){
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var d=detail(t,p);var order=ordering(d);UUID s=order.sectionIds().getFirst();var items=order.itemOrderBySection().get(s);
        switch(kind){case "DUPLICATE_SECTION"->order.sectionIds().set(1,s);case "MISSING_SECTION"->order.sectionIds().removeLast();case "FOREIGN_SECTION"->order.sectionIds().set(0,UUID.randomUUID());case "MISSING_MAP"->order.itemOrderBySection().remove(s);case "DUPLICATE_ITEM"->items.set(1,items.getFirst());case "MISSING_ITEM"->items.removeLast();case "MOVE_ITEM"->{UUID second=order.sectionIds().get(1);UUID moved=items.removeFirst();order.itemOrderBySection().get(second).add(moved);}}
        rejected(t,p,()->as(t.actor(),()->editor().reorder(t.workspace(),p.id(),order)),"VALIDATION_FAILED");
    }
    @Test void staleHttpConflictReturnsSafeCurrentVersionAndCorrelation() throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);emptySection(t,p);var before=detail(t,p);
        mvc.perform(write(t,p,"POST","/sections",new SectionCreate(null,"Stale unsaved draft",1L)).header("X-Request-ID","structure-stale"))
            .andExpect(status().isConflict()).andExpect(content().contentTypeCompatibleWith("application/problem+json")).andExpect(jsonPath("$.code").value("STRUCTURE_CONFLICT")).andExpect(jsonPath("$.currentVersion").value(2)).andExpect(jsonPath("$.traceId").value("structure-stale")).andExpect(header().string("X-Request-ID","structure-stale"));assertThat(detail(t,p)).isEqualTo(before);
        mvc.perform(write(t,p,"POST","/sections",new SectionCreate(null,"Retried draft",2L))).andExpect(status().isCreated());
        jdbc.update("update collector.projects set structure_version=128 where workspace_id=?",t.workspace());assertThat(as(t.actor(),()->editor().createSection(t.workspace(),p.id(),new SectionCreate(null,"Large numeric version",128L)))).isNotNull();assertThat(detail(t,p).project().structureVersion()).isEqualTo(129);
    }
    @Test void twoWritersCannotOverwriteAndRetryUsesLatestVersion() throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var gate=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)){
            var tasks=new ArrayList<Future<String>>();for(int i=0;i<2;i++)tasks.add(pool.submit(()->{gate.await();try{as(t.actor(),()->editor().createSection(t.workspace(),p.id(),new SectionCreate(null,"Concurrent",1L)));return "OK";}catch(ApiException e){return e.getCode();}}));
            gate.countDown();assertThat(List.of(tasks.get(0).get(20,TimeUnit.SECONDS),tasks.get(1).get(20,TimeUnit.SECONDS))).containsExactlyInAnyOrder("OK","STRUCTURE_CONFLICT");
        }assertThat(count(t,"audit_logs")).isEqualTo(1);assertThat(detail(t,p).project().structureVersion()).isEqualTo(2);emptySection(t,p);assertThat(detail(t,p).project().structureVersion()).isEqualTo(3);
    }
    @ParameterizedTest @ValueSource(strings={"sections","items","projects","audit_logs"}) void anyPersistenceFailureRollsBackRowsVersionsAndAudit(String table) throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var before=detail(t,p);var def=definition(before.structure().getFirst().at("/items/0"));def.put("label","Should roll back");
        jdbc.execute("create function collector.fail_structure_test() returns trigger language plpgsql as $$ begin raise exception 'Synthetic private failure'; end; $$");jdbc.execute("create trigger fail_structure_test before insert or update on collector."+table+" for each row execute function collector.fail_structure_test()");
        try{var call=table.equals("items")?write(t,p,"PATCH","/items/"+id(before.structure().getFirst().at("/items/0"))+"/schema",new ItemPatch(def,1L,false)):write(t,p,"POST","/sections",new SectionCreate(null,"Failed",1L));
            mvc.perform(call).andExpect(status().isInternalServerError()).andExpect(jsonPath("$.code").value("INTERNAL_SERVER_ERROR")).andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("Synthetic private"))));assertThat(detail(t,p)).isEqualTo(before);assertThat(count(t,"audit_logs")).isZero();
        }finally{jdbc.execute("drop trigger fail_structure_test on collector."+table);jdbc.execute("drop function collector.fail_structure_test()");}
    }
    @ParameterizedTest @ValueSource(strings={"MEMBER","REVOKED","FOREIGN","DISABLED_USER","LOGOUT","READ_ONLY","EXPIRED_PLAN","MISSING_PLAN"})
    void liveAuthorizationAndPlanChecksBlockStructureWrites(String kind) throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);String authorization=bearer(t);int expected=403;
        switch(kind){
            case "MEMBER"->{var m=actor();context.getBean(WorkspaceMemberRepository.class).saveAndFlush(new WorkspaceMember(t.workspace(),m.id(),WorkspaceRole.MEMBER,NOW));authorization="Bearer "+m.access();}
            case "REVOKED"->{jdbc.update("update collector.workspace_members set state='DISABLED' where workspace_id=?",t.workspace());expected=404;}
            case "FOREIGN"->{authorization=bearer(tenant());expected=404;}
            case "DISABLED_USER"->{jdbc.update("update collector.users set state='DISABLED' where id=?",t.actor().id());expected=401;}
            case "LOGOUT"->{context.getBean(AgencySessions.class).logoutAll(t.actor().jwt());expected=401;}
            case "READ_ONLY"->jdbc.update("update collector.workspaces set state='READ_ONLY' where id=?",t.workspace());
            case "EXPIRED_PLAN"->jdbc.update("update collector.subscriptions set current_period_start=?,current_period_end=? where workspace_id=?",java.sql.Timestamp.from(NOW.minusSeconds(86400)),java.sql.Timestamp.from(NOW),t.workspace());
            case "MISSING_PLAN"->jdbc.update("delete from collector.subscriptions where workspace_id=?",t.workspace());
        }
        final String header=authorization;
        mvc.perform(write(t,p,"POST","/sections",new SectionCreate(null,"Denied",1L)).with(r->{r.removeHeader("Authorization");r.addHeader("Authorization",header);return r;})).andExpect(status().is(expected));
        assertThat(count(t,"audit_logs")).isZero();assertThat(jdbc.queryForObject("select structure_version from collector.projects where workspace_id=? and id=?",Long.class,t.workspace(),p.id())).isEqualTo(1);
    }
    @Test void foreignSectionItemAndForgedProjectAreScoped404s() throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var other=create(t,ProjectType.WEB_APP);var foreign=detail(t,other).structure().getFirst();
        mvc.perform(write(t,p,"PATCH","/sections/"+id(foreign),new SectionPatch("Forbidden",null,1L))).andExpect(status().isNotFound());
        mvc.perform(write(t,p,"POST","/sections/"+id(foreign)+"/items",new ItemCreate(field("forged","URL"),1L))).andExpect(status().isNotFound());
        mvc.perform(write(t,p,"PATCH","/items/"+id(foreign.at("/items/0"))+"/schema",new ItemPatch(definition(foreign.at("/items/0")),1L,false))).andExpect(status().isNotFound());
        mvc.perform(post(t.root()+"/projects/"+UUID.randomUUID()+"/sections").with(csrf().asHeader()).header("Authorization",bearer(t)).contentType("application/json").content("{\"title\":\"Missing\",\"expectedStructureVersion\":1}")).andExpect(status().isNotFound());assertThat(count(t,"audit_logs")).isZero();
    }
    @ParameterizedTest @ValueSource(strings={"{","{}","{\"title\":\" \"}","{\"title\":\"A\",\"expectedStructureVersion\":-1}","{\"title\":\"A\",\"expectedStructureVersion\":null}"})
    void malformedBodiesUseStandard400(String raw) throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);mvc.perform(write(t,p,"POST","/sections",Map.of()).content(raw)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors").isArray());assertThat(count(t,"audit_logs")).isZero();
    }
    @Test void exactRoutesRequireIdentityCsrfAndRestrictedCors() throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var s=detail(t,p).structure().getFirst();
        var paths=Map.of("/sections","POST","/sections/"+id(s),"PATCH","/sections/"+id(s)+"/items","POST","/items/"+id(s.at("/items/0"))+"/schema","PATCH","/structure/reorder","POST");
        for(var entry:paths.entrySet()){
            mvc.perform(write(t,p,entry.getValue(),entry.getKey(),Map.of()).with(r->{r.removeHeader("Authorization");return r;})).andExpect(status().isUnauthorized());
            mvc.perform(request(org.springframework.http.HttpMethod.valueOf(entry.getValue()),t.root()+"/projects/"+p.id()+entry.getKey()).header("Authorization",bearer(t)).contentType("application/json").content("{}")) .andExpect(status().isForbidden());
        }
        mvc.perform(delete(t.root()+"/projects/"+p.id()+"/sections/"+id(s)).with(csrf().asHeader()).header("Authorization",bearer(t))).andExpect(status().isForbidden());
        mvc.perform(get(t.root()+"/projects/"+p.id()+"/structure").header("Authorization",bearer(t))).andExpect(status().isForbidden());
        mvc.perform(options(t.root()+"/projects/"+p.id()+"/sections").header("Origin","https://untrusted.example").header("Access-Control-Request-Method","POST")).andExpect(status().isForbidden());
    }
    @ParameterizedTest @ValueSource(strings={"ROWS","COLUMNS","DUPLICATE_COLUMN","MIN_ROWS","OPTIONS","NESTED"})
    void repeaterBoundsAndUnsupportedPropertiesReject(String kind){
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var d=field("repeater","REPEATER");var v=(ObjectNode)d.get("validation");var c=(ArrayNode)v.get("columns");
        switch(kind){case "ROWS"->v.put("maxRows",0);case "COLUMNS"->{for(int i=0;i<3;i++)c.add(c.get(0).deepCopy());}case "DUPLICATE_COLUMN"->c.add(c.get(0).deepCopy());case "MIN_ROWS"->v.put("minRows",1);case "OPTIONS"->((ObjectNode)c.get(0)).putArray("options");case "NESTED"->((ObjectNode)c.get(0)).put("type","FILE");}
        UUID s=id(detail(t,p).structure().getFirst());rejected(t,p,()->as(t.actor(),()->editor().createItem(t.workspace(),p.id(),s,new ItemCreate(d,1L))),"VALIDATION_FAILED");
    }
    @ParameterizedTest @ValueSource(strings={"SECTIONS","PER_SECTION","TOTAL"}) void projectLimitsIncludeDisabledRecords(String kind){
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var sections=new ArrayList<JsonNode>();
        int count=kind.equals("SECTIONS")?31:kind.equals("TOTAL")?7:1;
        for(int si=0;si<count;si++){var s=json.createObjectNode().put("id",UUID.randomUUID().toString()).put("key","section"+si).put("title","Section").put("enabled",false).put("sortOrder",si);var items=s.putArray("items");int n=kind.equals("SECTIONS")?0:kind.equals("PER_SECTION")?51:50;
            for(int ii=0;ii<n;ii++)items.add(field("f"+si+"_"+ii,"SHORT_TEXT").put("enabled",false));sections.add(s);}
        var project=context.getBean(ProjectRepository.class).findByWorkspaceIdAndId(t.workspace(),p.id()).orElseThrow();
        assertThatThrownBy(()->context.getBean(com.ayaantrix.collector.project.service.ProjectStructureValidationService.class).validate(project,sections)).isInstanceOf(ApiException.class);
    }
    @Test void editsPreserveOtherProjectsCatalogAndImmutableSnapshotAcrossRestart(){
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var other=create(t,ProjectType.WEBSITE);var untouched=detail(t,other);
        String snapshot=jdbc.queryForObject("select definition::text from collector.project_snapshots where workspace_id=? and project_id=?",String.class,t.workspace(),p.id());
        var catalog=jdbc.queryForList("select definition::text from collector.template_versions order by id",String.class);var first=detail(t,p).structure().getFirst();
        as(t.actor(),()->editor().patchSection(t.workspace(),p.id(),id(first),new SectionPatch("Project-only",false,1L)));var after=detail(t,p);
        context.close();open();assertThat(detail(t,p)).isEqualTo(after);assertThat(detail(t,other)).isEqualTo(untouched);
        assertThat(jdbc.queryForObject("select definition::text from collector.project_snapshots where workspace_id=? and project_id=?",String.class,t.workspace(),p.id())).isEqualTo(snapshot);assertThat(jdbc.queryForList("select definition::text from collector.template_versions order by id",String.class)).isEqualTo(catalog);
        assertThat(context.getBean(Flyway.class).info().applied()).hasSize(15);assertThat(context.getBean(Flyway.class).validateWithResult().validationSuccessful).isTrue();assertThat(context.getEnvironment().getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("validate");
    }

    @ParameterizedTest @ValueSource(strings={"NOT_STARTED","DRAFT","SUBMITTED","APPROVED","CHANGES_REQUESTED"})
    void collectedMetadataEditsAndPureOrderingPreserveStateHistoryAndIds(String state){
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var before=detail(t,p);var section=before.structure().getFirst();var item=section.at("/items/0");
        String snapshot=jdbc.queryForObject("select definition::text from collector.project_snapshots where workspace_id=? and project_id=?",String.class,t.workspace(),p.id());
        jdbc.update("update collector.items set state=? where workspace_id=? and id=?",state,t.workspace(),id(item));
        var metadata=definition(item);metadata.put("label","Metadata only").put("instructions","New instructions").put("example","A clearly labelled example");
        as(t.actor(),()->editor().patchItem(t.workspace(),p.id(),id(item),new ItemPatch(metadata,1L,false)));
        as(t.actor(),()->editor().patchSection(t.workspace(),p.id(),id(section),new SectionPatch("Renamed section",null,2L)));
        var order=ordering(detail(t,p));Collections.reverse(order.sectionIds());order.itemOrderBySection().values().forEach(Collections::reverse);
        as(t.actor(),()->editor().reorder(t.workspace(),p.id(),order));
        assertThat(jdbc.queryForObject("select state from collector.items where workspace_id=? and id=?",String.class,t.workspace(),id(item))).isEqualTo(state);
        assertThat(jdbc.queryForObject("select section_id from collector.items where workspace_id=? and id=?",UUID.class,t.workspace(),id(item))).isEqualTo(id(section));
        assertThat(jdbc.queryForObject("select definition::text from collector.project_snapshots where workspace_id=? and project_id=?",String.class,t.workspace(),p.id())).isEqualTo(snapshot);
        assertThat(detail(t,p).project().structureVersion()).isEqualTo(4);assertThat(count(t,"audit_logs")).isEqualTo(3);
    }
    static Stream<Arguments> collectedStatesAndReopenIntent(){return Stream.of("DRAFT","SUBMITTED","APPROVED","CHANGES_REQUESTED").flatMap(state->Stream.of(Arguments.of(state,false),Arguments.of(state,true)));}
    @ParameterizedTest @MethodSource("collectedStatesAndReopenIntent")
    void clientReopenFlagNeverAuthorizesCollectedSchemaChanges(String state,boolean reopen) throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var item=detail(t,p).structure().getFirst().at("/items/0");
        jdbc.update("update collector.items set state=? where workspace_id=? and id=?",state,t.workspace(),id(item));
        var def=definition(item);def.put("required",false);var before=detail(t,p);
        mvc.perform(write(t,p,"PATCH","/items/"+id(item)+"/schema",new ItemPatch(def,1L,reopen)).header("X-Request-ID","collected-work-safe"))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("REOPEN_REQUIRED"))
            .andExpect(header().string("X-Request-ID","collected-work-safe")).andExpect(jsonPath("$.traceId").value("collected-work-safe"));
        assertThat(detail(t,p)).isEqualTo(before);assertThat(count(t,"audit_logs")).isZero();
    }
    @ParameterizedTest @ValueSource(strings={"DRAFT","SUBMITTED","APPROVED","CHANGES_REQUESTED"})
    void controllingItemChangesCannotBypassProtectionOfCollectedDependents(String state){
        var t=tenant();var p=create(t,ProjectType.WEBSITE);UUID section=emptySection(t,p);var control=add(t,p,section,field("control","SINGLE_SELECT"));
        var conditional=field("dependent","LONG_TEXT");conditional.putObject("visibleWhen").put("dependsOnItemKey","control").put("operator","EQUALS").put("optionKey","yes");var child=add(t,p,section,conditional);
        jdbc.update("update collector.items set state=? where workspace_id=? and id=?",state,t.workspace(),id(child));
        var change=definition(control);((ArrayNode)change.at("/validation/options")).addObject().put("key","no").put("label","No");
        rejected(t,p,()->as(t.actor(),()->editor().patchItem(t.workspace(),p.id(),id(control),new ItemPatch(change,4L,true))),"REOPEN_REQUIRED");
        // The uncollected controller itself is still NOT_STARTED: protection came from the full impact plan.
        assertThat(jdbc.queryForObject("select state from collector.items where workspace_id=? and id=?",String.class,t.workspace(),id(control))).isEqualTo("NOT_STARTED");
    }
    @ParameterizedTest @ValueSource(booleans={false,true})
    void bothSectionVisibilityTransitionsRequireCollectedWorkHandling(boolean enabled){
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var section=detail(t,p).structure().getFirst();var item=section.at("/items/0");
        jdbc.update("update collector.items set state='DRAFT' where workspace_id=? and id=?",t.workspace(),id(item));
        jdbc.update("update collector.sections set enabled=? where workspace_id=? and id=?",!enabled,t.workspace(),id(section));
        rejected(t,p,()->as(t.actor(),()->editor().patchSection(t.workspace(),p.id(),id(section),new SectionPatch(null,enabled,1L))),"REOPEN_REQUIRED");
    }
    @Test void impactPlanIdentifiesDraftAndRevisionMarkersWithoutCreatingLaterModels(){
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var section=detail(t,p).structure().getFirst();
        UUID draft=id(section.at("/items/0")),submitted=id(section.at("/items/1"));
        jdbc.update("update collector.items set state='DRAFT' where workspace_id=? and id=?",t.workspace(),draft);
        jdbc.update("update collector.items set state='SUBMITTED' where workspace_id=? and id=?",t.workspace(),submitted);
        var before=detail(t,p).structure();var after=before.stream().map(JsonNode::deepCopy).toList();((ObjectNode)after.getFirst()).put("enabled",false);
        var policy=context.getBean(com.ayaantrix.collector.project.service.ProjectStructureMutationPolicy.class);var impact=policy.assess(before,after);
        assertThat(impact.draftItemIds()).containsExactly(draft);assertThat(impact.revisionItemIds()).containsExactly(submitted);assertThat(impact.affectedItemIds()).contains(draft,submitted);
        assertThatThrownBy(()->impact.draftItemIds().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(()->policy.requireSupported(impact,true)).isInstanceOf(ApiException.class);
        assertThat(count(t,"answers")).isZero();assertThat(jdbc.queryForObject("select count(*) from collector.submission_revisions",Integer.class)).isZero();
    }
    @Test void impactBoundaryRejectsHardRemovalAndStillAllowsUntouchedNewRequests(){
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var before=detail(t,p).structure();var after=new ArrayList<JsonNode>();for(var s:before)after.add(s.deepCopy());
        ((ArrayNode)after.getFirst().get("items")).remove(0);
        var policy=context.getBean(com.ayaantrix.collector.project.service.ProjectStructureMutationPolicy.class);
        assertThatThrownBy(()->policy.assess(before,after)).isInstanceOf(ApiException.class);
        assertThat(policy.assess(before,before).requiresCollectedWorkHandling()).isFalse();
        var item=before.getFirst().at("/items/0");jdbc.update("update collector.items set state='APPROVED' where workspace_id=? and id=?",t.workspace(),id(item));
        UUID s=emptySection(t,p);add(t,p,s,field("new.request","SHORT_TEXT"));assertThat(detail(t,p).project().structureVersion()).isEqualTo(3);
    }
    @ParameterizedTest @ValueSource(strings={"REVOKE","DEMOTE","ARCHIVE","VERSION"})
    void waitingStructureWritesRecheckConcurrentMembershipStateAndVersions(String kind) throws Exception {
        var t=tenant();var p=create(t,ProjectType.WEBSITE);var before=detail(t,p);var held=new CountDownLatch(1);var release=new CountDownLatch(1);
        boolean membership=kind.equals("REVOKE")||kind.equals("DEMOTE");String table=membership?"workspaces":"projects";
        try(var pool=Executors.newFixedThreadPool(2)){
            var change=pool.submit(()->tx().executeWithoutResult(status->{
                jdbc.queryForObject("select id from collector."+table+" where id=? for update",UUID.class,membership?t.workspace():p.id());held.countDown();
                try{if(!release.await(12,TimeUnit.SECONDS))throw new IllegalStateException("Synthetic lock wait timed out");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException("Interrupted test");}
                switch(kind){
                    case "REVOKE"->jdbc.update("update collector.workspace_members set state='DISABLED' where workspace_id=?",t.workspace());
                    case "DEMOTE"->jdbc.update("update collector.workspace_members set role='MEMBER' where workspace_id=?",t.workspace());
                    case "ARCHIVE"->jdbc.update("update collector.projects set state='ARCHIVED' where workspace_id=? and id=?",t.workspace(),p.id());
                    case "VERSION"->jdbc.update("update collector.projects set structure_version=2 where workspace_id=? and id=?",t.workspace(),p.id());
                }
            }));
            assertThat(held.await(5,TimeUnit.SECONDS)).isTrue();
            var write=pool.submit(()->{try{as(t.actor(),()->editor().createSection(t.workspace(),p.id(),new SectionCreate(null,"Concurrent rejected change",1L)));return "ACCEPTED";}catch(ApiException e){return e.getCode();}});
            try{
                long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(6);int waiting=0;
                while(waiting==0 && System.nanoTime()<until){waiting=jdbc.queryForObject("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like ? and pid<>pg_backend_pid()",Integer.class,"%"+table+"%");if(waiting==0)Thread.sleep(10);}
                assertThat(waiting).as("Actual PostgreSQL structure writer lock waiter").isGreaterThan(0);
            }finally{release.countDown();}
            change.get(15,TimeUnit.SECONDS);
            String expected=switch(kind){case "REVOKE"->"NOT_FOUND";case "DEMOTE"->"ACCESS_DENIED";case "ARCHIVE"->"READ_ONLY";default->"STRUCTURE_CONFLICT";};
            String result=write.get(15,TimeUnit.SECONDS);assertThat(result).isEqualTo(expected);
        }finally{release.countDown();}
        assertThat(context.getBean(ProjectStructureRepository.class).structure(t.workspace(),p.id())).isEqualTo(before.structure());assertThat(count(t,"audit_logs")).isZero();
        assertThat(jdbc.queryForObject("select structure_version from collector.projects where workspace_id=? and id=?",Long.class,t.workspace(),p.id())).isEqualTo(kind.equals("VERSION")?2:1);
    }
}

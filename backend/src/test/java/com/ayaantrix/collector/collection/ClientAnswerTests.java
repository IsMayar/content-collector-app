package com.ayaantrix.collector.collection;
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
class ClientAnswerTests {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse(
        "public.ecr.aws/docker/library/postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873").asCompatibleSubstituteFor("postgres"));
    @TempDir static Path directory;
    static final Instant NOW=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS);
    static class TestClock extends Clock {public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}volatile Instant time=NOW;public Instant instant(){return time;}}
    @org.springframework.boot.test.context.TestConfiguration(proxyBeanMethods=false)
    static class Configuration { @Bean @Primary TestClock projectClock(){return new TestClock();} @Bean @Primary Mailbox teamMail(){return new Mailbox();} }
    static class Mailbox implements com.ayaantrix.collector.auth.delivery.VerificationMailSender {
        final java.util.List<Message> messages=new java.util.concurrent.CopyOnWriteArrayList<>();
        public volatile boolean unknown=false;
        public void send(Message message){if(unknown)throw new DeliveryFailure(true);messages.add(message);}
    }
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
            "--collector.delivery.worker-enabled=false","--collector.delivery.encryption-key="+Base64.getEncoder().encodeToString(new byte[32]));
    }
    void open(){
        context=start(POSTGRES.getJdbcUrl());jdbc=context.getBean(JdbcTemplate.class);json=context.getBean(JsonMapper.class);
        mvc=MockMvcBuilders.webAppContextSetup((WebApplicationContext)context).apply(springSecurity()).addFilters(context.getBean(RequestTraceFilter.class)).build();
    }
    @AfterAll void stop(){if(context!=null)context.close();}
    @AfterEach void clear(){SecurityContextHolder.clearContext();context.getBean(TestClock.class).time=NOW;}
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
    Tenant tenant(){var a=actor();UUID w=as(a,()->context.getBean(WorkspaceService.class).create(new WorkspaceDtos.Create("Project studio","UTC",PlanKey.AGENCY))).id();UUID client=as(a,()->service().createCustomer(w,new CustomerCreate("Synthetic customer",null,null))).id();return new Tenant(a,w,client);}
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


    com.ayaantrix.collector.clientaccess.service.ClientAccessService access(){return context.getBean(com.ayaantrix.collector.clientaccess.service.ClientAccessService.class);}
    com.ayaantrix.collector.clientaccess.service.ClientPortalService portal(){return context.getBean(com.ayaantrix.collector.clientaccess.service.ClientPortalService.class);}
    record Fixture(Tenant tenant,View project,UUID contact){String path(){return tenant.root()+"/projects/"+project.id()+"/contacts/"+contact;}}
    Fixture fixture(){var t=tenant();var p=create(t,ProjectType.WEBSITE);jdbc.update("update collector.projects set state='ACTIVE' where id=?",p.id());var c=as(t.actor(),()->context.getBean(com.ayaantrix.collector.project.service.ProjectClientService.class).createContact(t.workspace(),p.id(),new com.ayaantrix.collector.project.dto.ProjectClientDtos.ContactCreate(t.client(),"Synthetic Client","client-"+UUID.randomUUID()+"@example.test",NOW.plus(Duration.ofDays(90)))));return new Fixture(t,p,c.id());}
    com.ayaantrix.collector.clientaccess.dto.ClientAccessDtos.Invitation invite(Fixture f){return as(f.tenant().actor(),()->access().invite(f.tenant().workspace(),f.project().id(),f.contact(),UUID.randomUUID().toString(),"client-test"));}
    String raw(UUID id){var row=jdbc.queryForMap("select id,encrypted_payload,encryption_key_id from collector.outbox_jobs where payload_json->>'tokenId'=?",id.toString());return context.getBean(com.ayaantrix.collector.auth.delivery.TokenDeliveryCipher.class).decrypt((byte[])row.get("encrypted_payload"),(String)row.get("encryption_key_id"),(UUID)row.get("id"),id);}
    com.ayaantrix.collector.clientaccess.dto.ClientAccessDtos.Exchange input(String token){return new com.ayaantrix.collector.clientaccess.dto.ClientAccessDtos.Exchange(token);}
    com.ayaantrix.collector.clientaccess.dto.ClientAccessDtos.Issued enter(Fixture f){return access().exchange(input(raw(invite(f).id())),null);}
    String cookieName(){return "__Secure-collector_client";}
    org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder checklist(Fixture f,String cookie){var request=get("/api/v1/client/projects/"+f.project().id()+"/checklist");return cookie==null?request:request.cookie(new jakarta.servlet.http.Cookie(cookieName(),cookie));}

 com.ayaantrix.collector.collection.service.ClientAnswerService drafts(){return context.getBean(com.ayaantrix.collector.collection.service.ClientAnswerService.class);}
 UUID textItem(Fixture f){return id(detail(f.tenant(),f.project()).structure().getFirst().path("items").get(0));}
 com.ayaantrix.collector.collection.dto.ClientAnswerDtos.Save saveCommand(JsonNode value,long version,long structure){return new com.ayaantrix.collector.collection.dto.ClientAnswerDtos.Save(value,version,structure,UUID.randomUUID());}
 com.ayaantrix.collector.collection.dto.ClientAnswerDtos.Saved save(Fixture f,String cookie,UUID item,JsonNode value,long version){return drafts().save(cookie,f.project().id(),item,saveCommand(value,version,detail(f.tenant(),f.project()).project().structureVersion()));}
 JsonNode text(String value){return json.createObjectNode().put("text",value);}
 @Test void firstSaveUpdateClearAndRestartAreDurable(){var f=fixture();String cookie=enter(f).credential();UUID item=textItem(f);assertThat(save(f,cookie,item,text("First"),0).answer().version()).isEqualTo(1);assertThat(save(f,cookie,item,text("Updated"),1).answer().version()).isEqualTo(2);context.close();open();assertThat(json.valueToTree(drafts().read(cookie,f.project().id(),item)).at("/answer/value/text").asText()).isEqualTo("Updated");var cleared=save(f,cookie,item,json.createObjectNode(),2);assertThat(cleared.answer().version()).isEqualTo(3);assertThat(cleared.answer().value().isEmpty()).isTrue();assertThat(jdbc.queryForObject("select state from collector.items where id=?",String.class,item)).isEqualTo("DRAFT");}
 @Test void staleWritesAndOperationReplayNeverOverwrite(){var f=fixture();String c=enter(f).credential();UUID item=textItem(f);var cmd=saveCommand(text("One"),0,1);assertThat(drafts().save(c,f.project().id(),item,cmd).answer().version()).isEqualTo(1);assertThat(drafts().save(c,f.project().id(),item,cmd).answer().version()).isEqualTo(1);assertThatThrownBy(()->save(f,c,item,text("Stale"),0)).isInstanceOfSatisfying(ApiException.class,e->{assertThat(e.getCode()).isEqualTo("ANSWER_VERSION_CONFLICT");assertThat(e.getCurrentVersion()).isEqualTo(1);});assertThat(json.valueToTree(drafts().read(c,f.project().id(),item)).at("/answer/value/text").asText()).isEqualTo("One");}
 @Test void draftAllowsIncompleteRequiredButRejectsWrongShape(){var f=fixture();String c=enter(f).credential();UUID item=textItem(f);save(f,c,item,text(""),0);assertThatThrownBy(()->save(f,c,item,json.createObjectNode().put("url","https://example.test"),1)).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.getStatus().value()).isEqualTo(422));assertThat(count(f.tenant(),"answers")).isEqualTo(1);}
 @ParameterizedTest @ValueSource(strings={"SHORT_TEXT","LONG_TEXT","URL","SINGLE_SELECT","MULTI_SELECT","REPEATER","FILE","IMAGE"})
 void supportedTypesAndUnavailableUploads(String type){var f=fixture();UUID section=emptySection(f.tenant(),f.project());UUID item=id(add(f.tenant(),f.project(),section,field("answer."+type.toLowerCase(),type)));String c=enter(f).credential();JsonNode value=switch(type){case "SHORT_TEXT","LONG_TEXT"->text("a");case "URL"->json.createObjectNode().put("url","https://example.test/path");case "SINGLE_SELECT"->json.createObjectNode().put("optionKey","yes");case "MULTI_SELECT"->{var v=json.createObjectNode();v.putArray("optionKeys").add("yes");yield v;}case "REPEATER"->{var v=json.createObjectNode();var row=v.putArray("rows").addObject().put("rowId",UUID.randomUUID().toString());row.putObject("values").put("number",3).put("url","https://example.test").put("short_text","");yield v;}default->json.createObjectNode();};if(Set.of("FILE","IMAGE").contains(type))assertThatThrownBy(()->save(f,c,item,value,0)).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.getCode()).isEqualTo("UPLOAD_UNAVAILABLE"));else assertThat(save(f,c,item,value,0).answer().version()).isEqualTo(1);}
 @ParameterizedTest @ValueSource(strings={"PAUSED","COMPLETED","ARCHIVED","DRAFT","DELETION_PENDING"}) void projectStateWritesFailClosed(String state){var f=fixture();String c=enter(f).credential();UUID item=textItem(f);jdbc.update("update collector.projects set state=? where id=?",state,f.project().id());assertThatThrownBy(()->save(f,c,item,text("no"),0)).isInstanceOf(ApiException.class);assertThat(count(f.tenant(),"answers")).isZero();}
 @Test void grantExpiryRevocationAndForeignItemDenied(){var f=fixture();var other=fixture();String c=enter(f).credential();UUID item=textItem(f);assertThatThrownBy(()->drafts().read(c,other.project().id(),textItem(other))).isInstanceOf(ApiException.class);assertThatThrownBy(()->save(f,c,UUID.randomUUID(),text("no"),0)).isInstanceOf(ApiException.class);as(f.tenant().actor(),()->{access().revoke(f.tenant().workspace(),f.project().id(),f.contact());return null;});assertThatThrownBy(()->save(f,c,item,text("no"),0)).isInstanceOf(ApiException.class);assertThat(count(f.tenant(),"answers")).isZero();}
 @Test void structureSemanticChangesRequireReopenButReorderPreservesDraft(){var f=fixture();String c=enter(f).credential();UUID item=textItem(f);save(f,c,item,text("Keep this"),0);var d=detail(f.tenant(),f.project());var node=d.structure().getFirst().path("items").get(0);var changed=definition(node);changed.put("type","LONG_TEXT");changed.putObject("validation").put("maxLength",10000);assertThatThrownBy(()->as(f.tenant().actor(),()->editor().patchItem(f.tenant().workspace(),f.project().id(),item,new ItemPatch(changed,d.project().structureVersion(),false)))).isInstanceOf(ApiException.class);var order=ordering(d);as(f.tenant().actor(),()->editor().reorder(f.tenant().workspace(),f.project().id(),order));assertThat(json.valueToTree(drafts().read(c,f.project().id(),item)).at("/answer/value/text").asText()).isEqualTo("Keep this");}
 @Test void simultaneousWritesProduceOneWinner() throws Exception {var f=fixture();String c=enter(f).credential();UUID item=textItem(f);var start=new CountDownLatch(1);try(var pool=Executors.newFixedThreadPool(2)){var a=pool.submit(()->{start.await();try{save(f,c,item,text("A"),0);return 200;}catch(ApiException e){return e.getStatus().value();}});var b=pool.submit(()->{start.await();try{save(f,c,item,text("B"),0);return 200;}catch(ApiException e){return e.getStatus().value();}});start.countDown();assertThat(List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS))).containsExactlyInAnyOrder(200,409);}assertThat(count(f.tenant(),"answers")).isEqualTo(1);}
 @Test void csrfCookieAndProblemContracts() throws Exception {var f=fixture();String c=enter(f).credential();UUID item=textItem(f);String path="/api/v1/client/projects/"+f.project().id()+"/items/"+item+"/answer";var cmd=saveCommand(text("Save"),0,1);mvc.perform(put(path).cookie(new jakarta.servlet.http.Cookie(cookieName(),c)).contentType("application/json").content(json.writeValueAsString(cmd))).andExpect(status().isForbidden());mvc.perform(put(path).with(csrf().asHeader()).contentType("application/json").content(json.writeValueAsString(cmd))).andExpect(status().isUnauthorized());mvc.perform(put(path).cookie(new jakarta.servlet.http.Cookie(cookieName(),c)).with(csrf().asHeader()).header("X-Request-ID","draft-contract").contentType("application/json").content(json.writeValueAsString(cmd))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));mvc.perform(put(path).cookie(new jakarta.servlet.http.Cookie(cookieName(),c)).with(csrf().asHeader()).header("X-Request-ID","draft-conflict").contentType("application/json").content(json.writeValueAsString(saveCommand(text("stale"),0,1)))).andExpect(status().isConflict()).andExpect(jsonPath("$.currentVersion").value(1)).andExpect(header().string("X-Request-ID","draft-conflict"));}

 @Test void conditionalValuesAreRetainedWhenHiddenAndProgressUsesSameVisibility(){var f=fixture();var section=emptySection(f.tenant(),f.project());UUID control=id(add(f.tenant(),f.project(),section,field("conditional.control","SINGLE_SELECT")));var child=field("conditional.child","SHORT_TEXT");child.putObject("visibleWhen").put("dependsOnItemKey","conditional.control").put("operator","EQUALS").put("optionKey","yes");UUID dependent=id(add(f.tenant(),f.project(),section,child));String c=enter(f).credential();assertThatThrownBy(()->save(f,c,dependent,text("hidden"),0)).isInstanceOf(ApiException.class);save(f,c,control,json.createObjectNode().put("optionKey","yes"),0);save(f,c,dependent,text("retain"),0);var visible=json.valueToTree(portal().checklist(c,f.project().id()));assertThat(visible.toString()).contains("retain");save(f,c,control,json.createObjectNode().put("optionKey",""),1);var hidden=json.valueToTree(portal().checklist(c,f.project().id()));assertThat(hidden.toString()).doesNotContain("retain");assertThat(jdbc.queryForObject("select value_json->>'text' from collector.answers where item_id=?",String.class,dependent)).isEqualTo("retain");save(f,c,control,json.createObjectNode().put("optionKey","yes"),2);assertThat(json.valueToTree(portal().checklist(c,f.project().id())).toString()).contains("retain");}
 @Test void auditFailureRollsBackAnswerStateAndProjectVersion(){var f=fixture();String c=enter(f).credential();UUID item=textItem(f);long v=detail(f.tenant(),f.project()).project().version();jdbc.execute("CREATE FUNCTION collector.reject_draft_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='CLIENT_DRAFT_SAVED' THEN RAISE EXCEPTION 'synthetic audit rejection'; END IF; RETURN NEW; END $$");jdbc.execute("CREATE TRIGGER reject_draft BEFORE INSERT ON collector.audit_logs FOR EACH ROW EXECUTE FUNCTION collector.reject_draft_audit()");try{assertThatThrownBy(()->save(f,c,item,text("rollback"),0)).isInstanceOf(RuntimeException.class);assertThat(count(f.tenant(),"answers")).isZero();assertThat(jdbc.queryForObject("select state from collector.items where id=?",String.class,item)).isEqualTo("NOT_STARTED");assertThat(detail(f.tenant(),f.project()).project().version()).isEqualTo(v);}finally{jdbc.execute("DROP TRIGGER reject_draft ON collector.audit_logs");jdbc.execute("DROP FUNCTION collector.reject_draft_audit()");}}
 @Test void staleStructureDisabledAndRevisionLockedItemsReject(){var f=fixture();String c=enter(f).credential();UUID item=textItem(f);assertThatThrownBy(()->drafts().save(c,f.project().id(),item,saveCommand(text("stale"),0,99))).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.getCode()).isEqualTo("STRUCTURE_CONFLICT"));jdbc.update("update collector.items set enabled=false where id=?",item);assertThatThrownBy(()->save(f,c,item,text("no"),0)).isInstanceOf(ApiException.class);jdbc.update("update collector.items set enabled=true,state='SUBMITTED' where id=?",item);assertThatThrownBy(()->save(f,c,item,text("no"),0)).isInstanceOf(ApiException.class);assertThat(count(f.tenant(),"answers")).isZero();}
 @ParameterizedTest @CsvSource(delimiter='|',value={"SINGLE_SELECT|{\"optionKey\":\"missing\"}","MULTI_SELECT|{\"optionKeys\":[\"yes\",\"yes\"]}","URL|{\"url\":\"javascript:alert(1)\"}","SHORT_TEXT|{\"text\":42}","REPEATER|{\"rows\":[{\"rowId\":\"bad\",\"values\":{}}]}"})
 void invalidAnswersNeverPersist(String type,String source){var f=fixture();UUID section=emptySection(f.tenant(),f.project());UUID item=id(add(f.tenant(),f.project(),section,field("invalid."+type.toLowerCase(),type)));String c=enter(f).credential();assertThatThrownBy(()->save(f,c,item,json.readTree(source),0)).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.getStatus().value()).isEqualTo(422));assertThat(count(f.tenant(),"answers")).isZero();}
 @Test void draftMetadataForeignKeysPreventCrossTenantAttribution(){var f=fixture();var other=fixture();String c=enter(f).credential();UUID item=textItem(f);save(f,c,item,text("safe"),0);assertThatThrownBy(()->jdbc.update("update collector.answers set updated_by_contact_id=? where item_id=?",other.contact(),item)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);assertThat(jdbc.queryForObject("select updated_by_contact_id from collector.answers where item_id=?",UUID.class,item)).isEqualTo(f.contact());}

 @Test void semanticValidationHasBoundedFieldDiagnosticsAndCorrelatedProblemJson() throws Exception {var f=fixture();String c=enter(f).credential();UUID item=textItem(f);var command=saveCommand(json.createObjectNode().put("text",42),0,1);mvc.perform(put("/api/v1/client/projects/"+f.project().id()+"/items/"+item+"/answer").with(csrf().asHeader()).cookie(new jakarta.servlet.http.Cookie(cookieName(),c)).header("X-Request-ID","draft-invalid").contentType("application/json").content(json.writeValueAsString(command))).andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.errors[0].fieldPath").value("value.text")).andExpect(jsonPath("$.traceId").value("draft-invalid"));assertThat(count(f.tenant(),"answers")).isZero();}
 @Test void expiredAndReadOnlyWorkspaceSessionsCannotWrite(){var f=fixture();String c=enter(f).credential();UUID item=textItem(f);context.getBean(TestClock.class).time=NOW.plusSeconds(24*3600+1);assertThatThrownBy(()->save(f,c,item,text("expired"),0)).isInstanceOf(ApiException.class);context.getBean(TestClock.class).time=NOW;jdbc.update("update collector.workspaces set state='READ_ONLY' where id=?",f.tenant().workspace());assertThatThrownBy(()->save(f,c,item,text("readonly"),0)).isInstanceOf(ApiException.class);assertThat(count(f.tenant(),"answers")).isZero();}
}

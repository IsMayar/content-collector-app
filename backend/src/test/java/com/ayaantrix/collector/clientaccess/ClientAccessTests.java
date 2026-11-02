package com.ayaantrix.collector.clientaccess;
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
class ClientAccessTests {
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
    @Test void contactAloneIsNotClientAuthorityAndFreshLinkIsGeneric() throws Exception {
      var f=fixture();String email=jdbc.queryForObject("select email_normalized from collector.project_contacts where id=?",String.class,f.contact());
      access().request(new com.ayaantrix.collector.clientaccess.dto.ClientAccessDtos.RequestLink(email,f.project().id()),"request");assertThat(count(f.tenant(),"access_tokens")).isZero();assertThat(count(f.tenant(),"client_sessions")).isZero();mvc.perform(checklist(f,null)).andExpect(status().isUnauthorized());
    }
    @Test void ownerInvitationIsEncryptedScopedIdempotentAndNeverCreatesAgencyIdentity() throws Exception {
      var f=fixture();long users=jdbc.queryForObject("select count(*) from collector.users",Long.class);String key="client-invite-key";
      var response=mvc.perform(post(f.path()+"/invite").header("Authorization",bearer(f.tenant())).header("Idempotency-Key",key).with(csrf().asHeader()).header("X-Request-ID","client-contract")).andExpect(status().isAccepted()).andExpect(header().string("Cache-Control","no-store")).andExpect(header().string("X-Request-ID","client-contract")).andReturn();
      UUID id=UUID.fromString(json.readTree(response.getResponse().getContentAsString()).at("/invitation/id").asText());String token=raw(id);assertThat(response.getResponse().getContentAsString()).doesNotContain(token);
      assertThat(jdbc.queryForObject("select token_hash from collector.access_tokens where id=?",String.class,id)).isNotEqualTo(token).hasSize(64);
      assertThat(jdbc.queryForObject("select user_id is null and purpose='CLIENT_INVITE' from collector.access_tokens where id=?",Boolean.class,id)).isTrue();
      as(f.tenant().actor(),()->access().invite(f.tenant().workspace(),f.project().id(),f.contact(),key,"client-contract"));assertThat(count(f.tenant(),"access_tokens")).isEqualTo(1);assertThat(jdbc.queryForObject("select count(*) from collector.users",Long.class)).isEqualTo(users);assertThat(count(f.tenant(),"workspace_members")).isEqualTo(1);
      mvc.perform(get("/api/v1/client-access/exchange").param("token",token)).andExpect(status().isForbidden());assertThat(jdbc.queryForObject("select consumed_at is null from collector.access_tokens where id=?",Boolean.class,id)).isTrue();
    }
    @Test void explicitExchangeSetsIsolatedSecureCookieAndPortalDoesNotExposePrivateRecords() throws Exception {
      var f=fixture();String raw=raw(invite(f).id());
      mvc.perform(post("/api/v1/client-access/exchange").contentType("application/json").content(json.writeValueAsString(Map.of("token",raw)))).andExpect(status().isForbidden());
      var result=mvc.perform(post("/api/v1/client-access/exchange").with(csrf().asHeader()).contentType("application/json").content(json.writeValueAsString(Map.of("token",raw)))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andReturn();
      String set=result.getResponse().getHeader("Set-Cookie");assertThat(set).contains("__Secure-collector_client=","Secure","HttpOnly","SameSite=Lax","Path=/api/v1").doesNotContain("collector_refresh");String credential=set.substring(set.indexOf('=')+1,set.indexOf(';'));
      var response=mvc.perform(checklist(f,credential).header("X-Request-ID","portal-check")).andExpect(status().isOk()).andExpect(jsonPath("$.capabilities.canRespond").value(true)).andExpect(header().string("Referrer-Policy","no-referrer")).andReturn();
      assertThat(response.getResponse().getContentAsString()).doesNotContain("workspaceId","contactId","email_normalized","token_hash","audit","password","currentRevisionId");
      assertThatThrownBy(()->access().exchange(input(raw),null)).isInstanceOf(ApiException.class);mvc.perform(get("/api/v1/me").cookie(new jakarta.servlet.http.Cookie(cookieName(),credential))).andExpect(status().isUnauthorized());
      mvc.perform(checklist(f,null).header("Authorization",bearer(f.tenant()))).andExpect(status().isUnauthorized());
    }
    @ParameterizedTest @ValueSource(strings={"invalid","missing","wrong-purpose"})
    void invalidCredentialsCannotCreateClientSession(String kind){var f=fixture();String raw=kind.equals("missing")?null:context.getBean(SecureAccountTokens.class).generate();if(kind.equals("wrong-purpose")){var user=context.getBean(UserAccountRepository.class).findById(f.tenant().actor().id()).orElseThrow();context.getBean(com.ayaantrix.collector.auth.repository.AccountTokenRepository.class).saveAndFlush(new com.ayaantrix.collector.auth.entity.AccountToken(user,context.getBean(SecureAccountTokens.class).digest(raw),com.ayaantrix.collector.auth.entity.TokenPurpose.VERIFY_EMAIL,NOW));}String token=raw;assertThatThrownBy(()->access().exchange(input(token),null)).isInstanceOf(ApiException.class);assertThat(count(f.tenant(),"client_sessions")).isZero();}
    @Test void crossProjectAndTenantReadsFailWithoutDestroyingValidProjectSession() throws Exception {var f=fixture();var other=fixture();var issued=enter(f);mvc.perform(checklist(other,issued.credential())).andExpect(status().isNotFound());mvc.perform(checklist(f,issued.credential())).andExpect(status().isOk());mvc.perform(get(f.tenant().root()).cookie(new jakarta.servlet.http.Cookie(cookieName(),issued.credential()))).andExpect(status().isUnauthorized());}
    @ParameterizedTest @ValueSource(strings={"grant","session","idle","revoked","workspace","project"})
    void liveExpiryRevocationAndStateChangesInvalidatePortalImmediately(String kind) throws Exception {
      var f=fixture();var issued=enter(f);
      switch(kind){case "grant"->jdbc.update("update collector.project_contacts set created_at=?,access_expires_at=? where id=?",java.sql.Timestamp.from(NOW.minusSeconds(20)),java.sql.Timestamp.from(NOW.minusSeconds(1)),f.contact());case "session"->context.getBean(TestClock.class).time=NOW.plus(Duration.ofDays(7));case "idle"->context.getBean(TestClock.class).time=NOW.plus(Duration.ofHours(24));case "revoked"->as(f.tenant().actor(),()->{access().revoke(f.tenant().workspace(),f.project().id(),f.contact());return true;});case "workspace"->jdbc.update("update collector.workspaces set state='SUSPENDED' where id=?",f.tenant().workspace());case "project"->jdbc.update("update collector.projects set state='DELETION_PENDING' where id=?",f.project().id());}
      mvc.perform(checklist(f,issued.credential())).andExpect(status().isUnauthorized());
    }
    @ParameterizedTest @ValueSource(strings={"DRAFT","ARCHIVED","DELETION_PENDING"})
    void ineligibleProjectsCannotIssueInvitations(String state){var f=fixture();jdbc.update("update collector.projects set state=? where id=?",state,f.project().id());assertThatThrownBy(()->invite(f)).isInstanceOf(ApiException.class).extracting("code").isEqualTo("PROJECT_NOT_PUBLISHED");assertThat(count(f.tenant(),"access_tokens")).isZero();}
    @ParameterizedTest @ValueSource(strings={"PAUSED","COMPLETED","ARCHIVED","READ_ONLY"})
    void authorizedReadOnlyStatesPreserveReadAccessWithoutResponseCapabilities(String state) throws Exception {var f=fixture();var issued=enter(f);if(state.equals("READ_ONLY"))jdbc.update("update collector.workspaces set state='READ_ONLY' where id=?",f.tenant().workspace());else jdbc.update("update collector.projects set state=? where id=?",state,f.project().id());mvc.perform(checklist(f,issued.credential())).andExpect(status().isOk()).andExpect(jsonPath("$.capabilities.canRespond").value(false));mvc.perform(put("/api/v1/client/projects/"+f.project().id()+"/items/"+UUID.randomUUID()+"/answer").cookie(new jakarta.servlet.http.Cookie(cookieName(),issued.credential())).with(csrf().asHeader()).contentType("application/json").content(json.writeValueAsString(Map.of("value",Map.of("text","draft"),"expectedVersion",0,"expectedStructureVersion",1,"saveOperationId",UUID.randomUUID())))).andExpect(status().isConflict());}
    @Test void newLinkRevokesUnusedInvitationButDoesNotRevokeExistingSession(){var f=fixture();var issued=enter(f);var first=invite(f);String firstRaw=raw(first.id());var next=invite(f);assertThatThrownBy(()->access().exchange(input(firstRaw),null)).isInstanceOf(ApiException.class);assertThat(portal().checklist(issued.credential(),f.project().id())).containsKey("sections");var latest=access().exchange(input(raw(next.id())),issued.credential());assertThatThrownBy(()->portal().checklist(issued.credential(),f.project().id())).isInstanceOf(ApiException.class);assertThat(portal().checklist(latest.credential(),f.project().id())).containsKey("project");}
    @Test void freshLinkRequestsAreGenericAndCannotResurrectRevokedGrant() throws Exception {var f=fixture();invite(f);as(f.tenant().actor(),()->{access().revoke(f.tenant().workspace(),f.project().id(),f.contact());return true;});String email=jdbc.queryForObject("select email_normalized from collector.project_contacts where id=?",String.class,f.contact());String expected=null;for(String recipient:List.of(email,"unknown@example.test")){var result=mvc.perform(post("/api/v1/client-access/request-link").with(csrf().asHeader()).contentType("application/json").content(json.writeValueAsString(Map.of("email",recipient,"projectId",f.project().id())))).andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString();if(expected!=null)assertThat(result).isEqualTo(expected);expected=result;}assertThat(count(f.tenant(),"access_tokens")).isEqualTo(1);}
    @Test void portalUsesIndependentEditedStructureAndFiltersDisabledAndConditionalItems(){var f=fixture();var p=f.project();UUID section=emptySection(f.tenant(),p);add(f.tenant(),p,section,field("t14.visible","SHORT_TEXT"));var before=detail(f.tenant(),p);var issued=enter(f);var response=json.valueToTree(portal().checklist(issued.credential(),p.id()));assertThat(response.get("sections").toString()).contains("t14.visible");var disabled=id(before.structure().getFirst());jdbc.update("update collector.sections set enabled=false where workspace_id=? and id=?",f.tenant().workspace(),disabled);response=json.valueToTree(portal().checklist(issued.credential(),p.id()));assertThat(response.get("sections").toString()).doesNotContain(disabled.toString());assertThat(response.toString()).contains("canEdit\":true","answer\":null");}
    @Test void concurrentExchangesConsumeExactlyOnce() throws Exception {var f=fixture();String raw=raw(invite(f).id());try(var pool=Executors.newFixedThreadPool(2)){var gate=new CountDownLatch(1);Callable<String> exchange=()->{gate.await();try{access().exchange(input(raw),null);return "accepted";}catch(ApiException e){return e.getCode();}};var a=pool.submit(exchange);var b=pool.submit(exchange);gate.countDown();assertThat(List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS))).containsExactlyInAnyOrder("accepted","CLIENT_ACCESS_UNAVAILABLE");}assertThat(count(f.tenant(),"client_sessions")).isEqualTo(1);}
    @Test void outboxFailureRollsBackGrantInitializationTokenAuditAndIdempotency(){var f=fixture();jdbc.execute("create function collector.reject_client_mail() returns trigger language plpgsql as $$ begin raise exception 'synthetic client outbox failure'; end; $$");jdbc.execute("create trigger reject_client_mail before insert on collector.outbox_jobs for each row when(new.job_type='CLIENT_INVITE') execute function collector.reject_client_mail()");try{assertThatThrownBy(()->invite(f)).isInstanceOf(RuntimeException.class);assertThat(count(f.tenant(),"access_tokens")).isZero();assertThat(count(f.tenant(),"audit_logs")).isZero();assertThat(jdbc.queryForObject("select access_initialized_at is null from collector.project_contacts where id=?",Boolean.class,f.contact())).isTrue();}finally{jdbc.execute("drop trigger reject_client_mail on collector.outbox_jobs");jdbc.execute("drop function collector.reject_client_mail()");}}
    @Test void deliveryUsesExistingEncryptedOutboxAndRevokedLinksCannotBeDelivered(){var f=fixture();var invitation=invite(f);var worker=context.getBean(com.ayaantrix.collector.auth.delivery.VerificationDeliveryWorker.class);var mailbox=context.getBean(Mailbox.class);String email=invitation.email();for(int i=0;i<100&&mailbox.messages.stream().noneMatch(m->m.recipient().equals(email));i++)assertThat(worker.dispatchOne()).isTrue();var message=mailbox.messages.stream().filter(m->m.recipient().equals(email)).findFirst().orElseThrow();assertThat(message.purpose()).isEqualTo(com.ayaantrix.collector.auth.entity.TokenPurpose.CLIENT_INVITE);assertThat(message.actionLink().getPath()).isEqualTo("/client/access");assertThat(message.actionLink().getQuery()).isEqualTo("projectId="+f.project().id());assertThat(jdbc.queryForObject("select encrypted_payload is null from collector.outbox_jobs where payload_json->>'tokenId'=?",Boolean.class,invitation.id().toString())).isTrue();}
    @Test void restartPreservesClientSessionAndValidatesV12(){var f=fixture();var issued=enter(f);context.close();open();assertThat(portal().checklist(issued.credential(),f.project().id())).containsKey("sections");assertThat(context.getBean(Flyway.class).info().applied()).hasSize(21);assertThat(context.getBean(Flyway.class).validateWithResult().validationSuccessful).isTrue();assertThat(jdbc.queryForObject("select count(*) from collector.submission_revisions",Integer.class)).isZero();}
    @Test void crossTenantContactsAndAssignedMembersCannotIssueOrRevokeAccess() throws Exception {
      var f=fixture();var other=fixture();assertThatThrownBy(()->as(f.tenant().actor(),()->access().invite(f.tenant().workspace(),f.project().id(),other.contact(),"foreign-contact","scope"))).isInstanceOf(ApiException.class);
      mvc.perform(post(f.path()+"/invite").with(csrf().asHeader()).header("Idempotency-Key","anonymous")).andExpect(status().isUnauthorized());
      var actor=actor();jdbc.update("insert into collector.workspace_members(workspace_id,user_id,role) values(?,?,'MEMBER')",f.tenant().workspace(),actor.id());
      mvc.perform(post(f.path()+"/invite").with(csrf().asHeader()).header("Authorization","Bearer "+actor.access()).header("Idempotency-Key","member")).andExpect(status().isForbidden());
      mvc.perform(delete(f.path()+"/access").with(csrf().asHeader()).header("Authorization","Bearer "+actor.access())).andExpect(status().isForbidden());assertThat(count(f.tenant(),"access_tokens")).isZero();
    }
    @Test void csrfProtectedLogoutDoesNotInvalidateAgencyIdentity() throws Exception {var f=fixture();var issued=enter(f);var cookie=new jakarta.servlet.http.Cookie(cookieName(),issued.credential());mvc.perform(post("/api/v1/client-access/logout").cookie(cookie)).andExpect(status().isForbidden());mvc.perform(checklist(f,issued.credential())).andExpect(status().isOk());mvc.perform(post("/api/v1/client-access/logout").cookie(cookie).with(csrf().asHeader())).andExpect(status().isNoContent()).andExpect(header().string("Cache-Control","no-store"));mvc.perform(checklist(f,issued.credential())).andExpect(status().isUnauthorized());mvc.perform(get("/api/v1/me").header("Authorization",bearer(f.tenant()))).andExpect(status().isOk());}
    @Test void clientInvitationExpiryAndSessionCredentialPurposesAreIndependent(){var f=fixture();var i=invite(f);String raw=raw(i.id());assertThatThrownBy(()->portal().checklist(raw,f.project().id())).isInstanceOf(ApiException.class);context.getBean(TestClock.class).time=NOW.plus(Duration.ofDays(7));assertThatThrownBy(()->access().exchange(input(raw),null)).isInstanceOf(ApiException.class);assertThat(count(f.tenant(),"client_sessions")).isZero();}
    @Test void idleWindowSlidesOnAuthorizedReadButNeverExtendsAbsoluteExpiry(){var f=fixture();var issued=enter(f);context.getBean(TestClock.class).time=NOW.plus(Duration.ofHours(23));portal().checklist(issued.credential(),f.project().id());context.getBean(TestClock.class).time=NOW.plus(Duration.ofHours(46));portal().checklist(issued.credential(),f.project().id());assertThat(issued.expiresAt()).isEqualTo(NOW.plus(Duration.ofDays(7)));context.getBean(TestClock.class).time=NOW.plus(Duration.ofDays(7));assertThatThrownBy(()->portal().checklist(issued.credential(),f.project().id())).isInstanceOf(ApiException.class);}
    @Test void allEightFieldTypesUseSafeDefinitionsAndUnansweredConditionsRemainHidden(){var f=fixture();UUID section=emptySection(f.tenant(),f.project());for(String type:List.of("SHORT_TEXT","LONG_TEXT","URL","SINGLE_SELECT","MULTI_SELECT","IMAGE","FILE","REPEATER"))add(f.tenant(),f.project(),section,field("portal."+type.toLowerCase(),type));var hidden=field("portal.conditional","SHORT_TEXT");hidden.putObject("visibleWhen").put("dependsOnItemKey","portal.single_select").put("operator","EQUALS").put("optionKey","yes");add(f.tenant(),f.project(),section,hidden);var issued=enter(f);var tree=json.valueToTree(portal().checklist(issued.credential(),f.project().id()));String content=tree.toString();for(String type:List.of("SHORT_TEXT","LONG_TEXT","URL","SINGLE_SELECT","MULTI_SELECT","IMAGE","FILE","REPEATER"))assertThat(content).contains("portal."+type.toLowerCase());assertThat(content).doesNotContain("portal.conditional");assertThat(content).contains("columns","maxRows","options");}
    @Test void exchangeAuditFailureRollsBackConsumptionAndSession(){var f=fixture();var invitation=invite(f);String raw=raw(invitation.id());jdbc.execute("create function collector.reject_client_exchange() returns trigger language plpgsql as $$ begin raise exception 'synthetic audit failure'; end; $$");jdbc.execute("create trigger reject_client_exchange before insert on collector.audit_logs for each row when(new.action='CLIENT_ACCESS_EXCHANGED') execute function collector.reject_client_exchange()");try{assertThatThrownBy(()->access().exchange(input(raw),null)).isInstanceOf(RuntimeException.class);assertThat(count(f.tenant(),"client_sessions")).isZero();assertThat(jdbc.queryForObject("select consumed_at is null from collector.access_tokens where id=?",Boolean.class,invitation.id())).isTrue();}finally{jdbc.execute("drop trigger reject_client_exchange on collector.audit_logs");jdbc.execute("drop function collector.reject_client_exchange()");}assertThat(access().exchange(input(raw),null).projectId()).isEqualTo(f.project().id());}
    @Test void sessionForeignKeysRejectAnotherProjectsContact(){var f=fixture();var other=fixture();assertThatThrownBy(()->jdbc.update("insert into collector.client_sessions(id,workspace_id,project_id,contact_id,token_hash,created_at,last_seen_at,expires_at) values(?,?,?,?,?,?,?,?)",UUID.randomUUID(),f.tenant().workspace(),f.project().id(),other.contact(),"a".repeat(64),java.sql.Timestamp.from(NOW),java.sql.Timestamp.from(NOW),java.sql.Timestamp.from(NOW.plusSeconds(60)))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);}
    @Test void rateLimitsAndCorsApplyToPublicClientExchange() throws Exception {mvc.perform(options("/api/v1/client-access/exchange").header("Origin","https://untrusted.example").header("Access-Control-Request-Method","POST")).andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));for(int i=0;i<31;i++){var request=post("/api/v1/client-access/exchange").with(csrf().asHeader()).with(req->{req.setRemoteAddr("192.0.2.140");return req;}).contentType("application/json").content(json.writeValueAsString(Map.of("token","a".repeat(43))));mvc.perform(request).andExpect(i<30?status().isUnauthorized():status().isTooManyRequests());}}

    @Test void orderingAndDisabledItemFilteringMatchTheCurrentIndependentStructure(){var f=fixture();UUID section=emptySection(f.tenant(),f.project());var first=add(f.tenant(),f.project(),section,field("ordered.first","SHORT_TEXT"));var second=add(f.tenant(),f.project(),section,field("ordered.second","LONG_TEXT"));var d=detail(f.tenant(),f.project());var order=ordering(d);Collections.reverse(order.sectionIds());Collections.reverse(order.itemOrderBySection().get(section));as(f.tenant().actor(),()->editor().reorder(f.tenant().workspace(),f.project().id(),order));var issued=enter(f);var result=json.valueToTree(portal().checklist(issued.credential(),f.project().id()));assertThat(result.at("/sections/0/id").asText()).isEqualTo(section.toString());assertThat(result.at("/sections/0/items/0/id").asText()).isEqualTo(id(second).toString());jdbc.update("update collector.items set enabled=false where workspace_id=? and id=?",f.tenant().workspace(),id(first));assertThat(json.valueToTree(portal().checklist(issued.credential(),f.project().id())).toString()).doesNotContain("ordered.first");}
    @Test void concurrentReadAndRevokeNeverRestoreClientGrant() throws Exception {var f=fixture();var issued=enter(f);try(var pool=Executors.newFixedThreadPool(2)){var gate=new CountDownLatch(1);var read=pool.submit(()->{gate.await();try{portal().checklist(issued.credential(),f.project().id());return "read";}catch(ApiException e){return e.getCode();}});var revoke=pool.submit(()->{gate.await();return as(f.tenant().actor(),()->{access().revoke(f.tenant().workspace(),f.project().id(),f.contact());return true;});});gate.countDown();assertThat(read.get(20,TimeUnit.SECONDS)).isIn("read","CLIENT_ACCESS_UNAVAILABLE");assertThat(revoke.get(20,TimeUnit.SECONDS)).isTrue();}assertThatThrownBy(()->portal().checklist(issued.credential(),f.project().id())).isInstanceOf(ApiException.class);assertThat(jdbc.queryForObject("select count(*) from collector.client_sessions where workspace_id=? and revoked_at is null",Long.class,f.tenant().workspace())).isZero();}
    @Test void unknownClientDeliveryIsHeldAndRevocationDestroysTheCapability(){var f=fixture();var invitation=invite(f);jdbc.update("update collector.outbox_jobs set available_at=? where state='QUEUED' and payload_json->>'tokenId'<>?",java.sql.Timestamp.from(NOW.plusSeconds(3600)),invitation.id().toString());var mailbox=context.getBean(Mailbox.class);var worker=context.getBean(com.ayaantrix.collector.auth.delivery.VerificationDeliveryWorker.class);mailbox.unknown=true;try{assertThat(worker.dispatchOne()).isTrue();}finally{mailbox.unknown=false;}var operations=context.getBean(com.ayaantrix.collector.auth.delivery.AccountDeliveryOperations.class);var job=operations.inspectHeld(100).stream().filter(j->j.purpose().equals("CLIENT_INVITE")).findFirst().orElseThrow();assertThat(job.outcome()).isEqualTo("DELIVERY_OUTCOME_UNKNOWN");assertThat(worker.dispatchOne()).isFalse();as(f.tenant().actor(),()->{access().revoke(f.tenant().workspace(),f.project().id(),f.contact());return true;});assertThat(operations.reconcile(job.id(),job.updatedAt(),job.attempts(),com.ayaantrix.collector.auth.delivery.AccountDeliveryOperations.Resolution.CONFIRMED_NOT_SENT,"CASE-14")).isFalse();assertThat(jdbc.queryForObject("select encrypted_payload is null from collector.outbox_jobs where id=?",Boolean.class,job.id())).isTrue();}
    @Test void upgradeFromV11PreservesExistingWorkspaceAndDoesNotInitializeAnonymousGrants(){String name="client_v11_upgrade";jdbc.execute("create database "+name);String url=POSTGRES.getJdbcUrl().replace("/test","/"+name);var ds=new DriverManagerDataSource(url,POSTGRES.getUsername(),POSTGRES.getPassword());Flyway.configure().dataSource(ds).target("11").load().migrate();var prior=new JdbcTemplate(ds);UUID workspace=UUID.randomUUID();prior.update("insert into collector.workspaces(id,name,timezone) values(?,?,'UTC')",workspace,"Preserved workspace");assertThat(prior.queryForObject("select count(*) from information_schema.tables where table_schema='collector' and table_name='client_sessions'",Integer.class)).isZero();var upgraded=Flyway.configure().dataSource(ds).load();upgraded.migrate();assertThat(upgraded.validateWithResult().validationSuccessful).isTrue();assertThat(prior.queryForObject("select name from collector.workspaces where id=?",String.class,workspace)).isEqualTo("Preserved workspace");assertThat(prior.queryForObject("select count(*) from collector.client_sessions",Integer.class)).isZero();}

    @Test void clientProjectionWhitelistsFieldsEvenWhenPrivateSchemaMetadataExists(){var f=fixture();jdbc.update("update collector.items set schema_json=schema_json || '{\"internalNotes\":\"synthetic-private-marker\"}'::jsonb where workspace_id=? and project_id=?",f.tenant().workspace(),f.project().id());var issued=enter(f);assertThat(json.valueToTree(portal().checklist(issued.credential(),f.project().id())).toString()).doesNotContain("internalNotes","synthetic-private-marker");}

}

package com.ayaantrix.collector.workspace;
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
class TeamCollaborationTests {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse(
        "public.ecr.aws/docker/library/postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873").asCompatibleSubstituteFor("postgres"));
    @TempDir static Path directory;
    static final Instant NOW=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS);
    static class TestClock extends Clock {public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}public Instant instant(){return NOW;}}
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

    com.ayaantrix.collector.workspace.service.WorkspaceInvitationService invitations(){return context.getBean(com.ayaantrix.collector.workspace.service.WorkspaceInvitationService.class);}
    com.ayaantrix.collector.workspace.service.WorkspaceMembershipService team(){return context.getBean(com.ayaantrix.collector.workspace.service.WorkspaceMembershipService.class);}
    com.ayaantrix.collector.project.service.ProjectAssignmentService assignments(){return context.getBean(com.ayaantrix.collector.project.service.ProjectAssignmentService.class);}
    String email(Actor actor){return context.getBean(UserAccountRepository.class).findById(actor.id()).orElseThrow().getEmailNormalized();}
    com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.Invitation invite(Tenant t,String email){return as(t.actor(),()->invitations().invite(t.workspace(),new com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.Invite(email,null),UUID.randomUUID().toString(),"team-test"));}
    String raw(UUID id){var row=jdbc.queryForMap("select id,encrypted_payload,encryption_key_id from collector.outbox_jobs where payload_json->>'tokenId'=?",id.toString());return context.getBean(com.ayaantrix.collector.auth.delivery.TokenDeliveryCipher.class).decrypt((byte[])row.get("encrypted_payload"),(String)row.get("encryption_key_id"),(UUID)row.get("id"),id);}
    com.ayaantrix.collector.auth.dto.SessionResponses.Membership join(Tenant t,Actor actor){var i=invite(t,email(actor));String raw=raw(i.id());return as(actor,()->invitations().accept(new com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.Accept(raw),UUID.randomUUID().toString()));}
    org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder inviteHttp(Tenant t,String email,String key){return post(t.root()+"/members").with(csrf().asHeader()).header("Authorization",bearer(t)).header("Idempotency-Key",key).header("X-Request-ID","team-contract").contentType("application/json").content(json.writeValueAsString(Map.of("email",email)));}
    com.ayaantrix.collector.project.dto.ProjectAssignmentDtos.Change flags(boolean review,boolean export){return new com.ayaantrix.collector.project.dto.ProjectAssignmentDtos.Change(review,export);}
    @Test void inviteContractStoresOnlyDigestAndEncryptedCapabilityAndReservesSeat() throws Exception {
      var t=tenant();String recipient="Recipient-"+UUID.randomUUID()+"@EXAMPLE.TEST",key=UUID.randomUUID().toString();long users=jdbc.queryForObject("select count(*) from collector.users",Long.class);
      var result=mvc.perform(inviteHttp(t,recipient,key)).andExpect(status().isAccepted()).andExpect(header().string("Cache-Control","no-store")).andExpect(header().string("X-Request-ID","team-contract")).andExpect(jsonPath("$.invitation.state").value("PENDING")).andReturn();
      var node=json.readTree(result.getResponse().getContentAsString());UUID id=UUID.fromString(node.at("/invitation/id").asText());String raw=raw(id);
      assertThat(result.getResponse().getContentAsString()).doesNotContain(raw,"tokenHash");assertThat(jdbc.queryForObject("select token_hash from collector.access_tokens where id=?",String.class,id)).isEqualTo(context.getBean(SecureAccountTokens.class).digest(raw));
      assertThat(jdbc.queryForObject("select payload_json::text from collector.outbox_jobs where payload_json->>'tokenId'=?",String.class,id.toString())).doesNotContain(raw,recipient.toLowerCase(Locale.ROOT));
      assertThat(jdbc.queryForObject("select count(*) from collector.users",Long.class)).isEqualTo(users);assertThat(count(t,"workspace_members")).isEqualTo(1);
      mvc.perform(inviteHttp(t,recipient,key)).andExpect(status().isAccepted()).andExpect(jsonPath("$.invitation.id").value(id.toString()));assertThat(count(t,"workspace_invitations")).isEqualTo(1);
      mvc.perform(inviteHttp(t,"different@example.test",key)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
      mvc.perform(inviteHttp(t,recipient.toLowerCase(Locale.ROOT),UUID.randomUUID().toString())).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVITATION_PENDING"));
      mvc.perform(get(t.root()+"/members").header("Authorization",bearer(t))).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1)).andExpect(jsonPath("$.pendingInvites.length()").value(1));
    }
    @Test void verifiedAcceptanceConsumesExactlyOnceAndMeReflectsLiveMembership() throws Exception {
      var t=tenant();var actor=actor();var i=invite(t,email(actor));String raw=raw(i.id()),key=UUID.randomUUID().toString();var body=new com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.Accept(raw);
      var membership=as(actor,()->invitations().accept(body,key));assertThat(membership.role()).isEqualTo("MEMBER");assertThat(as(actor,()->invitations().accept(body,key))).isEqualTo(membership);
      assertThatThrownBy(()->as(actor,()->invitations().accept(body,"another-key"))).isInstanceOf(ApiException.class).extracting("code").isEqualTo("TOKEN_CONSUMED");
      mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+actor.access())).andExpect(status().isOk()).andExpect(jsonPath("$.memberships[0].workspaceId").value(t.workspace().toString()));
      assertThat(jdbc.queryForObject("select encrypted_payload is null from collector.outbox_jobs where payload_json->>'tokenId'=?",Boolean.class,i.id().toString())).isTrue();
      assertThat(count(t,"workspace_members")).isEqualTo(2);
    }
    @Test void wrongVerifiedIdentityCannotConsumeOrReserveAnotherSeat(){
      var t=tenant();var actor=actor();var wrong=actor();var i=invite(t,email(actor));String raw=raw(i.id());
      assertThatThrownBy(()->as(wrong,()->invitations().accept(new com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.Accept(raw),"wrong"))).isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVITATION_EMAIL_MISMATCH");
      assertThat(jdbc.queryForObject("select consumed_at from collector.access_tokens where id=?",java.sql.Timestamp.class,i.id())).isNull();assertThat(count(t,"workspace_members")).isEqualTo(1);
    }
    @ParameterizedTest @ValueSource(strings={"expired","revoked","purpose","disabled-user","closed-workspace"})
    void unusableInvitationsFailClosed(String kind){
      var t=tenant();var actor=actor();var i=invite(t,email(actor));String raw=raw(i.id());
      switch(kind){case "expired"->jdbc.update("update collector.access_tokens set created_at=?,expires_at=? where id=?",java.sql.Timestamp.from(NOW.minusSeconds(20)),java.sql.Timestamp.from(NOW.minusSeconds(1)),i.id());case "revoked"->as(t.actor(),()->{invitations().revoke(t.workspace(),i.id());return true;});case "purpose"->raw=context.getBean(SecureAccountTokens.class).generate();case "disabled-user"->jdbc.update("update collector.users set state='DISABLED' where id=?",actor.id());case "closed-workspace"->jdbc.update("update collector.workspaces set state='SUSPENDED' where id=?",t.workspace());}
      final String input=raw;assertThatThrownBy(()->as(actor,()->invitations().accept(new com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.Accept(input),"reject"))).isInstanceOf(ApiException.class);assertThat(count(t,"workspace_members")).isEqualTo(1);
    }
    @Test void seatReservationExpiryRevokeAndSoloLimitAreTransactional(){
      var t=tenant();var ids=new ArrayList<UUID>();for(int i=0;i<4;i++)ids.add(invite(t,"seat-"+i+"@example.test").id());
      assertThatThrownBy(()->invite(t,"full@example.test")).isInstanceOf(ApiException.class).extracting("code").isEqualTo("SEAT_LIMIT");
      as(t.actor(),()->{invitations().revoke(t.workspace(),ids.getFirst());return true;});invite(t,"replacement@example.test");
      jdbc.update("update collector.access_tokens set created_at=?,expires_at=? where id=?",java.sql.Timestamp.from(NOW.minusSeconds(20)),java.sql.Timestamp.from(NOW.minusSeconds(1)),ids.get(1));invite(t,"expired-replacement@example.test");
      var solo=tenant();jdbc.update("update collector.subscriptions set plan_key='SOLO' where workspace_id=?",solo.workspace());assertThatThrownBy(()->invite(solo,"solo@example.test")).isInstanceOf(ApiException.class).extracting("code").isEqualTo("SEAT_LIMIT");
    }
    @Test void duplicateConcurrentInvitationsAndAcceptancesHaveOneWinner() throws Exception {
      var t=tenant();var actor=actor();var pool=Executors.newFixedThreadPool(2);var gate=new CountDownLatch(1);
      try{Callable<String> invite=()->{gate.await();try{invite(t,email(actor));return "created";}catch(ApiException e){return e.getCode();}};var a=pool.submit(invite);var c=pool.submit(invite);gate.countDown();assertThat(List.of(a.get(20,TimeUnit.SECONDS),c.get(20,TimeUnit.SECONDS))).containsExactlyInAnyOrder("created","INVITATION_PENDING");
       UUID id=jdbc.queryForObject("select id from collector.workspace_invitations where workspace_id=?",UUID.class,t.workspace());String raw=raw(id);var barrier=new CountDownLatch(1);Callable<String> accept=()->{barrier.await();try{as(actor,()->invitations().accept(new com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.Accept(raw),UUID.randomUUID().toString()));return "accepted";}catch(ApiException e){return e.getCode();}};a=pool.submit(accept);c=pool.submit(accept);barrier.countDown();assertThat(List.of(a.get(20,TimeUnit.SECONDS),c.get(20,TimeUnit.SECONDS))).containsExactlyInAnyOrder("accepted","TOKEN_CONSUMED");assertThat(count(t,"workspace_members")).isEqualTo(2);
      }finally{pool.shutdownNow();}
    }
    @Test void outboxAndAuditFailureRollBackInvitationTokenSeatAndIdempotency(){
      var t=tenant();jdbc.execute("create function collector.reject_team_mail() returns trigger language plpgsql as $$ begin raise exception 'synthetic team outbox failure'; end; $$");jdbc.execute("create trigger reject_team_mail before insert on collector.outbox_jobs for each row when(new.job_type='TEAM_INVITE') execute function collector.reject_team_mail()");
      try{assertThatThrownBy(()->invite(t,"rollback@example.test")).isInstanceOf(RuntimeException.class);assertThat(count(t,"workspace_invitations")).isZero();assertThat(count(t,"idempotency_records")).isZero();assertThat(count(t,"audit_logs")).isZero();assertThat(jdbc.queryForObject("select count(*) from collector.access_tokens where workspace_id=?",Long.class,t.workspace())).isZero();}finally{jdbc.execute("drop trigger reject_team_mail on collector.outbox_jobs");jdbc.execute("drop function collector.reject_team_mail()");}
    }
    @Test void deliveryReusesExistingWorkerAndErasesCapabilitiesAndRechecksRevocation(){
      var t=tenant();var i=invite(t,"delivery-"+UUID.randomUUID()+"@example.test");var worker=context.getBean(com.ayaantrix.collector.auth.delivery.VerificationDeliveryWorker.class);var mailbox=context.getBean(Mailbox.class);
      for(int n=0;n<100 && mailbox.messages.stream().noneMatch(m->m.recipient().equals(i.email()));n++)assertThat(worker.dispatchOne()).isTrue();
      var message=mailbox.messages.stream().filter(m->m.recipient().equals(i.email())).findFirst().orElseThrow();assertThat(message.purpose()).isEqualTo(com.ayaantrix.collector.auth.entity.TokenPurpose.TEAM_INVITE);assertThat(message.actionLink().getPath()).isEqualTo("/team-invite");assertThat(message.actionLink().getFragment()).startsWith("token=");
      assertThat(jdbc.queryForObject("select encrypted_payload is null from collector.outbox_jobs where payload_json->>'tokenId'=?",Boolean.class,i.id().toString())).isTrue();
      var revoked=invite(t,"revoked-delivery@example.test");as(t.actor(),()->{invitations().revoke(t.workspace(),revoked.id());return true;});while(worker.dispatchOne()){}assertThat(mailbox.messages.stream().noneMatch(m->m.recipient().equals(revoked.email()))).isTrue();
    }
    @ParameterizedTest @ValueSource(strings={"read","review","export","both"})
    void assignmentFlagsAreScopedAndNeverGrantOwnerMutations(String kind) throws Exception {
      var t=tenant();var actor=actor();var membership=join(t,actor);var p=create(t,ProjectType.WEBSITE);var hidden=create(t,ProjectType.WEB_APP);
      var set=flags(kind.equals("review")||kind.equals("both"),kind.equals("export")||kind.equals("both"));as(t.actor(),()->assignments().put(t.workspace(),p.id(),membership.memberId(),set));as(t.actor(),()->assignments().put(t.workspace(),p.id(),membership.memberId(),set));assertThat(count(t,"project_members")).isEqualTo(1);
      var detail=as(actor,()->service().read(t.workspace(),p.id()));assertThat(detail.project().permissions().canEditStructure()).isFalse();assertThat(detail.project().permissions().canManageAccess()).isFalse();assertThat(detail.project().permissions().canReview()).isEqualTo(set.canReview());assertThat(detail.project().permissions().canExport()).isEqualTo(set.canExport());
      assertThat(as(actor,()->service().list(t.workspace(),"",null,null,"title",0,100)).data()).extracting(ProjectDtos.Summary::id).containsExactly(p.id());assertThat(as(actor,()->service().customers(t.workspace(),0,100)).data()).extracting(ProjectDtos.Customer::id).containsExactly(t.client());
      assertThatThrownBy(()->as(actor,()->service().read(t.workspace(),hidden.id()))).isInstanceOf(ApiException.class).extracting("code").isEqualTo("NOT_FOUND");
      mvc.perform(get(t.root()+"/projects/"+p.id()+"/client-preview").header("Authorization","Bearer "+actor.access())).andExpect(status().isNotFound());
      mvc.perform(post(t.root()+"/projects/"+p.id()+"/sections").header("Authorization","Bearer "+actor.access()).with(csrf().asHeader()).contentType("application/json").content("{\"title\":\"Denied\",\"expectedStructureVersion\":1}")).andExpect(status().isForbidden());
    }
    @Test void assignmentAndMembershipRevocationAreImmediateAndOldAcceptReplayCannotRestoreAccess() throws Exception {
      var t=tenant();var actor=actor();var i=invite(t,email(actor));String raw=raw(i.id()),key="join-once";var body=new com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.Accept(raw);var member=as(actor,()->invitations().accept(body,key));var p=create(t,ProjectType.WEBSITE);
      as(t.actor(),()->assignments().put(t.workspace(),p.id(),member.memberId(),flags(true,true)));as(t.actor(),()->{assignments().revoke(t.workspace(),p.id(),member.memberId());return true;});assertThatThrownBy(()->as(actor,()->service().read(t.workspace(),p.id()))).isInstanceOf(ApiException.class);
      as(t.actor(),()->assignments().put(t.workspace(),p.id(),member.memberId(),flags(true,true)));as(t.actor(),()->team().state(t.workspace(),member.memberId(),new com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.StateChange(WorkspaceMember.State.DISABLED,null)));
      assertThatThrownBy(()->as(actor,()->invitations().accept(body,key))).isInstanceOf(ApiException.class);assertThat(count(t,"project_members")).isZero();mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+actor.access())).andExpect(status().isOk()).andExpect(jsonPath("$.memberships.length()").value(0));
      jdbc.update("insert into collector.project_members(workspace_id,project_id,workspace_member_id,created_at,updated_at) values(?,?,?,?,?)",t.workspace(),p.id(),member.memberId(),java.sql.Timestamp.from(NOW),java.sql.Timestamp.from(NOW));assertThatThrownBy(()->as(actor,()->service().read(t.workspace(),p.id()))).isInstanceOf(ApiException.class);
    }
    @Test void assignmentForeignKeysAndCrossTenantOperationsRejectForgedIds() throws Exception {
      var t=tenant();var other=tenant();var actor=actor();var member=join(other,actor);var p=create(t,ProjectType.WEBSITE);
      assertThatThrownBy(()->as(t.actor(),()->assignments().put(t.workspace(),p.id(),member.memberId(),flags(false,false)))).isInstanceOf(ApiException.class);
      assertThatThrownBy(()->jdbc.update("insert into collector.project_members(workspace_id,project_id,workspace_member_id,created_at,updated_at) values(?,?,?,?,?)",t.workspace(),p.id(),member.memberId(),java.sql.Timestamp.from(NOW),java.sql.Timestamp.from(NOW))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
      mvc.perform(get(t.root()+"/members").header("Authorization",bearer(other))).andExpect(status().isNotFound());mvc.perform(get(t.root()+"/members")).andExpect(status().isUnauthorized());mvc.perform(post(t.root()+"/members").header("Authorization",bearer(t)).header("Idempotency-Key","csrf").contentType("application/json").content("{\"email\":\"denied@example.test\"}")).andExpect(status().isForbidden());
    }
    @ParameterizedTest @ValueSource(strings={"disable","delete","promote"})
    void directRoleChangesNeverBypassSoleOwnerProtection(String kind) throws Exception {
      var t=tenant();UUID owner=as(t.actor(),()->team().list(t.workspace())).data().getFirst().id();
      if(kind.equals("delete"))mvc.perform(delete(t.root()+"/members/"+owner).header("Authorization",bearer(t)).with(csrf().asHeader())).andExpect(status().isConflict());
      else mvc.perform(patch(t.root()+"/members/"+owner).header("Authorization",bearer(t)).with(csrf().asHeader()).contentType("application/json").content(kind.equals("disable")?"{\"state\":\"DISABLED\"}":"{\"state\":\"ACTIVE\",\"role\":\"OWNER\"}")).andExpect(status().is4xxClientError());
      assertThat(jdbc.queryForObject("select count(*) from collector.workspace_members where workspace_id=? and role='OWNER' and state='ACTIVE'",Long.class,t.workspace())).isEqualTo(1);
    }
    @Test void reauthenticatedOwnershipTransferPreservesOneOwnerAndCannotEscalateAnotherWorkspace(){
      var t=tenant();var actor=actor();var member=join(t,actor);var input=new com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.Transfer(member.memberId(),PASSWORD);
      assertThatThrownBy(()->as(t.actor(),()->team().transfer(t.workspace(),new com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.Transfer(member.memberId(),"incorrect password"),"wrong-password"))).isInstanceOf(ApiException.class);
      as(t.actor(),()->team().transfer(t.workspace(),input,"transfer"));as(t.actor(),()->team().transfer(t.workspace(),input,"transfer"));
      assertThat(jdbc.queryForObject("select user_id from collector.workspace_members where workspace_id=? and role='OWNER' and state='ACTIVE'",UUID.class,t.workspace())).isEqualTo(actor.id());
      assertThatThrownBy(()->as(t.actor(),()->team().state(t.workspace(),member.memberId(),new com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.StateChange(WorkspaceMember.State.DISABLED,null)))).isInstanceOf(ApiException.class);
    }
    @Test void restartAndMigrationValidationPreserveInvitationsAndAssignments(){
      var t=tenant();var actor=actor();var member=join(t,actor);var p=create(t,ProjectType.WEBSITE);as(t.actor(),()->assignments().put(t.workspace(),p.id(),member.memberId(),flags(true,false)));var invitation=invite(t,"restart@example.test");context.close();open();
      assertThat(as(actor,()->service().read(t.workspace(),p.id())).project().id()).isEqualTo(p.id());assertThat(as(t.actor(),()->team().list(t.workspace())).pendingInvites()).extracting(com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.Invitation::id).contains(invitation.id());assertThat(context.getBean(Flyway.class).info().applied()).hasSize(11);assertThat(context.getBean(Flyway.class).validateWithResult().validationSuccessful).isTrue();
    }
    @ParameterizedTest @ValueSource(strings={"membership","assignment"})
    void concurrentRevocationAndMemberReadSerializeWithoutRestoringAccess(String mode) throws Exception {
      var t=tenant();var actor=actor();var member=join(t,actor);var p=create(t,ProjectType.WEBSITE);
      as(t.actor(),()->assignments().put(t.workspace(),p.id(),member.memberId(),flags(true,true)));
      var pool=Executors.newFixedThreadPool(2);var gate=new CountDownLatch(1);
      try {
        var read=pool.submit(()->{gate.await();try{as(actor,()->service().read(t.workspace(),p.id()));return "read";}catch(ApiException e){return e.getCode();}});
        var revoke=pool.submit(()->{gate.await();return as(t.actor(),()->{if(mode.equals("membership"))team().state(t.workspace(),member.memberId(),new com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.StateChange(WorkspaceMember.State.DISABLED,null));else assignments().revoke(t.workspace(),p.id(),member.memberId());return true;});});
        gate.countDown();assertThat(read.get(20,TimeUnit.SECONDS)).isIn("read","NOT_FOUND");assertThat(revoke.get(20,TimeUnit.SECONDS)).isTrue();
        assertThatThrownBy(()->as(actor,()->service().read(t.workspace(),p.id()))).isInstanceOf(ApiException.class);assertThat(count(t,"project_members")).isZero();
      }finally{pool.shutdownNow();}
    }
    @Test void acceptanceAuditFailureRollsBackTokenMembershipAndReservation(){
      var t=tenant();var actor=actor();var invitation=invite(t,email(actor));String raw=raw(invitation.id());
      jdbc.execute("create function collector.reject_team_audit() returns trigger language plpgsql as $$ begin raise exception 'synthetic audit failure'; end; $$");
      jdbc.execute("create trigger reject_team_audit before insert on collector.audit_logs for each row when(new.action='TEAM_INVITATION_ACCEPTED') execute function collector.reject_team_audit()");
      try{
        assertThatThrownBy(()->as(actor,()->invitations().accept(new com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.Accept(raw),"rollback-accept"))).isInstanceOf(RuntimeException.class);
        assertThat(count(t,"workspace_members")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select consumed_at is null from collector.access_tokens where id=?",Boolean.class,invitation.id())).isTrue();
        assertThat(jdbc.queryForObject("select state from collector.workspace_invitations where id=?",String.class,invitation.id())).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject("select encrypted_payload is not null from collector.outbox_jobs where payload_json->>'tokenId'=?",Boolean.class,invitation.id().toString())).isTrue();
      }finally{jdbc.execute("drop trigger reject_team_audit on collector.audit_logs");jdbc.execute("drop function collector.reject_team_audit()");}
      assertThat(as(actor,()->invitations().accept(new com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.Accept(raw),"rollback-accept")).workspaceId()).isEqualTo(t.workspace());
    }
    @Test void unknownTeamDeliveryIsHeldUntilEvidenceAndRevokedTokenCannotRetry(){
      var t=tenant();var invitation=invite(t,"unknown-"+UUID.randomUUID()+"@example.test");
      // Drain unrelated queued jobs before exercising this recipient's unknown outcome.
      jdbc.update("update collector.outbox_jobs set available_at=? where payload_json->>'tokenId'<>? and state='QUEUED'",java.sql.Timestamp.from(NOW.plusSeconds(3600)),invitation.id().toString());
      var mailbox=context.getBean(Mailbox.class);var worker=context.getBean(com.ayaantrix.collector.auth.delivery.VerificationDeliveryWorker.class);mailbox.unknown=true;
      try{assertThat(worker.dispatchOne()).isTrue();}finally{mailbox.unknown=false;}
      var operations=context.getBean(com.ayaantrix.collector.auth.delivery.AccountDeliveryOperations.class);
      var held=operations.inspectHeld(100).stream().filter(j->j.purpose().equals("TEAM_INVITE")).findFirst().orElseThrow();
      assertThat(held.outcome()).isEqualTo("DELIVERY_OUTCOME_UNKNOWN");assertThat(worker.dispatchOne()).isFalse();
      as(t.actor(),()->{invitations().revoke(t.workspace(),invitation.id());return true;});
      assertThat(operations.reconcile(held.id(),held.updatedAt(),held.attempts(),com.ayaantrix.collector.auth.delivery.AccountDeliveryOperations.Resolution.CONFIRMED_NOT_SENT,"CASE-13")).isFalse();
      assertThat(jdbc.queryForObject("select encrypted_payload is null from collector.outbox_jobs where id=?",Boolean.class,held.id())).isTrue();
    }

    @ParameterizedTest @ValueSource(strings={"invalid","missing-at","too-long"})
    void invalidInvitationInputCannotCreateCapability(String kind) throws Exception {
      var t=tenant();String email=kind.equals("too-long")?"a".repeat(250)+"@example.test":kind;
      mvc.perform(inviteHttp(t,email,"invalid-email")).andExpect(status().isBadRequest());assertThat(count(t,"workspace_invitations")).isZero();
    }
    @Test void concurrentOwnershipTransfersLeaveExactlyOneOwner() throws Exception {
      var t=tenant();var first=join(t,actor());var second=join(t,actor());var pool=Executors.newFixedThreadPool(2);var gate=new CountDownLatch(1);
      try{
        java.util.function.Function<UUID,Callable<String>> transfer=id->()->{gate.await();try{as(t.actor(),()->team().transfer(t.workspace(),new com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.Transfer(id,PASSWORD),UUID.randomUUID().toString()));return "transferred";}catch(ApiException e){return e.getCode();}};
        var a=pool.submit(transfer.apply(first.memberId()));var b=pool.submit(transfer.apply(second.memberId()));gate.countDown();
        assertThat(List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS))).containsExactlyInAnyOrder("transferred","ACCESS_DENIED");
        assertThat(jdbc.queryForObject("select count(*) from collector.workspace_members where workspace_id=? and role='OWNER' and state='ACTIVE'",Long.class,t.workspace())).isEqualTo(1);
      }finally{pool.shutdownNow();}
    }
    @Test void concurrentAssignmentAndRevocationAreAtomicAndCannotDuplicateRows() throws Exception {
      var t=tenant();var member=join(t,actor());var p=create(t,ProjectType.WEBSITE);var pool=Executors.newFixedThreadPool(2);var gate=new CountDownLatch(1);
      try{
        var put=pool.submit(()->{gate.await();return as(t.actor(),()->assignments().put(t.workspace(),p.id(),member.memberId(),flags(true,false)));});
        var remove=pool.submit(()->{gate.await();return as(t.actor(),()->{assignments().revoke(t.workspace(),p.id(),member.memberId());return true;});});
        gate.countDown();assertThat(put.get(20,TimeUnit.SECONDS).canReview()).isTrue();assertThat(remove.get(20,TimeUnit.SECONDS)).isTrue();assertThat(count(t,"project_members")).isBetween(0L,1L);
        as(t.actor(),()->{assignments().revoke(t.workspace(),p.id(),member.memberId());return true;});assertThat(count(t,"project_members")).isZero();
      }finally{pool.shutdownNow();}
    }
    @Test void memberRemovalRacingStructureWriteNeverGrantsOwnerCapabilities() throws Exception {
      var t=tenant();var actor=actor();var member=join(t,actor);var p=create(t,ProjectType.WEBSITE);as(t.actor(),()->assignments().put(t.workspace(),p.id(),member.memberId(),flags(true,true)));
      var before=detail(t,p);var pool=Executors.newFixedThreadPool(2);var gate=new CountDownLatch(1);
      try{
        var write=pool.submit(()->{gate.await();try{as(actor,()->editor().createSection(t.workspace(),p.id(),new SectionCreate(null,"Unauthorized",before.project().structureVersion())));return "unexpected";}catch(ApiException e){return e.getCode();}});
        var remove=pool.submit(()->{gate.await();return as(t.actor(),()->team().state(t.workspace(),member.memberId(),new com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.StateChange(WorkspaceMember.State.DISABLED,null)));});
        gate.countDown();assertThat(write.get(20,TimeUnit.SECONDS)).isIn("ACCESS_DENIED","NOT_FOUND");assertThat(remove.get(20,TimeUnit.SECONDS).state()).isEqualTo(WorkspaceMember.State.DISABLED);assertThat(detail(t,p)).isEqualTo(before);
      }finally{pool.shutdownNow();}
    }

    @ParameterizedTest @ValueSource(strings={"disabled","unverified"})
    void ineligibleAccountsCannotReceiveProjectAssignments(String kind){
      var t=tenant();var actor=actor();var member=join(t,actor);var p=create(t,ProjectType.WEBSITE);
      if(kind.equals("disabled"))jdbc.update("update collector.users set state='DISABLED' where id=?",actor.id());
      else jdbc.update("update collector.users set state='UNVERIFIED',verified_at=null where id=?",actor.id());
      assertThatThrownBy(()->as(t.actor(),()->assignments().put(t.workspace(),p.id(),member.memberId(),flags(true,true)))).isInstanceOf(ApiException.class).extracting("code").isEqualTo("NOT_FOUND");assertThat(count(t,"project_members")).isZero();
    }

    @ParameterizedTest @ValueSource(strings={"EXPIRE","CLOSE"})
    void acceptanceWaitingOnWorkspaceLockRechecksExpiryAndWorkspaceState(String kind) throws Exception {
      var t=tenant();var actor=actor();var invitation=invite(t,email(actor));String raw=raw(invitation.id());var held=new CountDownLatch(1);var release=new CountDownLatch(1);
      try(var pool=Executors.newFixedThreadPool(2)){
        var change=pool.submit(()->tx().executeWithoutResult(status->{
          jdbc.queryForObject("select id from collector.workspaces where id=? for update",UUID.class,t.workspace());held.countDown();
          try{if(!release.await(12,TimeUnit.SECONDS))throw new IllegalStateException("Synthetic lock wait timed out");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}
          if(kind.equals("EXPIRE"))jdbc.update("update collector.access_tokens set created_at=?,expires_at=? where id=?",java.sql.Timestamp.from(NOW.minusSeconds(20)),java.sql.Timestamp.from(NOW.minusSeconds(1)),invitation.id());
          else jdbc.update("update collector.workspaces set state='DELETION_PENDING' where id=?",t.workspace());
        }));
        assertThat(held.await(5,TimeUnit.SECONDS)).isTrue();
        var accept=pool.submit(()->{try{as(actor,()->invitations().accept(new com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.Accept(raw),"waiting-accept"));return "ACCEPTED";}catch(ApiException e){return e.getCode();}});
        try{
          long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(6);int waiting=0;
          while(waiting==0 && System.nanoTime()<until){waiting=jdbc.queryForObject("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%workspaces%' and pid<>pg_backend_pid()",Integer.class);if(waiting==0)Thread.sleep(10);}
          assertThat(waiting).as("Actual PostgreSQL invitation acceptance waiter").isGreaterThan(0);
        }finally{release.countDown();}
        change.get(15,TimeUnit.SECONDS);assertThat(accept.get(15,TimeUnit.SECONDS)).isIn("TOKEN_INVALID","TOKEN_EXPIRED");
      }finally{release.countDown();}
      assertThat(count(t,"workspace_members")).isEqualTo(1);assertThat(jdbc.queryForObject("select consumed_at is null from collector.access_tokens where id=?",Boolean.class,invitation.id())).isTrue();
      assertThat(jdbc.queryForObject("select count(*) from collector.audit_logs where workspace_id=? and action='TEAM_INVITATION_ACCEPTED'",Long.class,t.workspace())).isZero();
    }

}

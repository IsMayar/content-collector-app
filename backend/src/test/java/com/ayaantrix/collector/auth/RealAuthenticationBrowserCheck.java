package com.ayaantrix.collector.auth;

import com.ayaantrix.collector.CollectorApplication;
import com.ayaantrix.collector.auth.dto.LoginRequest;
import com.ayaantrix.collector.auth.delivery.*;
import com.ayaantrix.collector.workspace.entity.*;
import com.ayaantrix.collector.workspace.dto.*;
import com.ayaantrix.collector.workspace.service.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import com.ayaantrix.collector.auth.entity.*;
import com.ayaantrix.collector.auth.repository.*;
import com.ayaantrix.collector.auth.security.*;
import com.ayaantrix.collector.auth.service.AgencySessions;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.json.JsonMapper;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

/** Explicit integration command, separate from backend-only CI. No assumptions or skipped browser tests. */
@Testcontainers
class RealAuthenticationBrowserCheck {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse(
        "public.ecr.aws/docker/library/postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873").asCompatibleSubstituteFor("postgres"));
    @TempDir Path directory;
    static class Mailbox implements VerificationMailSender {
        final List<Message> messages=new CopyOnWriteArrayList<>();
        public void send(Message message){messages.add(message);}
    }
    static class ReminderMailbox implements com.ayaantrix.collector.reminder.service.EmailSender {
      final List<Message> messages=new CopyOnWriteArrayList<>();public boolean available(){return true;}public Result send(Message message){messages.add(message);return new Result("ACCEPTED",UUID.randomUUID().toString(),null);}
    }
    static class BrowserSms implements com.ayaantrix.collector.sms.provider.SmsSender {
      boolean enabled=false;final List<String> messages=new CopyOnWriteArrayList<>();public boolean available(){return enabled;}public String scope(){return "MG"+"0".repeat(32);}public com.ayaantrix.collector.reminder.service.EmailSender.Result send(UUID id,String phone,String body){messages.add(body);return new com.ayaantrix.collector.reminder.service.EmailSender.Result("ACCEPTED","SM"+UUID.randomUUID().toString().replace("-",""),null);}
    }
    static class BrowserAiProvider implements com.ayaantrix.collector.ai.provider.AiDraftProvider {
        volatile boolean fail=true;
        public boolean available(){return true;}
        public Output generate(Input input,java.time.Duration remaining){if(fail)throw new Failure("AI_TIMEOUT",false);return new Output(new com.ayaantrix.collector.ai.dto.AiDtos.Result(String.join(" ",input.facts()),input.facts(),List.of(),List.of("Local test suggestion; review before use.")),100,50);}
    }
    @org.springframework.boot.test.context.TestConfiguration(proxyBeanMethods=false)
    static class Configuration {
        @Bean @Primary BrowserSms browserSms(){return new BrowserSms();}
        @Bean @Primary ReminderMailbox reminderMailbox(){return new ReminderMailbox();}
        @Bean @Primary BrowserAiProvider browserAiProvider(){return new BrowserAiProvider();}
        @Bean org.springframework.web.servlet.config.annotation.WebMvcConfigurer safeBrowserDiagnostics(){return new org.springframework.web.servlet.config.annotation.WebMvcConfigurer(){public void extendHandlerExceptionResolvers(java.util.List<org.springframework.web.servlet.HandlerExceptionResolver> resolvers){resolvers.addFirst((request,response,handler,error)->{Throwable root=error;while(root.getCause()!=null)root=root.getCause();if(!(error instanceof com.ayaantrix.collector.common.error.ApiException)){System.out.println("SAFE_BROWSER_ERROR "+root.getClass().getName());java.util.Arrays.stream(root.getStackTrace()).limit(6).forEach(frame->System.out.println("SAFE_BROWSER_FRAME "+frame));}return null;});}};}
        @Bean @Primary Mailbox browserMailbox(){return new Mailbox();}
        @Bean @Primary AccountRegistrationWorkflowTests.TestClock browserClock(){var clock=new AccountRegistrationWorkflowTests.TestClock();clock.now.set(Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS));return clock;}
    }
    @Test void realHttpsBrowserAuthLifecycleWithoutMocks() throws Exception {run(false);}
    @Test void realHttpsWorkspaceOnboardingWithoutMocks() throws Exception {run(true);}
    @Test void realHttpsAnalyticsWithoutMocks() throws Exception {run(true,true);}
    private void run(boolean onboarding) throws Exception {run(onboarding,false);}
    @Test void realHttpsFrictionWithoutMocks() throws Exception {run(true,true,true);}
    private void run(boolean onboarding,boolean analyticsOnly) throws Exception {run(onboarding,analyticsOnly,false);}
    @Test void realHttpsVisibilityWithoutMocks() throws Exception {run(true,true,false,true);}
    private void run(boolean onboarding,boolean analyticsOnly,boolean frictionOnly) throws Exception {run(onboarding,analyticsOnly,frictionOnly,false);}
    private void run(boolean onboarding,boolean analyticsOnly,boolean frictionOnly,boolean visibilityOnly) throws Exception {
        String password="Synthetic browser-only password",next="Synthetic replacement browser password",email=onboarding?"browser-onboarding@example.test":"browser-only@example.test";
        String certificatePassword=UUID.randomUUID().toString();Path certificate=directory.resolve("browser.p12");
        String keytool=Path.of(System.getProperty("java.home"),"bin","keytool.exe").toString();
        var cert=new ProcessBuilder(keytool,"-genkeypair","-alias","browser","-keyalg","RSA","-keysize","2048","-validity","1",
            "-dname","CN=localhost","-storetype","PKCS12","-keystore",certificate.toString(),"-storepass",certificatePassword,"-keypass",certificatePassword)
            .redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();
        assertThat(cert.waitFor(30,TimeUnit.SECONDS)).as("Local test certificate generation").isTrue();assertThat(cert.exitValue()).isZero();
        var keys=SigningKeyFixture.create(directory.resolve("signing"),"browser-only");byte[] bytes=new byte[32];new java.security.SecureRandom().nextBytes(bytes);String pepper=Base64.getEncoder().encodeToString(bytes);
        var storage=new com.ayaantrix.collector.attachment.StorageFixture();storage.start();
        try(storage;ConfigurableApplicationContext app=new SpringApplicationBuilder(CollectorApplication.class,Configuration.class).profiles("test").run(java.util.stream.Stream.concat(java.util.stream.Stream.of(
            "--server.port=0","--server.address=127.0.0.1","--spring.datasource.url="+POSTGRES.getJdbcUrl(),
            "--spring.datasource.username="+POSTGRES.getUsername(),"--spring.datasource.password="+POSTGRES.getPassword(),
            "--collector.jwt.private-key="+keys.privateFile(),"--collector.jwt.public-keys="+keys.publicFile(),"--collector.jwt.key-id="+keys.kid(),
            "--collector.delivery.encryption-key="+pepper,"--collector.delivery.encryption-key-id=browser-test","--collector.jwt.issuer=https://browser.test","--collector.jwt.audience=collector-api","--collector.auth.token-hash-pepper="+pepper,
            "--collector.workspace.trial-sms-segments=25","--collector.sms.segment-cost-microusd=100","--collector.sms.monthly-budget-microusd=100000","--collector.ai.worker-enabled=true","--AI_MODEL=synthetic-structured-fixture","--AI_INPUT_MICROUSD_PER_TOKEN=1","--AI_OUTPUT_MICROUSD_PER_TOKEN=2","--AI_MONTHLY_BUDGET_MICROUSD=10000000","--collector.workspace.trial-ai-drafts=20","--collector.exports.worker-enabled=true","--collector.auth.cookie-secure=true","--server.servlet.session.cookie.secure=true","--collector.delivery.worker-enabled=false"),java.util.Arrays.stream(storage.args()).map(v->v.equals("--collector.storage.worker-enabled=false")?"--collector.storage.worker-enabled=true":v)).toArray(String[]::new))) {
            var clock=app.getBean(AccountRegistrationWorkflowTests.TestClock.class);var users=app.getBean(UserAccountRepository.class);
            UserAccount user=null;
            if(!onboarding){user=new UserAccount(email,"Synthetic Browser User",app.getBean(PasswordEncoder.class).encode(password),clock.instant());user.markVerified(clock.instant());users.saveAndFlush(user);}
            int port=((WebServerApplicationContext)app).getWebServer().getPort();
            Path runner=Path.of(System.getProperty("user.dir")).resolve("../frontend/tests/integration/real-auth/browser-check.mjs").normalize();
            var builder=new ProcessBuilder("node",runner.toString()).redirectError(ProcessBuilder.Redirect.DISCARD);
            builder.environment().remove("DEBUG");builder.environment().remove("PWDEBUG");
            Process process=builder.start();
            try(var io=new BrowserProtocol(process)) {
                String browserOrigin=io.step(Map.of("action","start","backend","http://127.0.0.1:"+port,"email",email,"password",password,"certificate",certificate.toString(),"certificatePassword",certificatePassword,"onboarding",Boolean.toString(onboarding)));
                storage.allowBrowserOrigin(browserOrigin);
                if(onboarding){
                    io.step(Map.of("action","workspace-register"));
                    assertThat(app.getBean(VerificationDeliveryWorker.class).dispatchOne()).isTrue();
                    var message=app.getBean(Mailbox.class).messages.getFirst();
                    assertThat(message.recipient()).isEqualTo(email);assertThat(message.purpose()).isEqualTo(TokenPurpose.VERIFY_EMAIL);
                    io.step(Map.of("action","workspace-verify","token",message.actionLink().getFragment().substring("token=".length())));
                    io.step(Map.of("action","signin-safe"));io.step(Map.of("action","workspace-create"));
                    var jdbc=app.getBean(JdbcTemplate.class);var actor=users.findByEmailNormalized(email).orElseThrow();
                    UUID workspace=jdbc.queryForObject("select workspace_id from collector.workspace_members where user_id=? and role='OWNER'",UUID.class,actor.getId());
                    assertThat(jdbc.queryForObject("select state from collector.subscriptions where workspace_id=?",String.class,workspace)).isEqualTo("TRIALING");
                    assertThat(jdbc.queryForObject("select plan_key from collector.subscriptions where workspace_id=?",String.class,workspace)).isEqualTo("AGENCY");
                    assertThat(jdbc.queryForObject("select current_period_end-current_period_start=interval '14 days' from collector.subscriptions where workspace_id=?",Boolean.class,workspace)).isTrue();
                    io.step(Map.of("action","workspace-projects"));
                    assertThat(jdbc.queryForObject("select count(*) from collector.projects where workspace_id=?",Integer.class,workspace)).isEqualTo(3);
                    assertThat(jdbc.queryForObject("select count(*) from collector.project_snapshots where workspace_id=?",Integer.class,workspace)).isEqualTo(3);
                    assertThat(jdbc.queryForList("select distinct project_type from collector.projects where workspace_id=?",String.class,workspace)).containsExactlyInAnyOrder("WEBSITE","WEB_APP","MOBILE_APP");
                    var initialSnapshots=jdbc.queryForList("select definition::text from collector.project_snapshots where workspace_id=? order by id",String.class,workspace);
                    io.step(Map.of("action","workspace-structure"));
                    assertThat(jdbc.queryForObject("select count(*) from collector.audit_logs where workspace_id=?",Integer.class,workspace)).isEqualTo(17);
                    assertThat(jdbc.queryForObject("select structure_version from collector.projects where workspace_id=? and project_type='WEBSITE'",Long.class,workspace)).isEqualTo(18);
                    assertThat(jdbc.queryForList("select definition::text from collector.project_snapshots where workspace_id=? order by id",String.class,workspace)).isEqualTo(initialSnapshots);
                    var beforePreview=jdbc.queryForList("select id,structure_version,version,state from collector.projects where workspace_id=? order by id",workspace);
                    io.step(Map.of("action","workspace-contacts-preview"));
                    assertThat(jdbc.queryForObject("select count(*) from collector.project_contacts where workspace_id=?",Integer.class,workspace)).isEqualTo(1);
                    assertThat(jdbc.queryForList("select id,structure_version,version,state from collector.projects where workspace_id=? order by id",workspace)).isEqualTo(beforePreview);
                    assertThat(jdbc.queryForList("select definition::text from collector.project_snapshots where workspace_id=? order by id",String.class,workspace)).isEqualTo(initialSnapshots);
                    assertThat(jdbc.queryForObject("select count(*) from collector.audit_logs where workspace_id=?",Integer.class,workspace)).isEqualTo(17);
                    String teammate="teammate-"+UUID.randomUUID()+"@example.test";
                    io.step(Map.of("action","team-invite","email",teammate));
                    assertThat(app.getBean(VerificationDeliveryWorker.class).dispatchOne()).isTrue();
                    var invitationMail=app.getBean(Mailbox.class).messages.stream().filter(m->m.recipient().equals(teammate)&&m.purpose()==TokenPurpose.TEAM_INVITE).findFirst().orElseThrow();
                    io.step(Map.of("action","team-register"));
                    assertThat(app.getBean(VerificationDeliveryWorker.class).dispatchOne()).isTrue();
                    var verificationMail=app.getBean(Mailbox.class).messages.stream().filter(m->m.recipient().equals(teammate)&&m.purpose()==TokenPurpose.VERIFY_EMAIL).findFirst().orElseThrow();
                    io.step(Map.of("action","team-verify-accept","verification",verificationMail.actionLink().getFragment().substring(6),"invitation",invitationMail.actionLink().getFragment().substring(6)));
                    io.step(Map.of("action","team-assign-revoke"));
                    assertThat(jdbc.queryForList("select definition::text from collector.project_snapshots where workspace_id=? order by id",String.class,workspace)).isEqualTo(initialSnapshots);
                    // T22 now publishes through the real browser action before any client invitation.
                    UUID clientProject=jdbc.queryForObject("select project_id from collector.project_contacts where workspace_id=?",UUID.class,workspace);
                    io.step(Map.of("action","project-publication"));
                    assertThat(jdbc.queryForObject("select published_at is not null from collector.projects where workspace_id=? and id=?",Boolean.class,workspace,clientProject)).isTrue();
                    io.step(Map.of("action","client-owner-invite"));
                    assertThat(app.getBean(VerificationDeliveryWorker.class).dispatchOne()).isTrue();
                    var clientMail=app.getBean(Mailbox.class).messages.stream().filter(m->m.purpose()==TokenPurpose.CLIENT_INVITE).reduce((a,b)->b).orElseThrow();
                    io.step(Map.of("action","client-open","token",clientMail.actionLink().getFragment().substring(6)));
                    if(analyticsOnly){
                        io.step(Map.of("action","client-analytics"));
                        assertThat(jdbc.queryForObject("select count(*) from collector.analytics_events where project_id=? and event_type='project_opened'",Integer.class,clientProject)).isEqualTo(1);
                        assertThat(jdbc.queryForObject("select count(*) from collector.analytics_events where project_id=? and event_type='item_started'",Integer.class,clientProject)).isPositive();
                        if(frictionOnly){
                            UUID observed=jdbc.queryForObject("select item_id from collector.analytics_events where project_id=? and event_type='item_started' order by received_at limit 1",UUID.class,clientProject);
                            String key=jdbc.queryForObject("select item_key from collector.items where id=?",String.class,observed);
                            for(int n=0;n<10;n++)jdbc.update("""
                              insert into collector.analytics_events(id,workspace_id,project_id,template_version_id,session_pseudonym,client_event_id,event_type,item_id,item_key,received_at)
                              select ?,workspace_id,id,source_template_version_id,?,?,'item_started',?,?,? from collector.projects where id=?
                              """,UUID.randomUUID(),com.ayaantrix.collector.common.repository.IdempotencyRepository.hash(UUID.randomUUID().toString()),UUID.randomUUID(),observed,key,java.sql.Timestamp.from(clock.instant().minusSeconds(n<9?8*86400:60)),clientProject);
                            io.step(Map.of("action","friction-analytics","itemKey",key));
                        }
                        if(visibilityOnly){
                            io.step(Map.of("action","visibility-create"));
                            String digestZone=jdbc.queryForObject("select timezone from collector.workspaces where id=?",String.class,workspace);
                            var digestLocal=clock.instant().atZone(java.time.ZoneId.of(digestZone));
                            if(digestLocal.toLocalTime().isBefore(java.time.LocalTime.of(9,30)))clock.now.set(digestLocal.withHour(9).withMinute(30).withSecond(0).withNano(0).toInstant());
                            var worker=app.getBean(com.ayaantrix.collector.visibility.worker.DigestWorker.class);assertThat(worker.dispatchOne()).isTrue();assertThat(worker.dispatchOne()).isFalse();assertThat(app.getBean(ReminderMailbox.class).messages).hasSize(1);assertThat(app.getBean(ReminderMailbox.class).messages.getFirst().body()).contains("Awaiting review:","/app/w/").doesNotContain("#token=","value_snapshot");
                            io.step(Map.of("action","visibility-public"));
                        }
                        io.step(Map.of("action","stop"));return;
                    }
                    io.step(Map.of("action","email-reminders"));
                    assertThat(app.getBean(com.ayaantrix.collector.reminder.worker.ReminderWorker.class).dispatchOne()).isTrue();
                    assertThat(app.getBean(ReminderMailbox.class).messages).hasSize(1);
                    assertThat(jdbc.queryForObject("select state from collector.reminder_deliveries where project_id=?",String.class,clientProject)).isEqualTo("ACCEPTED");
                    io.step(Map.of("action","email-reminder-history"));
                    app.getBean(BrowserSms.class).enabled=true;
                    io.step(Map.of("action","sms-request"));
                    assertThat(app.getBean(com.ayaantrix.collector.sms.worker.SmsVerificationWorker.class).dispatchOne()).isTrue();
                    String smsCode=java.util.regex.Pattern.compile("\\b[0-9]{6}\\b").matcher(app.getBean(BrowserSms.class).messages.getFirst()).results().findFirst().orElseThrow().group();
                    io.step(Map.of("action","sms-confirm-withdraw","code",smsCode));
                    assertThat(jdbc.queryForObject("select status from collector.sms_consents where project_id=?",String.class,clientProject)).isEqualTo("OPTED_OUT");
                    app.getBean(BrowserSms.class).enabled=false;

                    io.step(Map.of("action","client-draft-collection"));
                    UUID aiItem=jdbc.queryForObject("select id from collector.items where project_id=? and field_type='LONG_TEXT' and state in ('NOT_STARTED','DRAFT') order by id limit 1",UUID.class,clientProject);
                    jdbc.update("update collector.projects set ai_enabled=true where id=?",clientProject);
                    jdbc.update("update collector.items set schema_json=jsonb_set(schema_json,'{ai}','{\"enabled\":true,\"targetWords\":150}'::jsonb) where id=?",aiItem);
                    io.step(Map.of("action","client-ai-failure","item",aiItem.toString()));
                    app.getBean(BrowserAiProvider.class).fail=false;
                    io.step(Map.of("action","client-ai-acceptance","item",aiItem.toString()));
                    io.step(Map.of("action","client-attachments"));
                    assertThat(jdbc.queryForObject("select count(*) from collector.submission_revisions where project_id=?",Integer.class,clientProject)).isEqualTo(2);
                    assertThat(jdbc.queryForObject("select count(*) from collector.revision_assets where project_id=?",Integer.class,clientProject)).isEqualTo(2);
                    assertThat(jdbc.queryForObject("select count(*) from collector.answers where project_id=?",Integer.class,clientProject)).isGreaterThan(0);
                    io.step(Map.of("action","review-decisions"));
                    assertThat(jdbc.queryForObject("select count(*) from collector.review_decisions where project_id=?",Integer.class,clientProject)).isEqualTo(2);
                    io.step(Map.of("action","approved-exports"));
                    assertThat(jdbc.queryForObject("select count(*) from collector.export_jobs where project_id=? and state='READY'",Integer.class,clientProject)).isEqualTo(3);
                    io.step(Map.of("action","project-reopening"));
                    assertThat(jdbc.queryForObject("select state from collector.projects where id=?",String.class,clientProject)).isEqualTo("ACTIVE");
                    assertThat(jdbc.queryForObject("select count(*) from collector.item_reopenings where project_id=?",Integer.class,clientProject)).isEqualTo(2);
                    clock.advance(24*3600+1);io.step(Map.of("action","client-idle-request-link"));
                    assertThat(app.getBean(VerificationDeliveryWorker.class).dispatchOne()).isTrue();
                    clientMail=app.getBean(Mailbox.class).messages.stream().filter(m->m.purpose()==TokenPurpose.CLIENT_INVITE).reduce((a,b)->b).orElseThrow();
                    io.step(Map.of("action","client-open","token",clientMail.actionLink().getFragment().substring(6)));
                    io.step(Map.of("action","client-owner-invite"));assertThat(app.getBean(VerificationDeliveryWorker.class).dispatchOne()).isTrue();
                    clientMail=app.getBean(Mailbox.class).messages.stream().filter(m->m.purpose()==TokenPurpose.CLIENT_INVITE).reduce((a,b)->b).orElseThrow();
                    String expiredClientToken=clientMail.actionLink().getFragment().substring(6);
                    jdbc.update("update collector.access_tokens set created_at=?,expires_at=? where token_hash=?",java.sql.Timestamp.from(clock.instant().minusSeconds(20)),java.sql.Timestamp.from(clock.instant().minusSeconds(1)),app.getBean(SecureAccountTokens.class).digest(expiredClientToken));
                    io.step(Map.of("action","client-expired-invitation","token",expiredClientToken));
                    io.step(Map.of("action","client-revoke"));
                    assertThat(jdbc.queryForObject("select count(*) from collector.client_sessions where workspace_id=? and revoked_at is null",Integer.class,workspace)).isZero();
                    io.step(Map.of("action","workspace-reload"));
                    clock.advance(331);io.step(Map.of("action","workspace-expired-access"));
                    // Isolated second tenant fixture; no T13 management/test-control HTTP endpoint is introduced.
                    var other=new UserAccount("other-browser-workspace@example.test","Other Synthetic Owner",app.getBean(PasswordEncoder.class).encode(password),clock.instant());other.markVerified(clock.instant());users.saveAndFlush(other);
                    var issued=app.getBean(AgencySessions.class).login(new LoginRequest(other.getEmailNormalized(),password));
                    var security=SecurityContextHolder.createEmptyContext();security.setAuthentication(new JwtAuthenticationToken(app.getBean(AccessTokens.class).decode(issued.accessToken()),List.of()));SecurityContextHolder.setContext(security);
                    UUID otherWorkspace;
                    try{otherWorkspace=app.getBean(WorkspaceService.class).create(new WorkspaceDtos.Create("Other private tenant","UTC",PlanKey.SOLO)).id();}finally{SecurityContextHolder.clearContext();}
                    io.step(Map.of("action","workspace-isolation","other",otherWorkspace.toString()));
                    jdbc.update("insert into collector.workspace_members(workspace_id,user_id,role) values (?,?,'MEMBER')",otherWorkspace,actor.getId());
                    io.step(Map.of("action","workspace-member","other",otherWorkspace.toString()));
                    jdbc.update("update collector.workspace_members set state='DISABLED',updated_at=now() where workspace_id=? and user_id=?",otherWorkspace,actor.getId());
                    io.step(Map.of("action","workspace-revoked","other",otherWorkspace.toString()));
                    io.step(Map.of("action","cross-tab-logout"));io.step(Map.of("action","storage"));io.step(Map.of("action","stop"));
                    return;
                }
                io.step(Map.of("action","csrf"));io.step(Map.of("action","cors"));io.step(Map.of("action","bootstrap"));
                var extra=app.getBean(AgencySessions.class).login(new LoginRequest(email,password));
                UUID extraId=UUID.fromString(app.getBean(AccessTokens.class).decode(extra.accessToken()).getClaimAsString("sid"));
                clock.advance(331);io.step(Map.of("action","expired-write","sessionId",extraId.toString()));
                clock.advance(331);io.step(Map.of("action","concurrent-refresh"));
                io.step(Map.of("action","logout"));io.step(Map.of("action","invalid-login"));io.step(Map.of("action","signin"));
                var secrets=app.getBean(SecureAccountTokens.class);String reset=secrets.generate();
                app.getBean(AccountTokenRepository.class).saveAndFlush(new AccountToken(users.findById(user.getId()).orElseThrow(),secrets.digest(reset),TokenPurpose.RESET_PASSWORD,clock.instant()));
                io.step(Map.of("action","reset","token",reset,"password",next));
                io.step(Map.of("action","signin"));io.step(Map.of("action","logout-all"));io.step(Map.of("action","signin"));
                clock.advance(8*86400);io.step(Map.of("action","expired-session"));io.step(Map.of("action","storage"));io.step(Map.of("action","stop"));
            }
        }
    }
    static final class BrowserProtocol implements AutoCloseable {
        private final Process process;private final BufferedWriter writer;private final BufferedReader reader;
        private final ExecutorService waiting=Executors.newSingleThreadExecutor();private final JsonMapper json=JsonMapper.builder().build();
        BrowserProtocol(Process process){this.process=process;writer=new BufferedWriter(new OutputStreamWriter(process.getOutputStream(),StandardCharsets.UTF_8));reader=new BufferedReader(new InputStreamReader(process.getInputStream(),StandardCharsets.UTF_8));}
        String step(Map<String,String> command) throws Exception {
            writer.write(json.writeValueAsString(command));writer.newLine();writer.flush();
            String line=waiting.submit((Callable<String>)reader::readLine).get(120,TimeUnit.SECONDS);
            assertThat(line).as("Browser process response for %s",command.get("action")).isNotNull();
            var result=json.readTree(line);assertThat(result.get("ok").asBoolean()).as("Browser stage %s (%s)",result.get("phase").asText(),result.get("kind").asText()+" "+result.get("http")).isTrue();
            System.out.println("PASS real HTTPS browser: "+command.get("action"));
            return result.path("origin").asText();
        }
        public void close() throws Exception {
            if(!process.waitFor(5,TimeUnit.SECONDS)){
                process.descendants().forEach(child->child.destroyForcibly());process.destroyForcibly();
            }
            waiting.shutdownNow();reader.close();writer.close();
        }
    }
}

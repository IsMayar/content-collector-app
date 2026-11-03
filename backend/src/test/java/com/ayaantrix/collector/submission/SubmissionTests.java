package com.ayaantrix.collector.submission;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.ayaantrix.collector.CollectorApplication;
import com.ayaantrix.collector.auth.dto.LoginRequest;
import com.ayaantrix.collector.auth.entity.UserAccount;
import com.ayaantrix.collector.auth.repository.UserAccountRepository;
import com.ayaantrix.collector.auth.security.*;
import com.ayaantrix.collector.auth.service.AgencySessions;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.web.RequestTraceFilter;
import com.ayaantrix.collector.project.dto.ProjectDtos.*;
import com.ayaantrix.collector.project.dto.ProjectStructureDtos.*;
import com.ayaantrix.collector.project.entity.*;
import com.ayaantrix.collector.project.repository.*;
import com.ayaantrix.collector.project.service.ProjectService;
import com.ayaantrix.collector.project.service.ProjectStructureService;
import com.ayaantrix.collector.template.entity.Template.ProjectType;
import com.ayaantrix.collector.template.seed.BuiltInTemplateSeeder;
import com.ayaantrix.collector.workspace.dto.WorkspaceDtos;
import com.ayaantrix.collector.workspace.entity.*;
import com.ayaantrix.collector.workspace.repository.WorkspaceMemberRepository;
import com.ayaantrix.collector.workspace.service.WorkspaceService;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.nio.file.Path;
import java.time.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;

@Testcontainers
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SubmissionTests {
    @Container
    static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer(
                    DockerImageName.parse(
                                    "public.ecr.aws/docker/library/postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873")
                            .asCompatibleSubstituteFor("postgres"));

    @TempDir static Path directory;
    static final Instant NOW = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS);

    static class TestClock extends Clock {
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        public Clock withZone(ZoneId zone) {
            return this;
        }

        volatile Instant time = NOW;

        public Instant instant() {
            return time;
        }
    }

    @org.springframework.boot.test.context.TestConfiguration(proxyBeanMethods = false)
    static class Configuration {
        @Bean
        @Primary
        TestClock projectClock() {
            return new TestClock();
        }

        @Bean
        @Primary
        AiFake aiFake() {
            return new AiFake();
        }

        @Bean
        @Primary
        SmsFake smsFake() {
            return new SmsFake();
        }

        @Bean
        @Primary
        ReminderMail reminderMail() {
            return new ReminderMail();
        }

        @Bean
        @Primary
        Mailbox teamMail() {
            return new Mailbox();
        }
    }

    static class AiFake implements com.ayaantrix.collector.ai.provider.AiDraftProvider {
        volatile String failure;
        volatile int calls;
        volatile int transientFailures;
        volatile boolean available = true;
        volatile Input received;

        public boolean available() {
            return available;
        }

        public Output generate(Input input, Duration remaining) {
            calls++;
            received = input;
            if (transientFailures-- > 0) throw new Failure("AI_RATE_LIMITED", true);
            if (failure != null) throw new Failure(failure, false);
            return new Output(
                    new com.ayaantrix.collector.ai.dto.AiDtos.Result(
                            String.join(" ", input.facts()), input.facts(), List.of(), List.of()),
                    100,
                    50);
        }
    }

    static class Mailbox implements com.ayaantrix.collector.auth.delivery.VerificationMailSender {
        final java.util.List<Message> messages = new java.util.concurrent.CopyOnWriteArrayList<>();
        public volatile boolean unknown = false;

        public void send(Message message) {
            if (unknown) throw new DeliveryFailure(true);
            messages.add(message);
        }
    }

    static final String PASSWORD = "synthetic template test password";
    static final String KEY = "website.plumber";
    static final UUID VERSION = BuiltInTemplateSeeder.versionId(KEY, 1);

    record Actor(UUID id, String access, Jwt jwt) {
        @Override
        public String toString() {
            return "SyntheticActor[redacted]";
        }
    }

    record Tenant(Actor actor, UUID workspace, UUID client) {
        String root() {
            return "/api/v1/workspaces/" + workspace;
        }
    }

    private com.ayaantrix.collector.attachment.StorageFixture exportStorage;
    private ConfigurableApplicationContext context;
    private SigningKeyFixture keys;
    private JdbcTemplate jdbc;
    private JsonMapper json;
    private MockMvc mvc;
    private String hash;

    static class SmsFake implements com.ayaantrix.collector.sms.provider.SmsSender {
        boolean enabled = false;
        final List<String> messages = new java.util.concurrent.CopyOnWriteArrayList<>();
        String outcome = "ACCEPTED";
        final Map<String, com.ayaantrix.collector.reminder.service.EmailSender.Receipt> receipts =
                new ConcurrentHashMap<>();
        final java.util.concurrent.atomic.AtomicInteger lookups =
                new java.util.concurrent.atomic.AtomicInteger();

        public Optional<com.ayaantrix.collector.reminder.service.EmailSender.Receipt> lookup(
                String id) {
            lookups.incrementAndGet();
            return Optional.ofNullable(receipts.get(id));
        }

        public boolean available() {
            return enabled;
        }

        public String scope() {
            return "MG" + "0".repeat(32);
        }

        public com.ayaantrix.collector.reminder.service.EmailSender.Result send(
                UUID id, String phone, String body) {
            messages.add(body);
            return new com.ayaantrix.collector.reminder.service.EmailSender.Result(
                    outcome,
                    outcome.equals("ACCEPTED")
                            ? "SM" + UUID.randomUUID().toString().replace("-", "")
                            : null,
                    null);
        }
    }

    static class ReminderMail implements com.ayaantrix.collector.reminder.service.EmailSender {
        java.util.List<Message> messages = new java.util.concurrent.CopyOnWriteArrayList<>();
        volatile String outcome = "ACCEPTED";
        final Map<String, Receipt> receipts = new ConcurrentHashMap<>();
        final java.util.concurrent.atomic.AtomicInteger lookups =
                new java.util.concurrent.atomic.AtomicInteger();
        volatile boolean lookupThrows;

        public Optional<Receipt> lookup(String id) {
            lookups.incrementAndGet();
            if (lookupThrows) throw new IllegalStateException("Synthetic lookup outage");
            return Optional.ofNullable(receipts.get(id));
        }

        public boolean available() {
            return true;
        }

        public Result send(Message m) {
            messages.add(m);
            return new Result(
                    outcome,
                    outcome.equals("ACCEPTED") ? UUID.randomUUID().toString() : null,
                    outcome.equals("ACCEPTED") ? null : "SYNTHETIC_FAILURE");
        }
    }

    @BeforeAll
    void start() throws Exception {
        exportStorage = new com.ayaantrix.collector.attachment.StorageFixture();
        exportStorage.start();
        keys = SigningKeyFixture.create(directory, "catalog-test");
        open();
        hash = context.getBean(PasswordEncoder.class).encode(PASSWORD);
    }

    ConfigurableApplicationContext start(String url) {
        var args =
                new java.util.ArrayList<String>(
                        java.util.List.of(
                                "--server.port=0",
                                "--spring.datasource.url=" + url,
                                "--spring.datasource.username=" + POSTGRES.getUsername(),
                                "--spring.datasource.password=" + POSTGRES.getPassword(),
                                "--collector.jwt.private-key=" + keys.privateFile(),
                                "--collector.jwt.public-keys=" + keys.publicFile(),
                                "--collector.jwt.key-id=" + keys.kid(),
                                "--collector.jwt.issuer=https://catalog.test",
                                "--collector.jwt.audience=collector-api",
                                "--collector.auth.token-hash-pepper="
                                        + Base64.getEncoder().encodeToString(new byte[32]),
                                "--AI_MODEL=synthetic-structured-fixture",
                                "--AI_INPUT_MICROUSD_PER_TOKEN=1",
                                "--AI_OUTPUT_MICROUSD_PER_TOKEN=2",
                                "--AI_MONTHLY_BUDGET_MICROUSD=10000000",
                                "--collector.workspace.trial-ai-drafts=20",
                                "--collector.delivery.worker-enabled=false",
                                "--collector.sms.segment-cost-microusd=100",
                                "--collector.sms.monthly-budget-microusd=100000",
                                "--collector.workspace.trial-sms-segments=25",
                                "--collector.sms.auth-token=synthetic-webhook-secret",
                                "--collector.sms.account-sid=AC" + "0".repeat(32),
                                "--collector.sms.messaging-service-sid=MG" + "0".repeat(32),
                                "--collector.sms.inbound-url=http://localhost/api/v1/webhooks/twilio/inbound",
                                "--collector.sms.status-url=http://localhost/api/v1/webhooks/twilio/status",
                                "--collector.reminders.webhook-secret=whsec_"
                                        + Base64.getEncoder().encodeToString(new byte[32]),
                                "--collector.reminders.webhook-url=http://localhost/api/v1/webhooks/email",
                                "--collector.delivery.encryption-key="
                                        + Base64.getEncoder().encodeToString(new byte[32])));
        args.addAll(java.util.List.of(exportStorage.args()));
        return new SpringApplicationBuilder(CollectorApplication.class, Configuration.class)
                .profiles("test")
                .run(args.toArray(String[]::new));
    }

    void open() {
        context = start(POSTGRES.getJdbcUrl());
        jdbc = context.getBean(JdbcTemplate.class);
        json = context.getBean(JsonMapper.class);
        mvc =
                MockMvcBuilders.webAppContextSetup((WebApplicationContext) context)
                        .apply(springSecurity())
                        .addFilters(context.getBean(RequestTraceFilter.class))
                        .build();
    }

    @AfterAll
    void stop() {
        if (context != null) context.close();
        if (exportStorage != null) exportStorage.close();
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
        jdbc.update(
                "update collector.reminder_deliveries set reconciliation_count=8 where"
                        + " state='UNKNOWN'");
        jdbc.update(
                "update collector.sms_verifications set reconciliation_count=8 where"
                        + " state='UNKNOWN'");
        context.getBean(ReminderMail.class).receipts.clear();
        context.getBean(ReminderMail.class).lookups.set(0);
        context.getBean(ReminderMail.class).lookupThrows = false;
        context.getBean(SmsFake.class).receipts.clear();
        context.getBean(SmsFake.class).lookups.set(0);

        jdbc.update(
                "delete from collector.sms_destinations where sender_scope=?",
                context.getBean(SmsFake.class).scope());
        jdbc.update("delete from collector.account_request_limits where operation like 'SMS_%'");
        jdbc.update(
                "update collector.sms_verifications set state='REVOKED',encrypted_payload=null"
                        + " where state in ('QUEUED','SENDING','SENT')");
        context.getBean(SmsFake.class).enabled = false;
        context.getBean(SmsFake.class).messages.clear();
        context.getBean(SmsFake.class).outcome = "ACCEPTED";
        context.getBean(ReminderMail.class).messages.clear();
        context.getBean(ReminderMail.class).outcome = "ACCEPTED";
        jdbc.update(
                "update collector.reminder_deliveries set"
                        + " state='CANCELLED',lease_id=null,lease_until=null where state in"
                        + " ('QUEUED','SENDING')");
        var fake = context.getBean(AiFake.class);
        fake.failure = null;
        fake.calls = 0;
        fake.transientFailures = 0;
        fake.available = true;
        context.getBean(TestClock.class).time = NOW;
        jdbc.update(
                "update collector.ai_draft_jobs set state='FAILED',failure_code='TEST_END' where"
                        + " state='QUEUED'");
        jdbc.update(
                "update collector.export_jobs set state='CANCELLED',lease_id=null,lease_until=null"
                        + " where state in ('QUEUED','RUNNING')");
    }

    Actor actor() {
        String email = "catalog-" + UUID.randomUUID() + "@example.test";
        var user = new UserAccount(email, "Synthetic User", hash, NOW);
        user.markVerified(NOW);
        context.getBean(UserAccountRepository.class).saveAndFlush(user);
        var issued = context.getBean(AgencySessions.class).login(new LoginRequest(email, PASSWORD));
        return new Actor(
                user.getId(),
                issued.accessToken(),
                context.getBean(AccessTokens.class).decode(issued.accessToken()));
    }

    <T> T as(Actor actor, Supplier<T> operation) {
        var previous = SecurityContextHolder.getContext();
        var security = SecurityContextHolder.createEmptyContext();
        security.setAuthentication(new JwtAuthenticationToken(actor.jwt(), List.of()));
        SecurityContextHolder.setContext(security);
        try {
            return operation.get();
        } finally {
            SecurityContextHolder.setContext(previous);
        }
    }

    Tenant tenant() {
        var a = actor();
        UUID w =
                as(
                                a,
                                () ->
                                        context.getBean(WorkspaceService.class)
                                                .create(
                                                        new WorkspaceDtos.Create(
                                                                "Project studio",
                                                                "UTC",
                                                                PlanKey.AGENCY)))
                        .id();
        UUID client =
                as(
                                a,
                                () ->
                                        service()
                                                .createCustomer(
                                                        w,
                                                        new CustomerCreate(
                                                                "Synthetic customer", null, null)))
                        .id();
        return new Tenant(a, w, client);
    }

    BuiltInTemplateSeeder seed() {
        return context.getBean(BuiltInTemplateSeeder.class);
    }

    ProjectService service() {
        return context.getBean(ProjectService.class);
    }

    String bearer(Tenant t) {
        return "Bearer " + t.actor().access();
    }

    TransactionTemplate tx() {
        return new TransactionTemplate(context.getBean(PlatformTransactionManager.class));
    }

    Create input(Tenant t, ProjectType type) {
        String key =
                switch (type) {
                    case WEBSITE -> "website.plumber";
                    case WEB_APP -> "web_app.starter";
                    case MOBILE_APP -> "mobile_app.starter";
                };
        return new Create(
                t.client(),
                "Synthetic " + type,
                type,
                LocalDate.of(2026, 12, 20),
                "Asia/Kabul",
                BuiltInTemplateSeeder.versionId(key, 1));
    }

    View create(Tenant t, ProjectType type) {
        return as(
                t.actor(),
                () ->
                        service()
                                .create(
                                        t.workspace(),
                                        input(t, type),
                                        UUID.randomUUID().toString()));
    }

    org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder postProject(
            Tenant t, Object body, String key) {
        return post(t.root() + "/projects")
                .with(csrf().asHeader())
                .header("Authorization", bearer(t))
                .header("Idempotency-Key", key)
                .contentType("application/json")
                .content(json.writeValueAsString(body));
    }

    long count(Tenant t, String table) {
        return jdbc.queryForObject(
                "select count(*) from collector." + table + " where workspace_id=?",
                Long.class,
                t.workspace());
    }

    ProjectStructureService editor() {
        return context.getBean(ProjectStructureService.class);
    }

    Detail detail(Tenant t, View p) {
        return as(t.actor(), () -> service().read(t.workspace(), p.id()));
    }

    UUID id(JsonNode n) {
        return UUID.fromString(n.get("id").asText());
    }

    ObjectNode definition(JsonNode n) {
        return ProjectStructureRepository.definition(n);
    }

    ObjectNode field(String key, String type) {
        var n =
                json.createObjectNode()
                        .put("key", key)
                        .put("label", "Synthetic field")
                        .put("type", type)
                        .put("instructions", "")
                        .put("example", "")
                        .put("required", true)
                        .put("enabled", true);
        var v = n.putObject("validation");
        switch (type) {
            case "SHORT_TEXT" -> v.put("maxLength", 200);
            case "LONG_TEXT" -> v.put("minLength", 2).put("maxLength", 10000);
            case "URL" -> v.putArray("allowedSchemes").add("https").add("http");
            case "SINGLE_SELECT", "MULTI_SELECT" -> {
                v.putArray("options").addObject().put("key", "yes").put("label", "Yes");
                if (type.equals("MULTI_SELECT")) v.put("minOptions", 0).put("maxOptions", 1);
            }
            case "IMAGE", "FILE" -> {
                v.put("minFiles", 0).put("maxFiles", 10);
                v.putArray("allowedExtensions").add("png");
            }
            case "REPEATER" -> {
                v.put("maxRows", 20);
                var a = v.putArray("columns");
                for (String ct :
                        List.of(
                                "SHORT_TEXT",
                                "LONG_TEXT",
                                "URL",
                                "NUMBER",
                                "SINGLE_SELECT",
                                "IMAGE")) {
                    var c =
                            a.addObject()
                                    .put("key", ct.toLowerCase())
                                    .put("label", ct)
                                    .put("type", ct)
                                    .put("required", true);
                    if (ct.equals("SINGLE_SELECT"))
                        c.putArray("options").addObject().put("key", "yes").put("label", "Yes");
                }
            }
        }
        return n;
    }

    JsonNode add(Tenant t, View p, UUID section, ObjectNode field) {
        long v = detail(t, p).project().structureVersion();
        return as(
                t.actor(),
                () ->
                        editor().createItem(
                                        t.workspace(), p.id(), section, new ItemCreate(field, v)));
    }

    UUID emptySection(Tenant t, View p) {
        long v = detail(t, p).project().structureVersion();
        return id(
                as(
                        t.actor(),
                        () ->
                                editor().createSection(
                                                t.workspace(),
                                                p.id(),
                                                new SectionCreate(null, "New section", v))));
    }

    Reorder ordering(Detail d) {
        var sections = new ArrayList<UUID>();
        var items = new LinkedHashMap<UUID, List<UUID>>();
        for (var s : d.structure()) {
            sections.add(id(s));
            var order = new ArrayList<UUID>();
            for (var i : s.get("items")) order.add(id(i));
            items.put(id(s), order);
        }
        return new Reorder(sections, items, d.project().structureVersion());
    }

    org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder write(
            Tenant t, View p, String method, String suffix, Object body) {
        return request(
                        org.springframework.http.HttpMethod.valueOf(method),
                        t.root() + "/projects/" + p.id() + suffix)
                .with(csrf().asHeader())
                .header("Authorization", bearer(t))
                .contentType("application/json")
                .content(json.writeValueAsString(body));
    }

    void rejected(Tenant t, View p, Runnable operation, String code) {
        var before = detail(t, p);
        long logs = count(t, "audit_logs");
        assertThatThrownBy(operation::run)
                .isInstanceOfSatisfying(
                        ApiException.class, e -> assertThat(e.getCode()).isEqualTo(code));
        assertThat(detail(t, p)).isEqualTo(before);
        assertThat(count(t, "audit_logs")).isEqualTo(logs);
    }

    com.ayaantrix.collector.clientaccess.service.ClientAccessService access() {
        return context.getBean(
                com.ayaantrix.collector.clientaccess.service.ClientAccessService.class);
    }

    com.ayaantrix.collector.clientaccess.service.ClientPortalService portal() {
        return context.getBean(
                com.ayaantrix.collector.clientaccess.service.ClientPortalService.class);
    }

    record Fixture(Tenant tenant, View project, UUID contact) {
        String path() {
            return tenant.root() + "/projects/" + project.id() + "/contacts/" + contact;
        }
    }

    Fixture fixture() {
        return fixture(ProjectType.WEBSITE);
    }

    Fixture fixture(ProjectType type) {
        var t = tenant();
        var p = create(t, type);
        jdbc.update("update collector.projects set state='ACTIVE' where id=?", p.id());
        var c =
                as(
                        t.actor(),
                        () ->
                                context.getBean(
                                                com.ayaantrix.collector.project.service
                                                        .ProjectClientService.class)
                                        .createContact(
                                                t.workspace(),
                                                p.id(),
                                                new com.ayaantrix.collector.project.dto
                                                        .ProjectClientDtos.ContactCreate(
                                                        t.client(),
                                                        "Synthetic Client",
                                                        "client-"
                                                                + UUID.randomUUID()
                                                                + "@example.test",
                                                        NOW.plus(Duration.ofDays(90)))));
        return new Fixture(t, p, c.id());
    }

    com.ayaantrix.collector.clientaccess.dto.ClientAccessDtos.Invitation invite(Fixture f) {
        return as(
                f.tenant().actor(),
                () ->
                        access().invite(
                                        f.tenant().workspace(),
                                        f.project().id(),
                                        f.contact(),
                                        UUID.randomUUID().toString(),
                                        "client-test"));
    }

    String raw(UUID id) {
        var row =
                jdbc.queryForMap(
                        "select id,encrypted_payload,encryption_key_id from collector.outbox_jobs"
                                + " where payload_json->>'tokenId'=?",
                        id.toString());
        return context.getBean(com.ayaantrix.collector.auth.delivery.TokenDeliveryCipher.class)
                .decrypt(
                        (byte[]) row.get("encrypted_payload"),
                        (String) row.get("encryption_key_id"),
                        (UUID) row.get("id"),
                        id);
    }

    com.ayaantrix.collector.clientaccess.dto.ClientAccessDtos.Exchange input(String token) {
        return new com.ayaantrix.collector.clientaccess.dto.ClientAccessDtos.Exchange(token);
    }

    com.ayaantrix.collector.clientaccess.dto.ClientAccessDtos.Issued enter(Fixture f) {
        return access().exchange(input(raw(invite(f).id())), null);
    }

    String cookieName() {
        return "__Secure-collector_client";
    }

    org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder checklist(
            Fixture f, String cookie) {
        var request = get("/api/v1/client/projects/" + f.project().id() + "/checklist");
        return cookie == null
                ? request
                : request.cookie(new jakarta.servlet.http.Cookie(cookieName(), cookie));
    }

    com.ayaantrix.collector.collection.service.ClientAnswerService drafts() {
        return context.getBean(
                com.ayaantrix.collector.collection.service.ClientAnswerService.class);
    }

    UUID textItem(Fixture f) {
        return id(detail(f.tenant(), f.project()).structure().getFirst().path("items").get(0));
    }

    com.ayaantrix.collector.collection.dto.ClientAnswerDtos.Save saveCommand(
            JsonNode value, long version, long structure) {
        return new com.ayaantrix.collector.collection.dto.ClientAnswerDtos.Save(
                value, version, structure, UUID.randomUUID());
    }

    com.ayaantrix.collector.collection.dto.ClientAnswerDtos.Saved save(
            Fixture f, String cookie, UUID item, JsonNode value, long version) {
        return drafts().save(
                        cookie,
                        f.project().id(),
                        item,
                        saveCommand(
                                value,
                                version,
                                detail(f.tenant(), f.project()).project().structureVersion()));
    }

    JsonNode text(String value) {
        return json.createObjectNode().put("text", value);
    }

    com.ayaantrix.collector.submission.service.SubmissionService submissions() {
        return context.getBean(com.ayaantrix.collector.submission.service.SubmissionService.class);
    }

    com.ayaantrix.collector.submission.dto.SubmissionDtos.Submit submitCommand(
            Fixture f, long version) {
        return new com.ayaantrix.collector.submission.dto.SubmissionDtos.Submit(
                version, detail(f.tenant(), f.project()).project().structureVersion());
    }

    com.ayaantrix.collector.submission.dto.SubmissionDtos.Submitted submit(
            Fixture f, String c, UUID i, long version, String key) {
        return submissions().submit(c, f.project().id(), i, submitCommand(f, version), key);
    }

    void code(Runnable run, String expected) {
        assertThatThrownBy(run::run)
                .isInstanceOfSatisfying(
                        ApiException.class, e -> assertThat(e.getCode()).isEqualTo(expected));
    }

    com.ayaantrix.collector.analytics.service.InteractionService interactions() {
        return context.getBean(com.ayaantrix.collector.analytics.service.InteractionService.class);
    }

    JsonNode interaction(String type, UUID item, UUID event) {
        var body = json.createObjectNode();
        var e =
                body.putArray("events")
                        .addObject()
                        .put("clientEventId", event.toString())
                        .put("type", type);
        if (item != null) e.put("itemId", item.toString());
        return body;
    }

    long eventCount(Fixture f) {
        return jdbc.queryForObject(
                "select count(*) from collector.analytics_events where project_id=?",
                Long.class,
                f.project().id());
    }

    com.ayaantrix.collector.analytics.service.AnalyticsService friction() {
        return context.getBean(com.ayaantrix.collector.analytics.service.AnalyticsService.class);
    }

    void startObservation(Fixture f, UUID item, Instant start) {
        jdbc.update(
                """
                insert into collector.analytics_events(id,workspace_id,project_id,template_version_id,session_pseudonym,client_event_id,event_type,item_id,item_key,received_at)
                select ?,p.workspace_id,p.id,p.source_template_version_id,?,?,'item_started',i.id,i.item_key,? from collector.projects p join collector.items i on i.workspace_id=p.workspace_id and i.project_id=p.id where p.id=? and i.id=?
                """,
                UUID.randomUUID(),
                com.ayaantrix.collector.common.repository.IdempotencyRepository.hash(
                        UUID.randomUUID().toString()),
                UUID.randomUUID(),
                java.sql.Timestamp.from(start),
                f.project().id(),
                item);
    }

    @Test
    void frictionLiveProgressAndImmutableFirstSubmission() throws Exception {
        var f = fixture();
        var c = enter(f).credential();
        var i = textItem(f);
        startObservation(f, i, NOW.minus(Duration.ofDays(8)));
        save(f, c, i, text("Private immutable answer"), 0);
        submit(f, c, i, 1, "friction-first");
        var history =
                jdbc.queryForList(
                        "select value_snapshot::text from collector.submission_revisions where"
                            + " project_id=?",
                        String.class,
                        f.project().id());
        var result =
                as(
                        f.tenant().actor(),
                        () -> friction().project(f.tenant().workspace(), f.project().id()));
        var m = result.friction().getFirst();
        assertThat(m.eligibleStarts()).isEqualTo(1);
        assertThat(m.completedObservationWindows()).isEqualTo(1);
        assertThat(m.startsWithoutSubmission()).isEqualTo(1);
        assertThat(m.rate()).isNull();
        assertThat(m.medianFirstSubmissionSeconds()).isEqualTo(691200.0);
        assertThat(result.progress().submittedRequired()).isEqualTo(1);
        assertThat(json.writeValueAsString(result))
                .doesNotContain(
                        "Private immutable answer", c, "value_snapshot", "session_pseudonym");
        assertThat(
                        jdbc.queryForList(
                                "select value_snapshot::text from collector.submission_revisions"
                                    + " where project_id=?",
                                String.class,
                                f.project().id()))
                .isEqualTo(history);
        mvc.perform(
                        get(f.tenant().root() + "/projects/" + f.project().id() + "/analytics")
                                .secure(true)
                                .header("Authorization", bearer(f.tenant())))
                .andExpect(status().isOk())
                .andExpect(header().exists("X-Request-ID"))
                .andExpect(jsonPath("$.metrics.friction[0].rate").isEmpty());
    }

    @Test
    void frictionCountsOpenWindowsExclusionsAndEmptyProgress() {
        var f = fixture();
        var i = textItem(f);
        for (int n = 0; n < 10; n++) startObservation(f, i, NOW.minus(Duration.ofDays(8)));
        startObservation(f, i, NOW.minusSeconds(1));
        var m =
                as(
                                f.tenant().actor(),
                                () -> friction().project(f.tenant().workspace(), f.project().id()))
                        .friction()
                        .getFirst();
        assertThat(m.completedObservationWindows()).isEqualTo(10);
        assertThat(m.eligibleStarts()).isEqualTo(11);
        assertThat(m.rate()).isEqualTo(1.0);
        var templates = as(f.tenant().actor(), () -> friction().templates(f.tenant().workspace()));
        assertThat(templates).hasSize(1);
        assertThat(templates.getFirst().projectType()).isEqualTo("WEBSITE");
        jdbc.update(
                "update collector.projects set analytics_excluded=true where id=?",
                f.project().id());
        assertThat(as(f.tenant().actor(), () -> friction().templates(f.tenant().workspace())))
                .isEmpty();
        jdbc.update(
                "update collector.items set enabled=false where project_id=?", f.project().id());
        assertThat(
                        as(
                                        f.tenant().actor(),
                                        () ->
                                                friction()
                                                        .project(
                                                                f.tenant().workspace(),
                                                                f.project().id()))
                                .progress()
                                .requiredTotal())
                .isZero();
    }

    @Test
    void frictionAuthorizationRemainsLiveAndTemplateComparisonsOwnerOnly() throws Exception {
        var f = fixture();
        var other = fixture();
        code(
                () ->
                        as(
                                other.tenant().actor(),
                                () -> friction().project(f.tenant().workspace(), f.project().id())),
                "NOT_FOUND");
        var actor = actor();
        var member =
                new WorkspaceMember(f.tenant().workspace(), actor.id(), WorkspaceRole.MEMBER, NOW);
        context.getBean(WorkspaceMemberRepository.class).saveAndFlush(member);
        code(
                () -> as(actor, () -> friction().project(f.tenant().workspace(), f.project().id())),
                "NOT_FOUND");
        jdbc.update(
                "insert into"
                    + " collector.project_members(workspace_id,project_id,workspace_member_id,can_review,can_export,created_at,updated_at)"
                    + " values(?,?,?,false,false,?,?)",
                f.tenant().workspace(),
                f.project().id(),
                member.id(),
                java.sql.Timestamp.from(NOW),
                java.sql.Timestamp.from(NOW));
        assertThat(as(actor, () -> friction().project(f.tenant().workspace(), f.project().id())))
                .isNotNull();
        code(() -> as(actor, () -> friction().templates(f.tenant().workspace())), "ACCESS_DENIED");
        jdbc.update(
                "delete from collector.project_members where workspace_member_id=?", member.id());
        code(
                () -> as(actor, () -> friction().project(f.tenant().workspace(), f.project().id())),
                "NOT_FOUND");
        var c = enter(f).credential();
        mvc.perform(
                        get(f.tenant().root() + "/analytics/templates")
                                .secure(true)
                                .cookie(new jakarta.servlet.http.Cookie(cookieName(), c)))
                .andExpect(status().isForbidden());
        as(
                f.tenant().actor(),
                () -> {
                    context.getBean(AgencySessions.class).logoutAll(f.tenant().actor().jwt());
                    return null;
                });
        code(
                () ->
                        as(
                                f.tenant().actor(),
                                () -> friction().project(f.tenant().workspace(), f.project().id())),
                "INVALID_CREDENTIALS");
    }

    @Test
    void analyticsMinimalEventsDeduplicateWithoutChangingAnswers() {
        var f = fixture();
        var c = enter(f).credential();
        var i = textItem(f);
        var id = UUID.randomUUID();
        var body = interaction("item_started", i, id);
        assertThat(interactions().record(c, f.project().id(), body)).containsEntry("accepted", 1);
        assertThat(interactions().record(c, f.project().id(), body)).containsEntry("accepted", 0);
        assertThat(
                        interactions()
                                .record(
                                        c,
                                        f.project().id(),
                                        interaction("item_started", i, UUID.randomUUID())))
                .containsEntry("accepted", 0);
        assertThat(
                        interactions()
                                .record(
                                        c,
                                        f.project().id(),
                                        interaction("project_opened", null, UUID.randomUUID())))
                .containsEntry("accepted", 1);
        var row =
                jdbc.queryForMap(
                        "select * from collector.analytics_events where project_id=? and item_id=?",
                        f.project().id(),
                        i);
        assertThat(row.get("template_version_id"))
                .isEqualTo(
                        jdbc.queryForObject(
                                "select source_template_version_id from collector.projects where"
                                        + " id=?",
                                UUID.class,
                                f.project().id()));
        assertThat(row.get("item_key")).isNotNull();
        assertThat(row.get("session_pseudonym").toString().trim())
                .hasSize(64)
                .isNotEqualTo(c)
                .isNotEqualTo(context.getBean(SecureAccountTokens.class).digest(c));
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from collector.answers where project_id=?",
                                Long.class,
                                f.project().id()))
                .isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"text", "token", "referrer", "phone"})
    void analyticsRejectsExtraContentAndNeverStoresIt(String field) throws Exception {
        var f = fixture();
        var c = enter(f).credential();
        var body = interaction("project_opened", null, UUID.randomUUID());
        ((ObjectNode) body.path("events").get(0)).put(field, "PRIVATE-CONTENT");
        mvc.perform(
                        post("/api/v1/client/projects/" + f.project().id() + "/events")
                                .secure(true)
                                .with(csrf())
                                .cookie(new jakarta.servlet.http.Cookie(cookieName(), c))
                                .contentType("application/json")
                                .content(body.toString()))
                .andExpect(status().isBadRequest())
                .andExpect(header().exists("X-Request-ID"));
        assertThat(eventCount(f)).isZero();
    }

    @Test
    void analyticsRejectsInvalidBatchAtomicallyAndHiddenItem() {
        var f = fixture();
        var c = enter(f).credential();
        var i = textItem(f);
        var body = interaction("project_opened", null, UUID.randomUUID());
        ((tools.jackson.databind.node.ArrayNode) body.path("events"))
                .addObject()
                .put("clientEventId", UUID.randomUUID().toString())
                .put("type", "answer_saved");
        code(() -> interactions().record(c, f.project().id(), body), "INVALID_INTERACTION_EVENT");
        assertThat(eventCount(f)).isZero();
        jdbc.update("update collector.items set enabled=false where id=?", i);
        code(
                () ->
                        interactions()
                                .record(
                                        c,
                                        f.project().id(),
                                        interaction("item_started", i, UUID.randomUUID())),
                "NOT_FOUND");
        assertThat(eventCount(f)).isZero();
    }

    @Test
    void analyticsSessionIsolationExclusionAndReceiveTime() {
        var f = fixture();
        var c = enter(f).credential();
        var body = interaction("project_opened", null, UUID.randomUUID());
        ((ObjectNode) body.path("events").get(0)).put("occurredAt", "2001-01-01T00:00:00Z");
        interactions().record(c, f.project().id(), body);
        assertThat(
                        jdbc.queryForObject(
                                        "select received_at from collector.analytics_events where"
                                                + " project_id=?",
                                        java.sql.Timestamp.class,
                                        f.project().id())
                                .toInstant())
                .isEqualTo(NOW);
        var next = enter(f).credential();
        assertThat(interactions().record(next, f.project().id(), body))
                .containsEntry("accepted", 1);
        jdbc.update(
                "update collector.projects set analytics_excluded=true where id=?",
                f.project().id());
        assertThat(
                        interactions()
                                .record(
                                        c,
                                        f.project().id(),
                                        interaction(
                                                "item_started", textItem(f), UUID.randomUUID())))
                .containsEntry("accepted", 0);
        assertThat(eventCount(f)).isEqualTo(2);
    }

    @Test
    void analyticsAuthorizationCsrfAndTenantBinding() throws Exception {
        var f = fixture();
        var c = enter(f).credential();
        var other = fixture();
        var body = interaction("project_opened", null, UUID.randomUUID()).toString();
        var path = "/api/v1/client/projects/" + f.project().id() + "/events";
        mvc.perform(
                        post(path)
                                .secure(true)
                                .cookie(new jakarta.servlet.http.Cookie(cookieName(), c))
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isForbidden());
        mvc.perform(
                        post(path)
                                .secure(true)
                                .with(csrf())
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isUnauthorized());
        code(
                () -> interactions().record(c, other.project().id(), json.readTree(body)),
                "NOT_FOUND");
        jdbc.update(
                "update collector.client_sessions set revoked_at=now() where project_id=?",
                f.project().id());
        code(
                () -> interactions().record(c, f.project().id(), json.readTree(body)),
                "CLIENT_ACCESS_UNAVAILABLE");
        assertThat(eventCount(f)).isZero();
    }

    @Test
    void analyticsConcurrentStartsAndRetention() throws Exception {
        var f = fixture();
        var c = enter(f).credential();
        var i = textItem(f);
        var pool = Executors.newFixedThreadPool(2);
        try {
            var start = new CountDownLatch(1);
            var work =
                    (java.util.concurrent.Callable<Integer>)
                            () -> {
                                start.await();
                                return interactions()
                                        .record(
                                                c,
                                                f.project().id(),
                                                interaction("item_started", i, UUID.randomUUID()))
                                        .get("accepted");
                            };
            var a = pool.submit(work);
            var b = pool.submit(work);
            start.countDown();
            assertThat(a.get(30, TimeUnit.SECONDS) + b.get(30, TimeUnit.SECONDS)).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
        jdbc.update(
                "update collector.analytics_events set received_at=? where project_id=?",
                java.sql.Timestamp.from(NOW.minus(Duration.ofDays(91))),
                f.project().id());
        context.getBean(com.ayaantrix.collector.analytics.worker.InteractionRetention.class)
                .purge();
        assertThat(eventCount(f)).isZero();
    }

    @Test
    void analyticsActivityPermissionRevocationIsLive() {
        var f = fixture();
        var actor = actor();
        var member =
                new WorkspaceMember(f.tenant().workspace(), actor.id(), WorkspaceRole.MEMBER, NOW);
        context.getBean(WorkspaceMemberRepository.class).saveAndFlush(member);
        var service =
                context.getBean(com.ayaantrix.collector.analytics.service.ActivityService.class);
        code(
                () ->
                        as(
                                actor,
                                () ->
                                        service.read(
                                                f.tenant().workspace(), f.project().id(), 0, 20)),
                "NOT_FOUND");
        jdbc.update(
                "insert into"
                    + " collector.project_members(workspace_id,project_id,workspace_member_id,can_review,can_export,created_at,updated_at)"
                    + " values(?,?,?,false,false,?,?)",
                f.tenant().workspace(),
                f.project().id(),
                member.id(),
                java.sql.Timestamp.from(NOW),
                java.sql.Timestamp.from(NOW));
        assertThat(as(actor, () -> service.read(f.tenant().workspace(), f.project().id(), 0, 20)))
                .isNotNull();
        jdbc.update(
                "delete from collector.project_members where workspace_member_id=?", member.id());
        code(
                () ->
                        as(
                                actor,
                                () ->
                                        service.read(
                                                f.tenant().workspace(), f.project().id(), 0, 20)),
                "NOT_FOUND");
        jdbc.update(
                "update collector.workspace_members set state='DISABLED' where id=?", member.id());
        code(
                () ->
                        as(
                                actor,
                                () ->
                                        service.read(
                                                f.tenant().workspace(), f.project().id(), 0, 20)),
                "NOT_FOUND");
    }

    @Test
    void analyticsActivityIsScopedPaginatedAndContentFree() throws Exception {
        var f = fixture();
        var c = enter(f).credential();
        save(f, c, textItem(f), text("PRIVATE-ANSWER"), 0);
        var service =
                context.getBean(com.ayaantrix.collector.analytics.service.ActivityService.class);
        var view =
                as(
                        f.tenant().actor(),
                        () -> service.read(f.tenant().workspace(), f.project().id(), 0, 1));
        assertThat(view.data()).hasSize(1);
        assertThat(view.page().totalElements()).isPositive();
        assertThat(json.writeValueAsString(view))
                .doesNotContain("PRIVATE-ANSWER", c, "metadata_json", "email");
        var other = fixture();
        code(
                () ->
                        as(
                                other.tenant().actor(),
                                () ->
                                        service.read(
                                                f.tenant().workspace(), f.project().id(), 0, 20)),
                "NOT_FOUND");
        code(
                () ->
                        as(
                                f.tenant().actor(),
                                () ->
                                        service.read(
                                                f.tenant().workspace(), f.project().id(), -1, 20)),
                "INVALID_PAGE");
        mvc.perform(
                        get(f.tenant().root() + "/projects/" + f.project().id() + "/activity")
                                .secure(true)
                                .cookie(new jakarta.servlet.http.Cookie(cookieName(), c)))
                .andExpect(status().isForbidden());
    }

    @Test
    void immutableHistoryWithdrawResubmitAndRestart() {
        var f = fixture();
        var c = enter(f).credential();
        var i = textItem(f);
        save(f, c, i, text("Original"), 0);
        var r = submit(f, c, i, 1, "first");
        assertThat(r.revisionNo()).isEqualTo(1);
        var before =
                as(
                        f.tenant().actor(),
                        () ->
                                submissions()
                                        .detail(
                                                f.tenant().workspace(),
                                                f.project().id(),
                                                i,
                                                r.revisionId()));
        code(() -> save(f, c, i, text("Forbidden"), 1), "READ_ONLY");
        submissions()
                .withdraw(
                        c,
                        f.project().id(),
                        i,
                        new com.ayaantrix.collector.submission.dto.SubmissionDtos.Withdraw(
                                r.itemVersion()),
                        "withdraw");
        save(f, c, i, text("Updated"), 1);
        var r2 = submit(f, c, i, 2, "second");
        assertThat(r2.revisionNo()).isEqualTo(2);
        assertThat(
                        as(
                                f.tenant().actor(),
                                () ->
                                        submissions()
                                                .detail(
                                                        f.tenant().workspace(),
                                                        f.project().id(),
                                                        i,
                                                        r.revisionId())))
                .isEqualTo(before);
        assertThatThrownBy(
                        () ->
                                jdbc.update(
                                        "update collector.submission_revisions set revision_no=20"
                                                + " where id=?",
                                        r.revisionId()))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(
                        () ->
                                jdbc.update(
                                        "delete from collector.submission_revisions where id=?",
                                        r.revisionId()))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        context.close();
        open();
        assertThat(
                        as(
                                f.tenant().actor(),
                                () ->
                                        submissions()
                                                .detail(
                                                        f.tenant().workspace(),
                                                        f.project().id(),
                                                        i,
                                                        r.revisionId())))
                .isEqualTo(before);
    }

    @Test
    void duplicateIdempotencyAndChangedInput() {
        var f = fixture();
        String c = enter(f).credential();
        var i = textItem(f);
        save(f, c, i, text("Ready"), 0);
        var cmd = submitCommand(f, 1);
        var a = submissions().submit(c, f.project().id(), i, cmd, "same");
        assertThat(submissions().submit(c, f.project().id(), i, cmd, "same")).isEqualTo(a);
        code(
                () -> submissions().submit(c, f.project().id(), i, submitCommand(f, 0), "same"),
                "IDEMPOTENCY_KEY_REUSED");
        assertThat(count(f.tenant(), "submission_revisions")).isEqualTo(1);
    }

    @Test
    void missingRequiredAndStaleVersionsRollBack() {
        var f = fixture();
        String c = enter(f).credential();
        var i = textItem(f);
        code(() -> submit(f, c, i, 0, "missing"), "SUBMISSION_VALIDATION_FAILED");
        save(f, c, i, text("Ready"), 0);
        code(() -> submit(f, c, i, 0, "stale"), "ANSWER_VERSION_CONFLICT");
        code(
                () ->
                        submissions()
                                .submit(
                                        c,
                                        f.project().id(),
                                        i,
                                        new com.ayaantrix.collector.submission.dto.SubmissionDtos
                                                .Submit(1, 99),
                                        "structure"),
                "STRUCTURE_CONFLICT");
        assertThat(count(f.tenant(), "submission_revisions")).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"PAUSED", "COMPLETED", "ARCHIVED", "DRAFT", "DELETION_PENDING"})
    void readonlyProjectsCannotSubmit(String state) {
        var f = fixture();
        String c = enter(f).credential();
        var i = textItem(f);
        save(f, c, i, text("Ready"), 0);
        jdbc.update("update collector.projects set state=? where id=?", state, f.project().id());
        assertThatThrownBy(() -> submit(f, c, i, 1, "closed")).isInstanceOf(ApiException.class);
        assertThat(count(f.tenant(), "submission_revisions")).isZero();
    }

    @Test
    void submissionSerializesConcurrentWriters() throws Exception {
        var f = fixture();
        String c = enter(f).credential();
        var i = textItem(f);
        save(f, c, i, text("Ready"), 0);
        var cmd = submitCommand(f, 1);
        var gate = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a =
                    pool.submit(
                            () -> {
                                gate.await();
                                try {
                                    submissions().submit(c, f.project().id(), i, cmd, "a");
                                    return 201;
                                } catch (ApiException e) {
                                    return e.getStatus().value();
                                }
                            });
            var b =
                    pool.submit(
                            () -> {
                                gate.await();
                                try {
                                    submissions().submit(c, f.project().id(), i, cmd, "b");
                                    return 201;
                                } catch (ApiException e) {
                                    return e.getStatus().value();
                                }
                            });
            gate.countDown();
            assertThat(List.of(a.get(20, TimeUnit.SECONDS), b.get(20, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(201, 409);
        }
        assertThat(count(f.tenant(), "submission_revisions")).isEqualTo(1);
    }

    @Test
    void csrfCookieCorrelationAndScopedAgencyReads() throws Exception {
        var f = fixture();
        String c = enter(f).credential();
        var i = textItem(f);
        save(f, c, i, text("Ready"), 0);
        String path = "/api/v1/client/projects/" + f.project().id() + "/items/" + i + "/submit";
        var cmd = submitCommand(f, 1);
        mvc.perform(
                        post(path)
                                .cookie(new jakarta.servlet.http.Cookie(cookieName(), c))
                                .header("Idempotency-Key", "http")
                                .contentType("application/json")
                                .content(json.writeValueAsString(cmd)))
                .andExpect(status().isForbidden());
        mvc.perform(
                        post(path)
                                .with(csrf().asHeader())
                                .header("Idempotency-Key", "http")
                                .contentType("application/json")
                                .content(json.writeValueAsString(cmd)))
                .andExpect(status().isUnauthorized());
        mvc.perform(
                        post(path)
                                .with(csrf().asHeader())
                                .cookie(new jakarta.servlet.http.Cookie(cookieName(), c))
                                .header("Idempotency-Key", "http")
                                .header("X-Request-ID", "submission-contract")
                                .contentType("application/json")
                                .content(json.writeValueAsString(cmd)))
                .andExpect(status().isCreated())
                .andExpect(header().string("X-Request-ID", "submission-contract"))
                .andExpect(header().string("Cache-Control", "no-store"));
        var other = fixture();
        assertThatThrownBy(
                        () ->
                                as(
                                        other.tenant().actor(),
                                        () ->
                                                submissions()
                                                        .queue(
                                                                f.tenant().workspace(),
                                                                f.project().id(),
                                                                0,
                                                                25)))
                .isInstanceOf(ApiException.class);
        assertThat(
                        as(
                                        f.tenant().actor(),
                                        () ->
                                                submissions()
                                                        .queue(
                                                                f.tenant().workspace(),
                                                                f.project().id(),
                                                                0,
                                                                25))
                                .get("data"))
                .asList()
                .hasSize(1);
    }

    @Test
    void revokedGrantAndForeignProjectCannotSubmit() {
        var f = fixture();
        String c = enter(f).credential();
        var i = textItem(f);
        save(f, c, i, text("Ready"), 0);
        var other = fixture();
        assertThatThrownBy(
                        () ->
                                submissions()
                                        .submit(
                                                c,
                                                other.project().id(),
                                                i,
                                                new com.ayaantrix.collector.submission.dto
                                                        .SubmissionDtos.Submit(1, 1),
                                                "foreign"))
                .isInstanceOf(ApiException.class);
        as(
                f.tenant().actor(),
                () -> {
                    access().revoke(f.tenant().workspace(), f.project().id(), f.contact());
                    return null;
                });
        code(
                () ->
                        submissions()
                                .submit(
                                        c,
                                        f.project().id(),
                                        i,
                                        new com.ayaantrix.collector.submission.dto.SubmissionDtos
                                                .Submit(1, 1),
                                        "revoked"),
                "CLIENT_ACCESS_UNAVAILABLE");
        assertThat(count(f.tenant(), "submission_revisions")).isZero();
    }

    @Test
    void submittedSchemaCannotBeSemanticallyRewritten() {
        var f = fixture();
        String c = enter(f).credential();
        var i = textItem(f);
        save(f, c, i, text("Ready"), 0);
        submit(f, c, i, 1, "submit");
        var d = detail(f.tenant(), f.project());
        var field = definition(d.structure().getFirst().path("items").get(0));
        field.put("required", false);
        code(
                () ->
                        as(
                                f.tenant().actor(),
                                () ->
                                        editor().patchItem(
                                                        f.tenant().workspace(),
                                                        f.project().id(),
                                                        i,
                                                        new ItemPatch(
                                                                field,
                                                                d.project().structureVersion(),
                                                                true))),
                "REOPEN_REQUIRED");
    }

    @Test
    void independentReadAndReviewPermissionsAreEnforced() {
        var f = fixture();
        String c = enter(f).credential();
        var i = textItem(f);
        save(f, c, i, text("Ready"), 0);
        var r = submit(f, c, i, 1, "submit");
        var member = actor();
        var m =
                context.getBean(WorkspaceMemberRepository.class)
                        .saveAndFlush(
                                new WorkspaceMember(
                                        f.tenant().workspace(),
                                        member.id(),
                                        WorkspaceRole.MEMBER,
                                        NOW));
        context.getBean(ProjectAssignmentRepository.class)
                .saveAndFlush(
                        new ProjectAssignment(
                                f.tenant().workspace(),
                                f.project().id(),
                                m.id(),
                                false,
                                false,
                                NOW));
        assertThat(
                        as(
                                member,
                                () ->
                                        submissions()
                                                .history(
                                                        f.tenant().workspace(),
                                                        f.project().id(),
                                                        i)))
                .containsKey("data");
        code(
                () ->
                        as(
                                member,
                                () ->
                                        submissions()
                                                .queue(
                                                        f.tenant().workspace(),
                                                        f.project().id(),
                                                        0,
                                                        25)),
                "REVIEW_FORBIDDEN");
        jdbc.update(
                "update collector.project_members set can_review=true where workspace_member_id=?",
                m.id());
        assertThat(
                        as(
                                member,
                                () ->
                                        submissions()
                                                .queue(
                                                        f.tenant().workspace(),
                                                        f.project().id(),
                                                        0,
                                                        25)))
                .containsKey("data");
        jdbc.update("update collector.workspace_members set state='DISABLED' where id=?", m.id());
        assertThatThrownBy(
                        () ->
                                as(
                                        member,
                                        () ->
                                                submissions()
                                                        .detail(
                                                                f.tenant().workspace(),
                                                                f.project().id(),
                                                                i,
                                                                r.revisionId())))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void failedAuditRollsBackRevisionStateAndOutbox() {
        var f = fixture();
        String c = enter(f).credential();
        var i = textItem(f);
        save(f, c, i, text("Ready"), 0);
        var before = detail(f.tenant(), f.project());
        long logs = count(f.tenant(), "audit_logs");
        jdbc.execute(
                "create function collector.test_submission_audit() returns trigger language plpgsql"
                        + " as $$ begin if new.action='CLIENT_ITEM_SUBMITTED' then raise exception"
                        + " 'synthetic audit failure'; end if; return new; end $$");
        jdbc.execute(
                "create trigger test_submission_audit before insert on collector.audit_logs for"
                        + " each row execute function collector.test_submission_audit()");
        try {
            assertThatThrownBy(() -> submit(f, c, i, 1, "rollback")).isInstanceOf(Exception.class);
            assertThat(count(f.tenant(), "submission_revisions")).isZero();
            assertThat(count(f.tenant(), "submission_events")).isZero();
            assertThat(count(f.tenant(), "audit_logs")).isEqualTo(logs);
            assertThat(detail(f.tenant(), f.project())).isEqualTo(before);
        } finally {
            jdbc.execute("drop trigger test_submission_audit on collector.audit_logs");
            jdbc.execute("drop function collector.test_submission_audit()");
        }
    }

    @Test
    void disabledAndHiddenItemsStayUnsubmittedWithoutDeletingDrafts() {
        var f = fixture();
        String c = enter(f).credential();
        var i = textItem(f);
        save(f, c, i, text("Preserve"), 0);
        jdbc.update("update collector.items set enabled=false where id=?", i);
        code(() -> submit(f, c, i, 1, "disabled"), "NOT_FOUND");
        assertThat(count(f.tenant(), "answers")).isEqualTo(1);
        assertThat(count(f.tenant(), "submission_revisions")).isZero();
    }

    @Test
    void withdrawRequiresExactCurrentVersionAndPreservesHistory() {
        var f = fixture();
        String c = enter(f).credential();
        var i = textItem(f);
        save(f, c, i, text("Ready"), 0);
        var r = submit(f, c, i, 1, "submit");
        code(
                () ->
                        submissions()
                                .withdraw(
                                        c,
                                        f.project().id(),
                                        i,
                                        new com.ayaantrix.collector.submission.dto.SubmissionDtos
                                                .Withdraw(r.itemVersion() - 1),
                                        "stale"),
                "ITEM_VERSION_CONFLICT");
        var cmd =
                new com.ayaantrix.collector.submission.dto.SubmissionDtos.Withdraw(r.itemVersion());
        var a = submissions().withdraw(c, f.project().id(), i, cmd, "withdraw");
        assertThat(submissions().withdraw(c, f.project().id(), i, cmd, "withdraw")).isEqualTo(a);
        code(
                () -> submissions().withdraw(c, f.project().id(), i, cmd, "duplicate"),
                "ITEM_VERSION_CONFLICT");
        assertThat(count(f.tenant(), "submission_revisions")).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"autosave", "structure", "revoke", "pause"})
    void waitingSubmissionRechecksCommittedChanges(String kind) throws Exception {
        var f = fixture();
        String c = enter(f).credential();
        var i = textItem(f);
        save(f, c, i, text("Original"), 0);
        var cmd = submitCommand(f, 1);
        var held = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var change =
                    pool.submit(
                            () ->
                                    tx().executeWithoutResult(
                                                    status -> {
                                                        jdbc.queryForObject(
                                                                "select id from"
                                                                    + " collector.workspaces where"
                                                                    + " id=? for update",
                                                                UUID.class,
                                                                f.tenant().workspace());
                                                        held.countDown();
                                                        try {
                                                            if (!release.await(
                                                                    12, TimeUnit.SECONDS))
                                                                throw new IllegalStateException(
                                                                        "Lock not released");
                                                        } catch (InterruptedException e) {
                                                            Thread.currentThread().interrupt();
                                                            throw new IllegalStateException(e);
                                                        }
                                                        switch (kind) {
                                                            case "autosave" ->
                                                                    save(
                                                                            f,
                                                                            c,
                                                                            i,
                                                                            text("New draft"),
                                                                            1);
                                                            case "structure" ->
                                                                    jdbc.update(
                                                                            "update"
                                                                                + " collector.projects"
                                                                                + " set structure_version=structure_version+1"
                                                                                + " where id=?",
                                                                            f.project().id());
                                                            case "revoke" ->
                                                                    jdbc.update(
                                                                            "update"
                                                                                + " collector.project_contacts"
                                                                                + " set state='REVOKED',revoked_at=now()"
                                                                                + " where id=?",
                                                                            f.contact());
                                                            default ->
                                                                    jdbc.update(
                                                                            "update"
                                                                                + " collector.projects"
                                                                                + " set state='PAUSED'"
                                                                                + " where id=?",
                                                                            f.project().id());
                                                        }
                                                    }));
            assertThat(held.await(5, TimeUnit.SECONDS)).isTrue();
            var submit =
                    pool.submit(
                            () -> {
                                try {
                                    submissions().submit(c, f.project().id(), i, cmd, "waiter");
                                    return "ACCEPTED";
                                } catch (ApiException e) {
                                    return e.getCode();
                                }
                            });
            try {
                long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(6);
                int waiting = 0;
                while (waiting == 0 && System.nanoTime() < until) {
                    waiting =
                            jdbc.queryForObject(
                                    "select count(*) from pg_stat_activity where"
                                        + " datname=current_database() and wait_event_type='Lock'"
                                        + " and query like '%workspaces%' and"
                                        + " pid<>pg_backend_pid()",
                                    Integer.class);
                    if (waiting == 0) Thread.sleep(10);
                }
                assertThat(waiting).as("Actual PostgreSQL submission lock waiter").isGreaterThan(0);
            } finally {
                release.countDown();
            }
            change.get(15, TimeUnit.SECONDS);
            assertThat(submit.get(15, TimeUnit.SECONDS))
                    .isEqualTo(
                            switch (kind) {
                                case "autosave" -> "ANSWER_VERSION_CONFLICT";
                                case "structure" -> "STRUCTURE_CONFLICT";
                                case "revoke" -> "CLIENT_ACCESS_UNAVAILABLE";
                                default -> "READ_ONLY";
                            });
        }
        assertThat(count(f.tenant(), "submission_revisions")).isZero();
        assertThat(count(f.tenant(), "submission_events")).isZero();
    }

    @Test
    void hiddenConditionalAnswersAreRetainedButCannotBeSubmitted() {
        var f = fixture();
        var section = emptySection(f.tenant(), f.project());
        UUID control =
                id(
                        add(
                                f.tenant(),
                                f.project(),
                                section,
                                field("conditional.control", "SINGLE_SELECT")));
        var child = field("conditional.child", "SHORT_TEXT");
        child.putObject("visibleWhen")
                .put("dependsOnItemKey", "conditional.control")
                .put("operator", "EQUALS")
                .put("optionKey", "yes");
        UUID dependent = id(add(f.tenant(), f.project(), section, child));
        String c = enter(f).credential();
        save(f, c, control, json.createObjectNode().put("optionKey", "yes"), 0);
        save(f, c, dependent, text("retain"), 0);
        save(f, c, control, json.createObjectNode().put("optionKey", ""), 1);
        code(() -> submit(f, c, dependent, 1, "hidden"), "NOT_FOUND");
        assertThat(
                        jdbc.queryForObject(
                                "select value_json->>'text' from collector.answers where item_id=?",
                                String.class,
                                dependent))
                .isEqualTo("retain");
        assertThat(count(f.tenant(), "submission_revisions")).isZero();
    }

    @ParameterizedTest
    @EnumSource(ProjectType.class)
    void eachProjectTypeUsesTheSameImmutableSubmissionWorkflow(ProjectType type) {
        var t = tenant();
        var p = create(t, type);
        jdbc.update("update collector.projects set state='ACTIVE' where id=?", p.id());
        var contact =
                as(
                        t.actor(),
                        () ->
                                context.getBean(
                                                com.ayaantrix.collector.project.service
                                                        .ProjectClientService.class)
                                        .createContact(
                                                t.workspace(),
                                                p.id(),
                                                new com.ayaantrix.collector.project.dto
                                                        .ProjectClientDtos.ContactCreate(
                                                        t.client(),
                                                        "Synthetic Client",
                                                        "types-"
                                                                + UUID.randomUUID()
                                                                + "@example.test",
                                                        NOW.plus(Duration.ofDays(90)))));
        var f = new Fixture(t, p, contact.id());
        String c = enter(f).credential();
        var i = textItem(f);
        save(f, c, i, text("Synthetic project information for the client team"), 0);
        var r = submit(f, c, i, 1, "type-submit");
        assertThat(r.revisionNo()).isEqualTo(1);
        assertThat(
                        as(
                                t.actor(),
                                () ->
                                        submissions()
                                                .detail(t.workspace(), p.id(), i, r.revisionId())))
                .containsKey("revision");
    }

    @Test
    void readonlySubscriptionBlocksSubmissionButKeepsDraftAndHistoryReadable() {
        var f = fixture();
        String c = enter(f).credential();
        var i = textItem(f);
        save(f, c, i, text("Ready"), 0);
        jdbc.update(
                "update collector.subscriptions set state='READ_ONLY' where workspace_id=?",
                f.tenant().workspace());
        code(() -> submit(f, c, i, 1, "readonly-plan"), "READ_ONLY");
        assertThat(drafts().read(c, f.project().id(), i)).containsKey("answer");
        assertThat(
                        json.valueToTree(portal().checklist(c, f.project().id()))
                                .at("/capabilities/canSubmit")
                                .asBoolean())
                .isFalse();
        assertThat(count(f.tenant(), "submission_revisions")).isZero();
    }

    @Test
    void conditionalSubmissionFreezesEffectiveVisibilityAndLaterDraftsCannotRewriteIt() {
        var f = fixture();
        var section = emptySection(f.tenant(), f.project());
        UUID control =
                id(
                        add(
                                f.tenant(),
                                f.project(),
                                section,
                                field("conditional.control", "SINGLE_SELECT")));
        var child = field("conditional.child", "SHORT_TEXT");
        child.putObject("visibleWhen")
                .put("dependsOnItemKey", "conditional.control")
                .put("operator", "EQUALS")
                .put("optionKey", "yes");
        UUID dependent = id(add(f.tenant(), f.project(), section, child));
        String c = enter(f).credential();
        save(f, c, control, json.createObjectNode().put("optionKey", "yes"), 0);
        save(f, c, dependent, text("Submitted conditional content"), 0);
        var r = submit(f, c, dependent, 1, "conditional-submit");
        var snapshot =
                as(
                        f.tenant().actor(),
                        () ->
                                submissions()
                                        .detail(
                                                f.tenant().workspace(),
                                                f.project().id(),
                                                dependent,
                                                r.revisionId()));
        assertThat(
                        json.<JsonNode>valueToTree(snapshot)
                                .at("/revision/schemaSnapshot/visible")
                                .asBoolean())
                .isTrue();
        var frozen =
                json.readTree(
                        jdbc.queryForObject(
                                "select structure_snapshot::text from"
                                        + " collector.submission_revisions where id=?",
                                String.class,
                                r.revisionId()));
        boolean found = false;
        for (var sec : frozen)
            for (var item : sec.path("items"))
                if (item.path("id").asText().equals(dependent.toString())) {
                    assertThat(item.path("visible").asBoolean()).isTrue();
                    found = true;
                }
        assertThat(found).isTrue();
        save(f, c, control, json.createObjectNode().put("optionKey", ""), 1);
        assertThat(
                        as(
                                f.tenant().actor(),
                                () ->
                                        submissions()
                                                .detail(
                                                        f.tenant().workspace(),
                                                        f.project().id(),
                                                        dependent,
                                                        r.revisionId())))
                .isEqualTo(snapshot);
    }

    // T21 reuses actual submission fixtures, not a second submission model.
    com.ayaantrix.collector.review.service.ReviewService reviews() {
        return context.getBean(com.ayaantrix.collector.review.service.ReviewService.class);
    }

    record ReviewFixture(
            Fixture f,
            String cookie,
            UUID item,
            com.ayaantrix.collector.submission.dto.SubmissionDtos.Submitted submitted) {}

    ReviewFixture reviewFixture() {
        var f = fixture();
        String c = enter(f).credential();
        var i = textItem(f);
        save(f, c, i, text("Exact submitted content"), 0);
        return new ReviewFixture(f, c, i, submit(f, c, i, 1, "submit"));
    }

    com.ayaantrix.collector.review.dto.ReviewDtos.Decide decision(ReviewFixture r, String kind) {
        return new com.ayaantrix.collector.review.dto.ReviewDtos.Decide(
                r.submitted().revisionId(),
                r.submitted().itemVersion(),
                com.ayaantrix.collector.review.dto.ReviewDtos.Decision.valueOf(kind),
                kind.equals("REQUEST_CHANGES") ? "Please clarify services." : null);
    }

    Map<String, Object> decide(ReviewFixture r, String kind, String key) {
        return as(
                r.f().tenant().actor(),
                () ->
                        reviews()
                                .decide(
                                        r.f().tenant().workspace(),
                                        r.f().project().id(),
                                        r.item(),
                                        decision(r, kind),
                                        key));
    }

    record AiFixture(Fixture f, String cookie, UUID item) {}

    AiFixture aiFixture(ProjectType type) {
        var f = fixture(type);
        String cookie = enter(f).credential();
        var field = field("ai_text", "LONG_TEXT");
        ((ObjectNode) field).putObject("ai").put("enabled", true).put("targetWords", 150);
        var all = as(f.tenant().actor(), () -> detail(f.tenant(), f.project()));
        UUID item =
                UUID.fromString(
                        all.structure().getFirst().path("items").get(0).path("id").asText());
        jdbc.update(
                "update collector.items set field_type='LONG_TEXT',schema_json=?::jsonb where id=?",
                field.toString(),
                item);
        jdbc.update("update collector.projects set ai_enabled=true where id=?", f.project().id());
        return new AiFixture(f, cookie, item);
    }

    com.ayaantrix.collector.ai.service.AiService ai() {
        return context.getBean(com.ayaantrix.collector.ai.service.AiService.class);
    }

    com.ayaantrix.collector.ai.dto.AiDtos.Create aiInput(long version) {
        return new com.ayaantrix.collector.ai.dto.AiDtos.Create(
                List.of("Family owned practice", "Serving our local community"),
                "Professional",
                150,
                version,
                true);
    }

    UUID aiCreate(AiFixture f, String key) {
        return UUID.fromString(
                ai().create(f.cookie(), f.f().project().id(), f.item(), aiInput(0), key)
                        .get("jobId")
                        .toString());
    }

    JsonNode aiJob(AiFixture f, UUID id) {
        return json.valueToTree(ai().get(f.cookie(), f.f().project().id(), id)).path("job");
    }

    com.ayaantrix.collector.ai.worker.AiWorker aiWorker() {
        return context.getBean(com.ayaantrix.collector.ai.worker.AiWorker.class);
    }

    @ParameterizedTest
    @EnumSource(ProjectType.class)
    void aiGenerationReservesSettlesAndNeverWritesAnswers(ProjectType type) {
        var f = aiFixture(type);
        var id = aiCreate(f, "generate");
        assertThat(aiCreate(f, "generate")).isEqualTo(id);
        assertThat(
                        jdbc.queryForObject(
                                "select ai_drafts_reserved from collector.usage_periods where"
                                        + " workspace_id=?",
                                Integer.class,
                                f.f().tenant().workspace()))
                .isEqualTo(1);
        assertThat(aiWorker().dispatchOne()).isTrue();
        assertThat(aiJob(f, id).path("state").asText()).isEqualTo("SUCCEEDED");
        assertThat(aiJob(f, id).path("result").path("factsUsed")).hasSize(2);
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from collector.answers where project_id=?",
                                Integer.class,
                                f.f().project().id()))
                .isZero();
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from collector.submission_revisions where"
                                        + " project_id=?",
                                Integer.class,
                                f.f().project().id()))
                .isZero();
        assertThat(
                        jdbc.queryForObject(
                                "select ai_cost_microusd from collector.usage_periods where"
                                        + " workspace_id=?",
                                Long.class,
                                f.f().tenant().workspace()))
                .isEqualTo(200);
        assertThat(
                        jdbc.queryForObject(
                                "select ai_drafts_reserved from collector.usage_periods where"
                                        + " workspace_id=?",
                                Integer.class,
                                f.f().tenant().workspace()))
                .isZero();
        assertThat(context.getBean(AiFake.class).received.projectType()).isEqualTo(type.name());
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "AI_REFUSED",
                "AI_TIMEOUT",
                "AI_INVALID_OUTPUT",
                "AI_PROVIDER_ERROR",
                "AI_CREDIT_UNAVAILABLE"
            })
    void aiFailurePreservesOrdinaryWriting(String failure) {
        var f = aiFixture(ProjectType.WEBSITE);
        save(f.f(), f.cookie(), f.item(), text("My ordinary draft"), 0);
        var id =
                UUID.fromString(
                        ai().create(
                                        f.cookie(),
                                        f.f().project().id(),
                                        f.item(),
                                        aiInput(1),
                                        "generate")
                                .get("jobId")
                                .toString());
        context.getBean(AiFake.class).failure = failure;
        assertThat(aiWorker().dispatchOne()).isTrue();
        assertThat(aiJob(f, id).path("state").asText())
                .isEqualTo(failure.equals("AI_REFUSED") ? "REFUSED" : "FAILED");
        assertThat(aiJob(f, id).path("failureCode").asText()).isEqualTo(failure);
        assertThat(
                        save(f.f(), f.cookie(), f.item(), text("Still writing manually"), 1)
                                .answer()
                                .version())
                .isEqualTo(2);
        assertThat(context.getBean(AiFake.class).calls).isEqualTo(1);
    }

    @Test
    void aiSafetyValidationAndBudgetRollback() {
        var f = aiFixture(ProjectType.WEBSITE);
        context.getBean(AiFake.class).available = false;
        code(() -> aiCreate(f, "unavailable"), "AI_UNAVAILABLE");
        assertThat(
                        save(f.f(), f.cookie(), f.item(), text("Manual writing works"), 0)
                                .answer()
                                .version())
                .isEqualTo(1);
        context.getBean(AiFake.class).available = true;
        code(() -> aiCreate(f, "stale"), "ANSWER_VERSION_CONFLICT");
        code(
                () ->
                        ai().create(
                                        f.cookie(),
                                        f.f().project().id(),
                                        f.item(),
                                        new com.ayaantrix.collector.ai.dto.AiDtos.Create(
                                                List.of("Fact"), "Professional", 150, 1, false),
                                        "consent"),
                "VALIDATION_FAILED");
        assertThatThrownBy(
                        () ->
                                tx().executeWithoutResult(
                                                status -> {
                                                    ai().create(
                                                                    f.cookie(),
                                                                    f.f().project().id(),
                                                                    f.item(),
                                                                    aiInput(1),
                                                                    "rollback");
                                                    throw new IllegalStateException();
                                                }))
                .isInstanceOf(IllegalStateException.class);
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from collector.usage_periods where workspace_id=?",
                                Integer.class,
                                f.f().tenant().workspace()))
                .isZero();
        ai().create(f.cookie(), f.f().project().id(), f.item(), aiInput(1), "budget-first");
        jdbc.update(
                "update collector.usage_periods set ai_cost_microusd=10000000-ai_reserved_microusd"
                        + " where workspace_id=?",
                f.f().tenant().workspace());
        code(
                () ->
                        ai().create(
                                        f.cookie(),
                                        f.f().project().id(),
                                        f.item(),
                                        aiInput(1),
                                        "budget-exhausted"),
                "AI_ALLOWANCE_EXHAUSTED");
    }

    @Test
    void aiAtomicAllowanceAndControlledRetry() throws Exception {
        var f = aiFixture(ProjectType.WEBSITE);
        UUID first = aiCreate(f, "first");
        context.getBean(AiFake.class).transientFailures = 1;
        assertThat(aiWorker().dispatchOne()).isTrue();
        assertThat(aiJob(f, first).path("state").asText()).isEqualTo("SUCCEEDED");
        assertThat(context.getBean(AiFake.class).calls).isEqualTo(2);
        jdbc.update(
                "update collector.usage_periods set ai_drafts_used=19 where workspace_id=?",
                f.f().tenant().workspace());
        var pool = Executors.newFixedThreadPool(2);
        var start = new CountDownLatch(1);
        try {
            var a =
                    pool.submit(
                            () -> {
                                start.await();
                                try {
                                    return aiCreate(f, "a").toString();
                                } catch (ApiException e) {
                                    return e.getCode();
                                }
                            });
            var b =
                    pool.submit(
                            () -> {
                                start.await();
                                try {
                                    return aiCreate(f, "b").toString();
                                } catch (ApiException e) {
                                    return e.getCode();
                                }
                            });
            start.countDown();
            var outcomes = List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS));
            assertThat(outcomes).filteredOn(x -> x.equals("AI_ALLOWANCE_EXHAUSTED")).hasSize(1);
        } finally {
            pool.shutdownNow();
        }
        assertThat(
                        jdbc.queryForObject(
                                "select ai_drafts_used+ai_drafts_reserved from"
                                        + " collector.usage_periods where workspace_id=?",
                                Integer.class,
                                f.f().tenant().workspace()))
                .isEqualTo(20);
    }

    @Test
    void aiGrantChangesAndUnknownLeasesNeverResend() {
        var f = aiFixture(ProjectType.WEBSITE);
        var id = aiCreate(f, "generate");
        as(
                f.f().tenant().actor(),
                () -> {
                    access().revoke(
                                    f.f().tenant().workspace(),
                                    f.f().project().id(),
                                    f.f().contact());
                    return null;
                });
        assertThat(aiWorker().dispatchOne()).isTrue();
        assertThat(context.getBean(AiFake.class).calls).isZero();
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.ai_draft_jobs where id=?",
                                String.class,
                                id))
                .isEqualTo("FAILED");
        var other = aiFixture(ProjectType.WEBSITE);
        var pending = aiCreate(other, "generate");
        var repository = context.getBean(com.ayaantrix.collector.ai.repository.AiRepository.class);
        var claimed = tx().execute(status -> repository.claim(NOW)).orElseThrow();
        assertThat(claimed.id()).isEqualTo(pending);
        context.getBean(TestClock.class).time = NOW.plusSeconds(76);
        aiWorker().cleanup();
        assertThat(aiJob(other, pending).path("failureCode").asText())
                .isEqualTo("AI_OUTCOME_UNKNOWN");
        assertThat(aiWorker().dispatchOne()).isFalse();
        assertThat(context.getBean(AiFake.class).calls).isZero();
    }

    @Test
    void aiEligibilityContactIsolationAndRetention() {
        var f = aiFixture(ProjectType.WEBSITE);
        UUID p = f.f().project().id();
        jdbc.update("update collector.projects set ai_enabled=false where id=?", p);
        code(() -> aiCreate(f, "disabled"), "AI_UNAVAILABLE");
        jdbc.update("update collector.projects set ai_enabled=true where id=?", p);
        var id = aiCreate(f, "generate");
        var second =
                as(
                        f.f().tenant().actor(),
                        () ->
                                context.getBean(
                                                com.ayaantrix.collector.project.service
                                                        .ProjectClientService.class)
                                        .createContact(
                                                f.f().tenant().workspace(),
                                                p,
                                                new com.ayaantrix.collector.project.dto
                                                        .ProjectClientDtos.ContactCreate(
                                                        f.f().tenant().client(),
                                                        "Second Client",
                                                        "second-"
                                                                + UUID.randomUUID()
                                                                + "@example.test",
                                                        NOW.plus(Duration.ofDays(90)))));
        var otherCookie =
                enter(new Fixture(f.f().tenant(), f.f().project(), second.id())).credential();
        code(() -> ai().get(otherCookie, p, id), "NOT_FOUND");
        context.close();
        open();
        assertThat(aiWorker().dispatchOne()).isTrue();
        assertThat(aiJob(f, id).path("state").asText()).isEqualTo("SUCCEEDED");
        context.getBean(TestClock.class).time = NOW.plus(Duration.ofDays(31));
        aiWorker().cleanup();
        var row =
                context.getBean(com.ayaantrix.collector.ai.repository.AiRepository.class)
                        .find(f.f().tenant().workspace(), p, id)
                        .orElseThrow();
        assertThat(row.state()).isEqualTo("EXPIRED");
        assertThat(row.input()).isNull();
        assertThat(row.result()).isNull();
    }

    @Test
    void aiHttpCsrfContactScopeAndAcceptanceRequiresKey() throws Exception {
        var f = aiFixture(ProjectType.WEBSITE);
        String root = "/api/v1/client/projects/" + f.f().project().id();
        var cookie = new jakarta.servlet.http.Cookie(cookieName(), f.cookie());
        String body = json.writeValueAsString(aiInput(0));
        mvc.perform(
                        post(root + "/items/" + f.item() + "/ai-drafts")
                                .cookie(cookie)
                                .header("Idempotency-Key", "csrf")
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isForbidden());
        var result =
                mvc.perform(
                                post(root + "/items/" + f.item() + "/ai-drafts")
                                        .with(csrf())
                                        .cookie(cookie)
                                        .header("Idempotency-Key", "http")
                                        .contentType("application/json")
                                        .content(body))
                        .andExpect(status().isAccepted())
                        .andExpect(header().exists("X-Request-ID"))
                        .andReturn();
        UUID id =
                UUID.fromString(
                        json.readTree(result.getResponse().getContentAsString())
                                .path("jobId")
                                .asText());
        var foreign = aiFixture(ProjectType.WEBSITE);
        assertThatThrownBy(() -> ai().get(foreign.cookie(), f.f().project().id(), id))
                .isInstanceOf(ApiException.class);
        mvc.perform(get(root + "/ai-drafts/" + id)).andExpect(status().isUnauthorized());
        mvc.perform(
                        post(root + "/ai-drafts/" + id + "/accept")
                                .with(csrf())
                                .cookie(cookie)
                                .contentType("application/json")
                                .content("{}"))
                .andExpect(status().isBadRequest());
    }

    Map<String, Object> acceptAi(AiFixture f, UUID id, long version, String key) {
        return ai().accept(
                        f.cookie(),
                        f.f().project().id(),
                        id,
                        new com.ayaantrix.collector.ai.dto.AiDtos.Accept(version),
                        key);
    }

    @ParameterizedTest
    @EnumSource(ProjectType.class)
    void aiAcceptanceIsExplicitIdempotentAndPreservesOriginal(ProjectType type) {
        var f = aiFixture(type);
        save(f.f(), f.cookie(), f.item(), text("My original words"), 0);
        UUID id =
                UUID.fromString(
                        ai().create(
                                        f.cookie(),
                                        f.f().project().id(),
                                        f.item(),
                                        aiInput(1),
                                        "create")
                                .get("jobId")
                                .toString());
        aiWorker().dispatchOne();
        assertThat(policyAnswer(f).path("text").asText()).isEqualTo("My original words");
        var result = acceptAi(f, id, 1, "accept");
        assertThat(json.valueToTree(result).path("answer").path("version").asLong()).isEqualTo(2);
        assertThat(policyAnswer(f).path("text").asText()).contains("Family owned practice");
        JsonNode replay = json.readTree(json.writeValueAsString(acceptAi(f, id, 1, "accept")));
        JsonNode expected = json.readTree(json.writeValueAsString(result));
        assertThat(replay).isEqualTo(expected);
        code(() -> acceptAi(f, id, 2, "again"), "AI_NOT_ACCEPTABLE");
        var previous =
                json.readTree(
                        jdbc.queryForObject(
                                "select acceptance_json::text from collector.ai_draft_jobs where"
                                        + " id=?",
                                String.class,
                                id));
        assertThat(previous.path("previousAnswer").path("value").path("text").asText())
                .isEqualTo("My original words");
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.items where id=?",
                                String.class,
                                f.item()))
                .isEqualTo("DRAFT");
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from collector.submission_revisions where"
                                        + " project_id=?",
                                Integer.class,
                                f.f().project().id()))
                .isZero();
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from collector.audit_logs where"
                                        + " action='AI_DRAFT_ACCEPTED' and resource_id=?",
                                Integer.class,
                                id))
                .isEqualTo(1);
    }

    JsonNode policyAnswer(AiFixture f) {
        return json.valueToTree(
                        drafts().read(f.cookie(), f.f().project().id(), f.item()).get("answer"))
                .path("value");
    }

    @Test
    void aiAcceptanceNeverOverwritesNewerAnswerAndValidatesCurrentSchema() {
        var f = aiFixture(ProjectType.WEBSITE);
        var id = aiCreate(f, "create");
        aiWorker().dispatchOne();
        save(f.f(), f.cookie(), f.item(), text("Newer manual answer"), 0);
        code(() -> acceptAi(f, id, 0, "stale"), "ANSWER_VERSION_CONFLICT");
        code(() -> acceptAi(f, id, 1, "force"), "ANSWER_VERSION_CONFLICT");
        assertThat(policyAnswer(f).path("text").asText()).isEqualTo("Newer manual answer");
        var other = aiFixture(ProjectType.WEBSITE);
        var second = aiCreate(other, "create");
        aiWorker().dispatchOne();
        jdbc.update(
                "update collector.items set"
                        + " schema_json=jsonb_set(schema_json,'{validation,maxLength}','3'::jsonb)"
                        + " where id=?",
                other.item());
        code(() -> acceptAi(other, second, 0, "schema"), "STRUCTURE_CONFLICT");
        assertThat(policyAnswer(other)).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(
            strings = {"QUEUED", "FAILED", "REFUSED", "EXPIRED", "REVOKED", "SUBMITTED", "LEGACY"})
    void aiAcceptanceRejectsUnavailableAndUnsafeJobs(String state) {
        var f = aiFixture(ProjectType.WEBSITE);
        var id = aiCreate(f, "create");
        if (!state.equals("QUEUED")) {
            context.getBean(AiFake.class).failure =
                    state.equals("FAILED")
                            ? "AI_TIMEOUT"
                            : state.equals("REFUSED") ? "AI_REFUSED" : null;
            aiWorker().dispatchOne();
        }
        if (state.equals("EXPIRED")) {
            jdbc.update(
                    "update collector.ai_draft_jobs set created_at=created_at-interval '31"
                            + " days',expires_at=expires_at-interval '31 days' where id=?",
                    id);
            code(() -> acceptAi(f, id, 0, "expired"), "AI_EXPIRED");
            return;
        }
        if (state.equals("REVOKED")) {
            as(
                    f.f().tenant().actor(),
                    () -> {
                        access().revoke(
                                        f.f().tenant().workspace(),
                                        f.f().project().id(),
                                        f.f().contact());
                        return null;
                    });
            assertThatThrownBy(() -> acceptAi(f, id, 0, "revoked"))
                    .isInstanceOf(ApiException.class);
            return;
        }
        if (state.equals("SUBMITTED")) {
            save(f.f(), f.cookie(), f.item(), text("Client submission"), 0);
            submit(f.f(), f.cookie(), f.item(), 1, "submit");
            code(() -> acceptAi(f, id, 1, "submitted"), "AI_UNAVAILABLE");
            return;
        }
        if (state.equals("LEGACY")) {
            jdbc.update("update collector.ai_draft_jobs set schema_snapshot=null where id=?", id);
            code(() -> acceptAi(f, id, 0, "legacy"), "STRUCTURE_CONFLICT");
            return;
        }
        code(() -> acceptAi(f, id, 0, "accept"), "AI_NOT_ACCEPTABLE");
        assertThat(policyAnswer(f)).isEmpty();
    }

    @Test
    void aiAcceptanceUsesNormalAnswerValidation() {
        var f = aiFixture(ProjectType.WEBSITE);
        jdbc.update(
                "update collector.items set"
                        + " schema_json=jsonb_set(schema_json,'{validation,maxLength}','3'::jsonb)"
                        + " where id=?",
                f.item());
        var command = aiInput(0);
        UUID id =
                UUID.fromString(
                        ai().create(f.cookie(), f.f().project().id(), f.item(), command, "create")
                                .get("jobId")
                                .toString());
        aiWorker().dispatchOne();
        assertThatThrownBy(() -> acceptAi(f, id, 0, "accept")).isInstanceOf(ApiException.class);
        assertThat(policyAnswer(f)).isEmpty();
        assertThat(aiJob(f, id).path("state").asText()).isEqualTo("SUCCEEDED");
    }

    @Test
    void aiAcceptanceConcurrencyRollbackAndTenantIsolation() throws Exception {
        var f = aiFixture(ProjectType.WEBSITE);
        var id = aiCreate(f, "create");
        aiWorker().dispatchOne();
        assertThatThrownBy(
                        () ->
                                tx().executeWithoutResult(
                                                status -> {
                                                    acceptAi(f, id, 0, "rollback");
                                                    throw new IllegalStateException();
                                                }))
                .isInstanceOf(IllegalStateException.class);
        assertThat(policyAnswer(f)).isEmpty();
        assertThat(aiJob(f, id).path("state").asText()).isEqualTo("SUCCEEDED");
        var other = aiFixture(ProjectType.WEBSITE);
        assertThatThrownBy(
                        () ->
                                ai().accept(
                                                other.cookie(),
                                                f.f().project().id(),
                                                id,
                                                new com.ayaantrix.collector.ai.dto.AiDtos.Accept(
                                                        0L),
                                                "foreign"))
                .isInstanceOf(ApiException.class);
        var pool = Executors.newFixedThreadPool(2);
        var start = new CountDownLatch(1);
        try {
            var a =
                    pool.submit(
                            () -> {
                                start.await();
                                try {
                                    acceptAi(f, id, 0, "a");
                                    return "ok";
                                } catch (ApiException e) {
                                    return e.getCode();
                                }
                            });
            var b =
                    pool.submit(
                            () -> {
                                start.await();
                                try {
                                    acceptAi(f, id, 0, "b");
                                    return "ok";
                                } catch (ApiException e) {
                                    return e.getCode();
                                }
                            });
            start.countDown();
            assertThat(List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder("ok", "AI_NOT_ACCEPTABLE");
        } finally {
            pool.shutdownNow();
        }
        assertThat(
                        jdbc.queryForObject(
                                "select version from collector.answers where item_id=?",
                                Long.class,
                                f.item()))
                .isEqualTo(1);
    }

    com.ayaantrix.collector.export.service.ExportService exports() {
        return context.getBean(com.ayaantrix.collector.export.service.ExportService.class);
    }

    com.ayaantrix.collector.export.repository.ExportRepository exportJobs() {
        return context.getBean(com.ayaantrix.collector.export.repository.ExportRepository.class);
    }

    UUID export(ReviewFixture r, String format, boolean partial, String key) {
        var f = r.f();
        long version =
                as(f.tenant().actor(), () -> detail(f.tenant(), f.project()).project().version());
        var result =
                as(
                        f.tenant().actor(),
                        () ->
                                exports()
                                        .create(
                                                f.tenant().workspace(),
                                                f.project().id(),
                                                new com.ayaantrix.collector.export.dto.ExportDtos
                                                        .Create(
                                                        com.ayaantrix.collector.export.dto
                                                                .ExportDtos.Format.valueOf(format),
                                                        version,
                                                        false,
                                                        partial,
                                                        null),
                                                key));
        return UUID.fromString(result.get("jobId").toString());
    }

    com.ayaantrix.collector.export.repository.ExportRepository.Job exportJob(
            ReviewFixture r, UUID id) {
        return exportJobs()
                .find(r.f().tenant().workspace(), r.f().project().id(), id)
                .orElseThrow();
    }

    @ParameterizedTest
    @ValueSource(strings = {"APPROVED_ZIP", "APPROVED_JSON", "APPROVED_MARKDOWN"})
    void exportFormatsUseImmutableApprovedSnapshot(String format) throws Exception {
        var r = reviewFixture();
        decide(r, "APPROVE", "a");
        var id = export(r, format, true, "e");
        var before = exportJob(r, id).manifest().deepCopy();
        assertThat(export(r, format, true, "e")).isEqualTo(id);
        reopenItem(
                r,
                as(
                        r.f().tenant().actor(),
                        () -> detail(r.f().tenant(), r.f().project()).project().version()),
                "New content needed",
                "open");
        var worker = context.getBean(com.ayaantrix.collector.export.worker.ExportWorker.class);
        assertThat(worker.dispatchOne()).isTrue();
        var job = exportJob(r, id);
        assertThat(job.state()).isEqualTo("READY");
        assertThat(job.manifest()).isEqualTo(before);
        var storage =
                context.getBean(
                        com.ayaantrix.collector.attachment.storage.PrivateObjectStorage.class);
        byte[] bytes;
        try (var in = storage.openPrivate(job.key())) {
            bytes = in.readAllBytes();
        }
        if (format.equals("APPROVED_ZIP")) {
            var entries = new HashMap<String, byte[]>();
            try (var zip =
                    new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(bytes))) {
                java.util.zip.ZipEntry e;
                while ((e = zip.getNextEntry()) != null)
                    entries.put(e.getName(), zip.readAllBytes());
            }
            assertThat(json.readTree(entries.get("manifest.json")))
                    .isEqualTo(before.path("public"));
            assertThat(entries.keySet()).anyMatch(n -> n.endsWith("content.md"));
        } else if (format.equals("APPROVED_JSON"))
            assertThat(json.readTree(bytes)).isEqualTo(before.path("public"));
        else
            assertThat(new String(bytes, java.nio.charset.StandardCharsets.UTF_8))
                    .contains("Exact submitted content", "Partial approved export");
        assertThat(new String(bytes, java.nio.charset.StandardCharsets.UTF_8))
                .doesNotContain("PRIVATE_KEY", "INTERNAL");
        var summary =
                as(
                        r.f().tenant().actor(),
                        () -> exports().get(r.f().tenant().workspace(), r.f().project().id(), id));
        assertThat(
                        json.valueToTree(summary)
                                .path("export")
                                .path("olderThanCurrentProject")
                                .asBoolean())
                .isTrue();
        assertThatThrownBy(
                        () ->
                                tx().executeWithoutResult(
                                                status ->
                                                        jdbc.update(
                                                                "update collector.export_jobs set"
                                                                    + " manifest_json='{}'::jsonb"
                                                                    + " where id=?",
                                                                id)))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(exportJob(r, id).manifest()).isEqualTo(before);
    }

    @Test
    void exportPartialStaleBindingAndRollback() {
        var r = reviewFixture();
        code(() -> export(r, "APPROVED_JSON", true, "empty"), "NO_APPROVED_CONTENT");
        decide(r, "APPROVE", "a");
        code(() -> export(r, "APPROVED_JSON", false, "partial"), "PARTIAL_EXPORT_ACK_REQUIRED");
        var f = r.f();
        code(
                () ->
                        as(
                                f.tenant().actor(),
                                () ->
                                        exports()
                                                .create(
                                                        f.tenant().workspace(),
                                                        f.project().id(),
                                                        new com.ayaantrix.collector.export.dto
                                                                .ExportDtos.Create(
                                                                com.ayaantrix.collector.export.dto
                                                                        .ExportDtos.Format
                                                                        .APPROVED_JSON,
                                                                1L,
                                                                false,
                                                                true,
                                                                null),
                                                        "stale")),
                "PROJECT_VERSION_CONFLICT");
        assertThatThrownBy(
                        () ->
                                tx().executeWithoutResult(
                                                status -> {
                                                    export(r, "APPROVED_JSON", true, "rollback");
                                                    throw new IllegalStateException("rollback");
                                                }))
                .isInstanceOf(IllegalStateException.class);
        assertThat(exportJobs().list(f.tenant().workspace(), f.project().id())).isEmpty();
        assertThat(export(r, "APPROVED_JSON", true, "rollback")).isNotNull();
    }

    @Test
    void exportDurableClaimRetryAndExpiry() throws Exception {
        var r = reviewFixture();
        decide(r, "APPROVE", "a");
        var id = export(r, "APPROVED_JSON", true, "e");
        var snapshot = exportJob(r, id).manifest().deepCopy();
        var claimed = tx().execute(status -> exportJobs().claim(NOW)).orElseThrow();
        assertThat(claimed.id()).isEqualTo(id);
        java.util.Optional<com.ayaantrix.collector.export.repository.ExportRepository.Job>
                secondClaim = tx().execute(status -> exportJobs().claim(NOW));
        assertThat(secondClaim).isEmpty();
        // Application restart reuses PostgreSQL state, not an in-memory task queue.
        context.close();
        open();
        assertThat(exportJob(r, id).manifest()).isEqualTo(snapshot);
        context.getBean(TestClock.class).time = NOW.plusSeconds(121);
        assertThat(
                        context.getBean(com.ayaantrix.collector.export.worker.ExportWorker.class)
                                .dispatchOne())
                .isTrue();
        var job = exportJob(r, id);
        assertThat(job.state()).isEqualTo("READY");
        assertThat(job.attempts()).isEqualTo(2);
        Boolean stale =
                tx().execute(
                                status ->
                                        exportJobs()
                                                .ready(
                                                        claimed,
                                                        "stale-attempt",
                                                        1,
                                                        NOW.plusSeconds(122)));
        assertThat(stale).isFalse();
        context.getBean(TestClock.class).time = NOW.plusSeconds(86401);
        var owner = r.f().tenant().actor();
        var account =
                context.getBean(UserAccountRepository.class).findById(owner.id()).orElseThrow();
        var issued =
                context.getBean(AgencySessions.class)
                        .login(new LoginRequest(account.getEmailNormalized(), PASSWORD));
        var current =
                new Actor(
                        owner.id(),
                        issued.accessToken(),
                        context.getBean(AccessTokens.class).decode(issued.accessToken()));
        assertThat(
                        json.valueToTree(
                                        as(
                                                current,
                                                () ->
                                                        exports()
                                                                .get(
                                                                        r.f().tenant().workspace(),
                                                                        r.f().project().id(),
                                                                        id)))
                                .path("export")
                                .path("state")
                                .asText())
                .isEqualTo("EXPIRED");
        code(
                () ->
                        as(
                                current,
                                () ->
                                        exports()
                                                .download(
                                                        r.f().tenant().workspace(),
                                                        r.f().project().id(),
                                                        id)),
                "EXPORT_EXPIRED");
        context.getBean(com.ayaantrix.collector.export.worker.ExportWorker.class).cleanup();
        assertThat(exportJob(r, id).state()).isEqualTo("EXPIRED");
        assertThatThrownBy(
                        () ->
                                context.getBean(
                                                com.ayaantrix.collector.attachment.storage
                                                        .PrivateObjectStorage.class)
                                        .headPrivate(job.key()))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void exportRetriesBoundedFailuresAndConcurrentIdempotency() throws Exception {
        var r = reviewFixture();
        decide(r, "APPROVE", "a");
        var start = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(2);
        UUID id;
        try {
            var a =
                    pool.submit(
                            () -> {
                                start.await();
                                return export(r, "APPROVED_JSON", true, "same");
                            });
            var b =
                    pool.submit(
                            () -> {
                                start.await();
                                return export(r, "APPROVED_JSON", true, "same");
                            });
            start.countDown();
            id = a.get(15, TimeUnit.SECONDS);
            assertThat(b.get(15, TimeUnit.SECONDS)).isEqualTo(id);
        } finally {
            pool.shutdownNow();
        }
        var original =
                context.getBean(
                        com.ayaantrix.collector.attachment.storage.PrivateObjectStorage.class);
        var failed =
                (com.ayaantrix.collector.attachment.storage.PrivateObjectStorage)
                        java.lang.reflect.Proxy.newProxyInstance(
                                getClass().getClassLoader(),
                                new Class[] {
                                    com.ayaantrix.collector.attachment.storage.PrivateObjectStorage
                                            .class
                                },
                                (proxy, method, args) -> {
                                    if (method.getName().equals("putFile"))
                                        throw new IllegalStateException(
                                                "Synthetic provider failure");
                                    try {
                                        return method.invoke(original, args);
                                    } catch (java.lang.reflect.InvocationTargetException e) {
                                        throw e.getCause();
                                    }
                                });
        var worker =
                new com.ayaantrix.collector.export.worker.ExportWorker(
                        exportJobs(),
                        context.getBean(com.ayaantrix.collector.export.worker.ExportRenderer.class),
                        failed,
                        context.getBean(TestClock.class),
                        context.getBean(PlatformTransactionManager.class));
        for (int attempt = 1; attempt <= 3; attempt++) {
            context.getBean(TestClock.class).time = NOW.plusSeconds(attempt * 60);
            assertThat(worker.dispatchOne()).isTrue();
            assertThat(exportJob(r, id).attempts()).isEqualTo(attempt);
        }
        assertThat(exportJob(r, id).state()).isEqualTo("FAILED");
        assertThat(exportJob(r, id).failure()).isEqualTo("EXPORT_GENERATION_FAILED");
        assertThat(worker.dispatchOne()).isFalse();
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "exporter",
                "reviewer",
                "unassigned",
                "revokedMember",
                "revokedAssignment",
                "revokedSession",
                "foreign"
            })
    void exportIndependentLivePermissions(String kind) {
        var r = reviewFixture();
        decide(r, "APPROVE", "a");
        var id = export(r, "APPROVED_JSON", true, "owner");
        var f = r.f();
        var actor = actor();
        UUID member = UUID.randomUUID();
        jdbc.update(
                "insert into"
                    + " collector.workspace_members(id,workspace_id,user_id,role,state,created_at,updated_at)"
                    + " values(?,?,?,'MEMBER','ACTIVE',?,?)",
                member,
                f.tenant().workspace(),
                actor.id(),
                java.sql.Timestamp.from(NOW),
                java.sql.Timestamp.from(NOW));
        if (!kind.equals("unassigned"))
            jdbc.update(
                    "insert into"
                        + " collector.project_members(workspace_id,project_id,workspace_member_id,can_review,can_export,created_at,updated_at)"
                        + " values(?,?,?,?,?,?,?)",
                    f.tenant().workspace(),
                    f.project().id(),
                    member,
                    kind.equals("reviewer"),
                    !kind.equals("reviewer"),
                    java.sql.Timestamp.from(NOW),
                    java.sql.Timestamp.from(NOW));
        if (kind.equals("revokedMember"))
            jdbc.update(
                    "update collector.workspace_members set state='DISABLED' where id=?", member);
        if (kind.equals("revokedAssignment"))
            jdbc.update(
                    "delete from collector.project_members where workspace_member_id=?", member);
        if (kind.equals("revokedSession"))
            context.getBean(AgencySessions.class).logoutAll(actor.jwt());
        var chosen = kind.equals("foreign") ? actor() : actor;
        if (kind.equals("exporter"))
            assertThat(
                            as(
                                    chosen,
                                    () ->
                                            exports()
                                                    .get(
                                                            f.tenant().workspace(),
                                                            f.project().id(),
                                                            id)))
                    .containsKey("export");
        else {
            assertThatThrownBy(
                            () ->
                                    as(
                                            chosen,
                                            () ->
                                                    exports()
                                                            .get(
                                                                    f.tenant().workspace(),
                                                                    f.project().id(),
                                                                    id)))
                    .isInstanceOf(ApiException.class);
            assertThatThrownBy(
                            () ->
                                    as(
                                            chosen,
                                            () ->
                                                    exports()
                                                            .download(
                                                                    f.tenant().workspace(),
                                                                    f.project().id(),
                                                                    id)))
                    .isInstanceOf(ApiException.class);
        }
    }

    @Test
    void exportLostCommitAcknowledgmentPreservesReadyObject() {
        var r = reviewFixture();
        decide(r, "APPROVE", "approve");
        var id = export(r, "APPROVED_JSON", true, "export");
        var real = context.getBean(PlatformTransactionManager.class);
        var commits = new java.util.concurrent.atomic.AtomicInteger();
        var uncertain =
                new PlatformTransactionManager() {
                    public org.springframework.transaction.TransactionStatus getTransaction(
                            org.springframework.transaction.TransactionDefinition definition) {
                        return real.getTransaction(definition);
                    }

                    public void rollback(org.springframework.transaction.TransactionStatus status) {
                        real.rollback(status);
                    }

                    public void commit(org.springframework.transaction.TransactionStatus status) {
                        real.commit(status);
                        if (commits.incrementAndGet() == 2)
                            throw new org.springframework.transaction.TransactionSystemException(
                                    "Synthetic lost commit acknowledgment");
                    }
                };
        var storage =
                context.getBean(
                        com.ayaantrix.collector.attachment.storage.PrivateObjectStorage.class);
        var worker =
                new com.ayaantrix.collector.export.worker.ExportWorker(
                        exportJobs(),
                        context.getBean(com.ayaantrix.collector.export.worker.ExportRenderer.class),
                        storage,
                        context.getBean(TestClock.class),
                        uncertain);
        assertThat(worker.dispatchOne()).isTrue();
        var job = exportJob(r, id);
        assertThat(job.state()).isEqualTo("READY");
        assertThat(storage.headPrivate(job.key()).bytes()).isPositive();
    }

    @Test
    void exportSectionSelectionAndHiddenItems() {
        var r = reviewFixture();
        decide(r, "APPROVE", "a");
        var f = r.f();
        long version =
                as(f.tenant().actor(), () -> detail(f.tenant(), f.project()).project().version());
        UUID section =
                jdbc.queryForObject(
                        "select section_id from collector.items where id=?", UUID.class, r.item());
        var result =
                as(
                        f.tenant().actor(),
                        () ->
                                exports()
                                        .create(
                                                f.tenant().workspace(),
                                                f.project().id(),
                                                new com.ayaantrix.collector.export.dto.ExportDtos
                                                        .Create(
                                                        com.ayaantrix.collector.export.dto
                                                                .ExportDtos.Format.APPROVED_JSON,
                                                        version,
                                                        false,
                                                        true,
                                                        List.of(section)),
                                                "section"));
        var manifest =
                exportJob(r, UUID.fromString(result.get("jobId").toString()))
                        .manifest()
                        .path("public");
        assertThat(manifest.path("sections")).hasSize(1);
        assertThat(manifest.path("sections").get(0).path("id").asText())
                .isEqualTo(section.toString());
        jdbc.update("update collector.sections set enabled=false where id=?", section);
        code(() -> export(r, "APPROVED_JSON", true, "hidden"), "NO_APPROVED_CONTENT");
        code(
                () ->
                        as(
                                f.tenant().actor(),
                                () ->
                                        exports()
                                                .create(
                                                        f.tenant().workspace(),
                                                        f.project().id(),
                                                        new com.ayaantrix.collector.export.dto
                                                                .ExportDtos.Create(
                                                                com.ayaantrix.collector.export.dto
                                                                        .ExportDtos.Format
                                                                        .APPROVED_JSON,
                                                                version,
                                                                false,
                                                                true,
                                                                List.of(UUID.randomUUID())),
                                                        "bad-section")),
                "VALIDATION_FAILED");
    }

    @Test
    void exportHttpContractsCsrfAndTenantBinding() throws Exception {
        var r = reviewFixture();
        decide(r, "APPROVE", "a");
        var f = r.f();
        String root = f.tenant().root() + "/projects/" + f.project().id() + "/exports";
        var body =
                json.writeValueAsString(
                        Map.of(
                                "format",
                                "APPROVED_JSON",
                                "expectedProjectVersion",
                                as(
                                        f.tenant().actor(),
                                        () -> detail(f.tenant(), f.project()).project().version()),
                                "includeOriginals",
                                false,
                                "acknowledgePartial",
                                true));
        mvc.perform(get(root)).andExpect(status().isUnauthorized());
        mvc.perform(
                        post(root)
                                .header("Authorization", "Bearer " + f.tenant().actor().access())
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isForbidden());
        mvc.perform(
                        post(root)
                                .with(csrf())
                                .header("Authorization", "Bearer " + f.tenant().actor().access())
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isBadRequest());
        var response =
                mvc.perform(
                                post(root)
                                        .with(csrf())
                                        .header(
                                                "Authorization",
                                                "Bearer " + f.tenant().actor().access())
                                        .header("Idempotency-Key", "http-export")
                                        .contentType("application/json")
                                        .content(body))
                        .andExpect(status().isAccepted())
                        .andExpect(header().exists("X-Request-ID"))
                        .andExpect(jsonPath("$.state").value("QUEUED"))
                        .andReturn();
        UUID id =
                UUID.fromString(
                        json.readTree(response.getResponse().getContentAsString())
                                .path("jobId")
                                .asText());
        code(
                () ->
                        as(
                                f.tenant().actor(),
                                () -> exports().get(f.tenant().workspace(), UUID.randomUUID(), id)),
                "NOT_FOUND");
        context.getBean(com.ayaantrix.collector.export.worker.ExportWorker.class).dispatchOne();
        var link =
                as(
                        f.tenant().actor(),
                        () -> exports().download(f.tenant().workspace(), f.project().id(), id));
        assertThat(link.get("url")).contains("X-Amz-Expires=60");
    }

    @Test
    void reviewApprovalReplayHistoryAndStaleDecision() {
        var r = reviewFixture();
        var f = r.f();
        var before =
                as(
                                f.tenant().actor(),
                                () ->
                                        submissions()
                                                .detail(
                                                        f.tenant().workspace(),
                                                        f.project().id(),
                                                        r.item(),
                                                        r.submitted().revisionId()))
                        .get("revision");
        var result = decide(r, "APPROVE", "approve");
        assertThat(((JsonNode) result.get("item")).path("state").asText()).isEqualTo("APPROVED");
        assertThat(json.readTree(json.writeValueAsString(decide(r, "APPROVE", "approve"))))
                .isEqualTo(json.readTree(json.writeValueAsString(result)));
        assertThat(
                        as(
                                        f.tenant().actor(),
                                        () ->
                                                submissions()
                                                        .detail(
                                                                f.tenant().workspace(),
                                                                f.project().id(),
                                                                r.item(),
                                                                r.submitted().revisionId()))
                                .get("revision"))
                .isEqualTo(before);
        assertThat(count(f.tenant(), "review_decisions")).isEqualTo(1);
        code(() -> decide(r, "REQUEST_CHANGES", "loser"), "ITEM_VERSION_CONFLICT");
        code(() -> decide(r, "REQUEST_CHANGES", "approve"), "IDEMPOTENCY_KEY_REUSED");
        assertThatThrownBy(
                        () ->
                                jdbc.update(
                                        "delete from collector.review_decisions where"
                                                + " revision_id=?",
                                        r.submitted().revisionId()))
                .isInstanceOf(Exception.class);
    }

    @Test
    void reviewChangeRequestRestoresDraftAndRetainsPreviousRevision() {
        var r = reviewFixture();
        var f = r.f();
        decide(r, "REQUEST_CHANGES", "changes");
        var read = json.valueToTree(drafts().read(r.cookie(), f.project().id(), r.item()));
        assertThat(read.path("item").path("state").asText()).isEqualTo("CHANGES_REQUESTED");
        assertThat(read.path("item").path("canEdit").asBoolean()).isTrue();
        assertThat(read.path("answer").path("value").path("text").asText())
                .isEqualTo("Exact submitted content");
        assertThat(read.path("item").path("comments").get(0).path("body").asText())
                .isEqualTo("Please clarify services.");
        save(f, r.cookie(), r.item(), text("Client updated content"), 2);
        var next = submit(f, r.cookie(), r.item(), 3, "resubmit");
        assertThat(next.revisionNo()).isEqualTo(2);
        assertThat(count(f.tenant(), "submission_revisions")).isEqualTo(2);
        code(() -> decide(r, "APPROVE", "old"), "ITEM_VERSION_CONFLICT");
    }

    @Test
    void reviewInternalCommentsNeverEnterClientRoutesOrProjections() throws Exception {
        var r = reviewFixture();
        var f = r.f();
        for (var visibility : com.ayaantrix.collector.review.dto.ReviewDtos.Visibility.values())
            as(
                    f.tenant().actor(),
                    () ->
                            reviews()
                                    .addAgencyComment(
                                            f.tenant().workspace(),
                                            f.project().id(),
                                            r.item(),
                                            new com.ayaantrix.collector.review.dto.ReviewDtos
                                                    .AgencyComment(
                                                    visibility
                                                                    == com.ayaantrix.collector
                                                                            .review.dto.ReviewDtos
                                                                            .Visibility.INTERNAL
                                                            ? "INTERNAL_ONLY_SECRET"
                                                            : "Visible feedback",
                                                    visibility)));
        assertThat(
                        json.writeValueAsString(
                                reviews().clientComments(r.cookie(), f.project().id(), r.item())))
                .contains("Visible feedback")
                .doesNotContain("INTERNAL_ONLY_SECRET", "visibility", "memberId");
        assertThat(json.writeValueAsString(drafts().read(r.cookie(), f.project().id(), r.item())))
                .doesNotContain("INTERNAL_ONLY_SECRET");
        mvc.perform(checklist(f, r.cookie()))
                .andExpect(status().isOk())
                .andExpect(
                        content()
                                .string(
                                        org.hamcrest.Matchers.not(
                                                org.hamcrest.Matchers.containsString(
                                                        "INTERNAL_ONLY_SECRET"))));
        var path =
                "/api/v1/client/projects/" + f.project().id() + "/items/" + r.item() + "/comments";
        mvc.perform(
                        post(path)
                                .with(csrf().asHeader())
                                .cookie(new jakarta.servlet.http.Cookie(cookieName(), r.cookie()))
                                .contentType("application/json")
                                .content(
                                        "{\"body\":\"Client"
                                                + " message\",\"visibility\":\"INTERNAL\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.comment.body").value("Client message"))
                .andExpect(jsonPath("$.comment.visibility").doesNotExist());
        assertThat(
                        jdbc.queryForObject(
                                "select visibility from collector.comments where body='Client"
                                        + " message' and project_id=?",
                                String.class,
                                f.project().id()))
                .isEqualTo("CLIENT");
    }

    @Test
    void reviewConcurrentDecisionsHaveOneWinner() throws Exception {
        var r = reviewFixture();
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var jobs = new ArrayList<Future<Boolean>>();
            for (String kind : List.of("APPROVE", "REQUEST_CHANGES"))
                jobs.add(
                        pool.submit(
                                () -> {
                                    start.await();
                                    try {
                                        decide(r, kind, kind);
                                        return true;
                                    } catch (ApiException e) {
                                        assertThat(e.getCode()).isEqualTo("ITEM_VERSION_CONFLICT");
                                        return false;
                                    }
                                }));
            start.countDown();
            int winners = 0;
            for (var job : jobs) if (job.get(20, TimeUnit.SECONDS)) winners++;
            assertThat(winners).isEqualTo(1);
        }
        assertThat(count(r.f().tenant(), "review_decisions")).isEqualTo(1);
    }

    @Test
    void reviewRollbackIsAtomic() {
        var r = reviewFixture();
        var f = r.f();
        long audit = count(f.tenant(), "audit_logs");
        assertThatThrownBy(
                        () ->
                                tx().executeWithoutResult(
                                                s -> {
                                                    decide(r, "REQUEST_CHANGES", "rollback");
                                                    throw new IllegalStateException(
                                                            "Synthetic rollback");
                                                }))
                .isInstanceOf(IllegalStateException.class);
        assertThat(count(f.tenant(), "review_decisions")).isZero();
        assertThat(count(f.tenant(), "comments")).isZero();
        assertThat(count(f.tenant(), "audit_logs")).isEqualTo(audit);
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.items where id=?",
                                String.class,
                                r.item()))
                .isEqualTo("SUBMITTED");
        assertThat(
                        json.<JsonNode>valueToTree(
                                        drafts().read(r.cookie(), f.project().id(), r.item()))
                                .path("answer")
                                .path("version")
                                .asLong())
                .isEqualTo(1);
        decide(r, "REQUEST_CHANGES", "rollback");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "reader",
                "exporter",
                "reviewer",
                "unassigned",
                "revokedMember",
                "revokedAssignment",
                "revokedSession",
                "foreign"
            })
    void reviewIndependentPermissions(String kind) {
        var r = reviewFixture();
        var f = r.f();
        var actor = actor();
        UUID member = UUID.randomUUID();
        jdbc.update(
                "insert into"
                    + " collector.workspace_members(id,workspace_id,user_id,role,state,created_at,updated_at)"
                    + " values(?,?,?,'MEMBER','ACTIVE',?,?)",
                member,
                f.tenant().workspace(),
                actor.id(),
                java.sql.Timestamp.from(NOW),
                java.sql.Timestamp.from(NOW));
        if (!kind.equals("unassigned"))
            jdbc.update(
                    "insert into"
                        + " collector.project_members(workspace_id,project_id,workspace_member_id,can_review,can_export,created_at,updated_at)"
                        + " values(?,?,?,?,?,?,?)",
                    f.tenant().workspace(),
                    f.project().id(),
                    member,
                    kind.equals("reviewer") || kind.startsWith("revoked"),
                    kind.equals("exporter"),
                    java.sql.Timestamp.from(NOW),
                    java.sql.Timestamp.from(NOW));
        if (kind.equals("revokedMember"))
            jdbc.update(
                    "update collector.workspace_members set state='DISABLED' where id=?", member);
        if (kind.equals("revokedAssignment"))
            jdbc.update(
                    "delete from collector.project_members where workspace_member_id=?", member);
        if (kind.equals("revokedSession"))
            context.getBean(AgencySessions.class).logoutAll(actor.jwt());
        var chosen = kind.equals("foreign") ? actor() : actor;
        if (kind.equals("reviewer")) {
            as(
                    chosen,
                    () ->
                            reviews()
                                    .decide(
                                            f.tenant().workspace(),
                                            f.project().id(),
                                            r.item(),
                                            decision(r, "APPROVE"),
                                            "member"));
            assertThat(count(f.tenant(), "review_decisions")).isEqualTo(1);
        } else {
            assertThatThrownBy(
                            () ->
                                    as(
                                            chosen,
                                            () ->
                                                    reviews()
                                                            .decide(
                                                                    f.tenant().workspace(),
                                                                    f.project().id(),
                                                                    r.item(),
                                                                    decision(r, "APPROVE"),
                                                                    "denied")))
                    .isInstanceOf(ApiException.class);
            assertThat(count(f.tenant(), "review_decisions")).isZero();
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"withdraw", "newSubmission", "archive", "membership", "assignment"})
    void reviewWaitingWriterRechecksCommittedState(String kind) throws Exception {
        var r = reviewFixture();
        var f = r.f();
        var held = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var reviewer = kind.equals("assignment") ? actor() : f.tenant().actor();
        if (kind.equals("assignment")) {
            UUID member = UUID.randomUUID();
            jdbc.update(
                    "insert into"
                        + " collector.workspace_members(id,workspace_id,user_id,role,state,created_at,updated_at)"
                        + " values(?,?,?,'MEMBER','ACTIVE',?,?)",
                    member,
                    f.tenant().workspace(),
                    reviewer.id(),
                    java.sql.Timestamp.from(NOW),
                    java.sql.Timestamp.from(NOW));
            jdbc.update(
                    "insert into"
                        + " collector.project_members(workspace_id,project_id,workspace_member_id,can_review,can_export,created_at,updated_at)"
                        + " values(?,?,?,true,false,?,?)",
                    f.tenant().workspace(),
                    f.project().id(),
                    member,
                    java.sql.Timestamp.from(NOW),
                    java.sql.Timestamp.from(NOW));
        }
        try (var pool = Executors.newFixedThreadPool(2)) {
            var writer =
                    pool.submit(
                            () ->
                                    tx().executeWithoutResult(
                                                    s -> {
                                                        jdbc.queryForObject(
                                                                "select id from"
                                                                    + " collector.workspaces where"
                                                                    + " id=? for update",
                                                                UUID.class,
                                                                f.tenant().workspace());
                                                        held.countDown();
                                                        try {
                                                            if (!release.await(
                                                                    15, TimeUnit.SECONDS))
                                                                throw new IllegalStateException(
                                                                        "Lock deadline");
                                                        } catch (InterruptedException e) {
                                                            throw new IllegalStateException(e);
                                                        }
                                                        switch (kind) {
                                                            case "withdraw", "newSubmission" -> {
                                                                submissions()
                                                                        .withdraw(
                                                                                r.cookie(),
                                                                                f.project().id(),
                                                                                r.item(),
                                                                                new com.ayaantrix
                                                                                        .collector
                                                                                        .submission
                                                                                        .dto
                                                                                        .SubmissionDtos
                                                                                        .Withdraw(
                                                                                        r.submitted()
                                                                                                .itemVersion()),
                                                                                "withdraw-race");
                                                                if (kind.equals("newSubmission")) {
                                                                    long structure =
                                                                            jdbc.queryForObject(
                                                                                    "select"
                                                                                        + " structure_version"
                                                                                        + " from"
                                                                                        + " collector.projects"
                                                                                        + " where"
                                                                                        + " id=?",
                                                                                    Long.class,
                                                                                    f.project()
                                                                                            .id());
                                                                    drafts().save(
                                                                                    r.cookie(),
                                                                                    f.project()
                                                                                            .id(),
                                                                                    r.item(),
                                                                                    saveCommand(
                                                                                            text(
                                                                                                    "New revision"),
                                                                                            1,
                                                                                            structure));
                                                                    submissions()
                                                                            .submit(
                                                                                    r.cookie(),
                                                                                    f.project()
                                                                                            .id(),
                                                                                    r.item(),
                                                                                    new com
                                                                                            .ayaantrix
                                                                                            .collector
                                                                                            .submission
                                                                                            .dto
                                                                                            .SubmissionDtos
                                                                                            .Submit(
                                                                                            2,
                                                                                            structure),
                                                                                    "next");
                                                                }
                                                            }
                                                            case "archive" ->
                                                                    jdbc.update(
                                                                            "update"
                                                                                + " collector.projects"
                                                                                + " set state='ARCHIVED'"
                                                                                + " where id=?",
                                                                            f.project().id());
                                                            case "membership" ->
                                                                    jdbc.update(
                                                                            "update"
                                                                                + " collector.workspace_members"
                                                                                + " set state='DISABLED'"
                                                                                + " where"
                                                                                + " workspace_id=?"
                                                                                + " and user_id=?",
                                                                            f.tenant().workspace(),
                                                                            f.tenant()
                                                                                    .actor()
                                                                                    .id());
                                                            default ->
                                                                    jdbc.update(
                                                                            "delete from"
                                                                                + " collector.project_members"
                                                                                + " where"
                                                                                + " workspace_id=?"
                                                                                + " and project_id=?",
                                                                            f.tenant().workspace(),
                                                                            f.project().id());
                                                        }
                                                    }));
            assertThat(held.await(10, TimeUnit.SECONDS)).isTrue();
            var review =
                    pool.submit(
                            () -> {
                                try {
                                    as(
                                            reviewer,
                                            () ->
                                                    reviews()
                                                            .decide(
                                                                    f.tenant().workspace(),
                                                                    f.project().id(),
                                                                    r.item(),
                                                                    decision(r, "APPROVE"),
                                                                    "waiting"));
                                    return false;
                                } catch (ApiException e) {
                                    return true;
                                }
                            });
            release.countDown();
            writer.get(20, TimeUnit.SECONDS);
            assertThat(review.get(20, TimeUnit.SECONDS)).isTrue();
        }
        assertThat(count(f.tenant(), "review_decisions")).isZero();
    }

    @Test
    void reviewHttpValidationCsrfCorrelationAndBinding() throws Exception {
        var r = reviewFixture();
        var f = r.f();
        String path =
                f.tenant().root()
                        + "/projects/"
                        + f.project().id()
                        + "/items/"
                        + r.item()
                        + "/review-decisions";
        String body = json.writeValueAsString(decision(r, "APPROVE"));
        mvc.perform(
                        post(path)
                                .header("Authorization", bearer(f.tenant()))
                                .header("Idempotency-Key", "http")
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isForbidden());
        mvc.perform(
                        post(path)
                                .with(csrf().asHeader())
                                .header("Idempotency-Key", "http")
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isUnauthorized());
        mvc.perform(
                        post(path)
                                .with(csrf().asHeader())
                                .header("Authorization", bearer(f.tenant()))
                                .header("Idempotency-Key", "reason")
                                .contentType("application/json")
                                .content(
                                        json.writeValueAsString(
                                                new com.ayaantrix.collector.review.dto.ReviewDtos
                                                        .Decide(
                                                        r.submitted().revisionId(),
                                                        r.submitted().itemVersion(),
                                                        com.ayaantrix.collector.review.dto
                                                                .ReviewDtos.Decision
                                                                .REQUEST_CHANGES,
                                                        " "))))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(
                        post(path)
                                .with(csrf().asHeader())
                                .header("Authorization", bearer(f.tenant()))
                                .header("Idempotency-Key", "http")
                                .header("X-Request-ID", "review-contract")
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isCreated())
                .andExpect(header().string("X-Request-ID", "review-contract"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.item.state").value("APPROVED"));
        mvc.perform(
                        post(path)
                                .with(csrf().asHeader())
                                .header("Authorization", bearer(f.tenant()))
                                .header("Idempotency-Key", "stale")
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ITEM_VERSION_CONFLICT"));
    }

    @ParameterizedTest
    @EnumSource(ProjectType.class)
    void reviewUsesSameExactRevisionWorkflowForEachProjectType(ProjectType type) {
        var f = fixture(type);
        String c = enter(f).credential();
        UUID i = textItem(f);
        save(f, c, i, text("Synthetic project information for the client team"), 0);
        var submitted = submit(f, c, i, 1, "type");
        var r = new ReviewFixture(f, c, i, submitted);
        var before = detail(f.tenant(), f.project()).project().progress();
        decide(r, "APPROVE", "approve-type");
        var after = detail(f.tenant(), f.project()).project().progress();
        assertThat(after.approvedRequired()).isEqualTo(before.approvedRequired() + 1);
        assertThat(after.submittedRequired()).isEqualTo(before.submittedRequired());
    }

    @Test
    void reviewRejectsForeignRevisionAndInvalidBodies() {
        var r = reviewFixture();
        var other = reviewFixture();
        var input =
                new com.ayaantrix.collector.review.dto.ReviewDtos.Decide(
                        other.submitted().revisionId(),
                        r.submitted().itemVersion(),
                        com.ayaantrix.collector.review.dto.ReviewDtos.Decision.APPROVE,
                        null);
        code(
                () ->
                        as(
                                r.f().tenant().actor(),
                                () ->
                                        reviews()
                                                .decide(
                                                        r.f().tenant().workspace(),
                                                        r.f().project().id(),
                                                        r.item(),
                                                        input,
                                                        "wrong-revision")),
                "ITEM_VERSION_CONFLICT");
        code(
                () ->
                        reviews()
                                .addClientComment(
                                        r.cookie(),
                                        r.f().project().id(),
                                        r.item(),
                                        new com.ayaantrix.collector.review.dto.ReviewDtos
                                                .ClientComment(" ")),
                "VALIDATION_FAILED");
        assertThat(count(r.f().tenant(), "review_decisions")).isZero();
        assertThat(count(r.f().tenant(), "comments")).isZero();
    }

    @Test
    void reviewReadOnlyPlanBlocksMutationsAndPreservesReads() {
        var r = reviewFixture();
        var f = r.f();
        jdbc.update(
                "update collector.subscriptions set state='READ_ONLY' where workspace_id=?",
                f.tenant().workspace());
        code(() -> decide(r, "APPROVE", "read-only"), "REVIEW_FORBIDDEN");
        code(
                () ->
                        reviews()
                                .addClientComment(
                                        r.cookie(),
                                        f.project().id(),
                                        r.item(),
                                        new com.ayaantrix.collector.review.dto.ReviewDtos
                                                .ClientComment("Read-only message")),
                "READ_ONLY");
        assertThat(reviews().clientComments(r.cookie(), f.project().id(), r.item()))
                .containsKey("data");
        assertThat(count(f.tenant(), "review_decisions")).isZero();
    }

    com.ayaantrix.collector.project.service.ProjectLifecycleService lifecycle() {
        return context.getBean(
                com.ayaantrix.collector.project.service.ProjectLifecycleService.class);
    }

    com.ayaantrix.collector.project.service.ProjectReopeningService reopening() {
        return context.getBean(
                com.ayaantrix.collector.project.service.ProjectReopeningService.class);
    }

    Fixture draftProject(ProjectType type) {
        var t = tenant();
        var p = create(t, type);
        var c =
                as(
                        t.actor(),
                        () ->
                                context.getBean(
                                                com.ayaantrix.collector.project.service
                                                        .ProjectClientService.class)
                                        .createContact(
                                                t.workspace(),
                                                p.id(),
                                                new com.ayaantrix.collector.project.dto
                                                        .ProjectClientDtos.ContactCreate(
                                                        t.client(),
                                                        "Publication client",
                                                        "publish-"
                                                                + UUID.randomUUID()
                                                                + "@example.test",
                                                        NOW.plus(Duration.ofDays(90)))));
        return new Fixture(t, p, c.id());
    }

    Map<String, Object> lifecycle(Fixture f, String action, String reason, String key) {
        return as(
                f.tenant().actor(),
                () ->
                        lifecycle()
                                .transition(
                                        f.tenant().workspace(),
                                        f.project().id(),
                                        action,
                                        new com.ayaantrix.collector.project.dto.ProjectLifecycleDtos
                                                .Command(
                                                detail(f.tenant(), f.project()).project().version(),
                                                reason),
                                        key));
    }

    Map<String, Object> reopenItem(ReviewFixture r, long version, String reason, String key) {
        return as(
                r.f().tenant().actor(),
                () ->
                        reopening()
                                .reopen(
                                        r.f().tenant().workspace(),
                                        r.f().project().id(),
                                        r.item(),
                                        new com.ayaantrix.collector.project.dto.ProjectLifecycleDtos
                                                .Reopen(version, reason),
                                        key));
    }

    @ParameterizedTest
    @EnumSource(ProjectType.class)
    void lifecyclePublishesWithRealClientAccessAndStableSnapshot(ProjectType type) {
        var f = draftProject(type);
        var before =
                jdbc.queryForObject(
                        "select definition::text from collector.project_snapshots where"
                                + " project_id=?",
                        String.class,
                        f.project().id());
        code(() -> invite(f), "PROJECT_NOT_PUBLISHED");
        var published = lifecycle(f, "publish", null, "publish");
        assertThat(published.get("projectState")).isEqualTo("ACTIVE");
        assertThat(published.get("publishedAt")).isNotNull();
        assertThat(published.get("publishedVersion")).isEqualTo(published.get("projectVersion"));
        String c = enter(f).credential();
        assertThat(portal().checklist(c, f.project().id())).containsKey("sections");
        assertThat(
                        jdbc.queryForObject(
                                "select definition::text from collector.project_snapshots where"
                                        + " project_id=?",
                                String.class,
                                f.project().id()))
                .isEqualTo(before);
    }

    @Test
    void lifecyclePublicationReplayAndStaleVersion() {
        var f = draftProject(ProjectType.WEBSITE);
        long version = detail(f.tenant(), f.project()).project().version();
        var cmd =
                new com.ayaantrix.collector.project.dto.ProjectLifecycleDtos.Command(version, null);
        var first =
                as(
                        f.tenant().actor(),
                        () ->
                                lifecycle()
                                        .transition(
                                                f.tenant().workspace(),
                                                f.project().id(),
                                                "publish",
                                                cmd,
                                                "same"));
        assertThat(
                        json.readTree(
                                json.writeValueAsString(
                                        as(
                                                f.tenant().actor(),
                                                () ->
                                                        lifecycle()
                                                                .transition(
                                                                        f.tenant().workspace(),
                                                                        f.project().id(),
                                                                        "publish",
                                                                        cmd,
                                                                        "same")))))
                .isEqualTo(json.readTree(json.writeValueAsString(first)));
        code(
                () ->
                        as(
                                f.tenant().actor(),
                                () ->
                                        lifecycle()
                                                .transition(
                                                        f.tenant().workspace(),
                                                        f.project().id(),
                                                        "pause",
                                                        cmd,
                                                        "stale")),
                "PROJECT_VERSION_CONFLICT");
        assertThat(count(f.tenant(), "project_lifecycle_events")).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"contact", "disabled"})
    void lifecyclePublicationRequiresUsableContactAndRequests(String missing) {
        var f = draftProject(ProjectType.WEBSITE);
        if (missing.equals("contact"))
            jdbc.update(
                    "update collector.project_contacts set state='REVOKED',revoked_at=now() where"
                            + " id=?",
                    f.contact());
        else
            jdbc.update(
                    "update collector.sections set enabled=false where project_id=?",
                    f.project().id());
        code(() -> lifecycle(f, "publish", null, "invalid"), "PUBLICATION_VALIDATION_FAILED");
        assertThat(detail(f.tenant(), f.project()).project().state().name()).isEqualTo("DRAFT");
        assertThat(count(f.tenant(), "project_lifecycle_events")).isZero();
    }

    @Test
    void lifecyclePauseReviewResumeArchiveRestoreAndClientWrites() {
        var f = draftProject(ProjectType.WEBSITE);
        lifecycle(f, "publish", null, "publish");
        String c = enter(f).credential();
        UUID i = textItem(f);
        save(f, c, i, text("Ready for review"), 0);
        var submitted = submit(f, c, i, 1, "submit");
        var r = new ReviewFixture(f, c, i, submitted);
        lifecycle(f, "pause", null, "pause");
        assertThat(portal().checklist(c, f.project().id())).containsKey("sections");
        code(() -> save(f, c, i, text("Blocked"), 1), "READ_ONLY");
        decide(r, "APPROVE", "paused-review");
        lifecycle(f, "resume", null, "resume");
        lifecycle(f, "archive", null, "archive");
        assertThat(portal().checklist(c, f.project().id())).containsKey("sections");
        assertThatThrownBy(() -> invite(f)).isInstanceOf(ApiException.class);
        lifecycle(f, "restore", null, "restore");
        assertThat(detail(f.tenant(), f.project()).project().state().name()).isEqualTo("PAUSED");
        lifecycle(f, "resume", null, "resume2");
    }

    @Test
    void lifecycleCompletionUsesVisibleRequiredApprovalsAndProjectReopenPreservesThem() {
        var r = reviewFixture();
        var f = r.f();
        code(() -> lifecycle(f, "complete", null, "incomplete"), "PROJECT_INCOMPLETE");
        // Existing schema disable operations preserve the submitted item; optional/hidden work is
        // excluded.
        jdbc.update(
                "update collector.items set"
                    + " required=false,schema_json=jsonb_set(schema_json,'{required}','false'::jsonb)"
                    + " where project_id=? and id<>?",
                f.project().id(),
                r.item());
        decide(r, "APPROVE", "approve");
        lifecycle(f, "complete", null, "complete");
        code(() -> lifecycle(f, "reopen", " ", "missing-reason"), "VALIDATION_FAILED");
        lifecycle(f, "reopen", "Client requested an update", "project-reopen");
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.items where id=?",
                                String.class,
                                r.item()))
                .isEqualTo("APPROVED");
        reopenItem(r, r.submitted().itemVersion() + 1, "Update the headline", "item-reopen");
        assertThat(detail(f.tenant(), f.project()).project().progress().approvedRequired())
                .isZero();
    }

    @Test
    void reopeningPreservesExactApprovalAndEnablesANewRevision() {
        var r = reviewFixture();
        var f = r.f();
        decide(r, "APPROVE", "approve");
        var before =
                as(
                        f.tenant().actor(),
                        () ->
                                submissions()
                                        .detail(
                                                f.tenant().workspace(),
                                                f.project().id(),
                                                r.item(),
                                                r.submitted().revisionId()));
        var input =
                new com.ayaantrix.collector.project.dto.ProjectLifecycleDtos.Reopen(
                        r.submitted().itemVersion() + 1, "Client requests updates");
        as(
                f.tenant().actor(),
                () ->
                        reopening()
                                .reopen(
                                        f.tenant().workspace(),
                                        f.project().id(),
                                        r.item(),
                                        input,
                                        "reopen"));
        as(
                f.tenant().actor(),
                () ->
                        reopening()
                                .reopen(
                                        f.tenant().workspace(),
                                        f.project().id(),
                                        r.item(),
                                        input,
                                        "reopen"));
        assertThat(drafts().read(r.cookie(), f.project().id(), r.item()).get("item"))
                .satisfies(n -> assertThat(((JsonNode) n).path("canEdit").asBoolean()).isTrue());
        save(f, r.cookie(), r.item(), text("Updated after approval"), 2);
        var next = submit(f, r.cookie(), r.item(), 3, "new");
        assertThat(next.revisionNo()).isEqualTo(2);
        assertThat(
                        as(
                                f.tenant().actor(),
                                () ->
                                        submissions()
                                                .detail(
                                                        f.tenant().workspace(),
                                                        f.project().id(),
                                                        r.item(),
                                                        r.submitted().revisionId())))
                .isEqualTo(before);
        assertThat(count(f.tenant(), "item_reopenings")).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"publish", "item"})
    void lifecycleConcurrentTransitionsHaveOneWinner(String kind) throws Exception {
        var f = draftProject(ProjectType.WEBSITE);
        ReviewFixture r;
        if (kind.equals("item")) {
            lifecycle(f, "publish", null, "pub");
            String c = enter(f).credential();
            UUID i = textItem(f);
            save(f, c, i, text("Submitted"), 0);
            r = new ReviewFixture(f, c, i, submit(f, c, i, 1, "s"));
            decide(r, "APPROVE", "a");
        } else r = null;
        long version = detail(f.tenant(), f.project()).project().version();
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var jobs = new ArrayList<Future<Boolean>>();
            for (int n = 0; n < 2; n++) {
                String key = "race" + n;
                jobs.add(
                        pool.submit(
                                () -> {
                                    start.await();
                                    try {
                                        if (r == null)
                                            as(
                                                    f.tenant().actor(),
                                                    () ->
                                                            lifecycle()
                                                                    .transition(
                                                                            f.tenant().workspace(),
                                                                            f.project().id(),
                                                                            "publish",
                                                                            new com.ayaantrix
                                                                                    .collector
                                                                                    .project.dto
                                                                                    .ProjectLifecycleDtos
                                                                                    .Command(
                                                                                    version, null),
                                                                            key));
                                        else
                                            reopenItem(
                                                    r,
                                                    r.submitted().itemVersion() + 1,
                                                    "Reopen",
                                                    key);
                                        return true;
                                    } catch (ApiException conflict) {
                                        assertThat(conflict.getStatus().value()).isEqualTo(409);
                                        return false;
                                    }
                                }));
            }
            start.countDown();
            int winners = 0;
            for (var job : jobs) if (job.get(20, TimeUnit.SECONDS)) winners++;
            assertThat(winners).isEqualTo(1);
        }
    }

    @Test
    void collectedDraftRevalidationRejectsDestructiveSchemaWithoutLosingAnswers() {
        var f = fixture();
        String c = enter(f).credential();
        UUID i = textItem(f);
        save(f, c, i, text("Retain this full answer"), 0);
        var d = detail(f.tenant(), f.project());
        var item = d.structure().getFirst().path("items").get(0);
        var incompatible = definition(item);
        ((ObjectNode) incompatible.path("validation")).put("maxLength", 2);
        code(
                () ->
                        as(
                                f.tenant().actor(),
                                () ->
                                        editor().patchItem(
                                                        f.tenant().workspace(),
                                                        f.project().id(),
                                                        i,
                                                        new ItemPatch(
                                                                incompatible,
                                                                d.project().structureVersion(),
                                                                false))),
                "DRAFT_REVALIDATION_FAILED");
        var compatible = definition(item);
        ((ObjectNode) compatible.path("validation")).put("maxLength", 180);
        as(
                f.tenant().actor(),
                () ->
                        editor().patchItem(
                                        f.tenant().workspace(),
                                        f.project().id(),
                                        i,
                                        new ItemPatch(
                                                compatible,
                                                d.project().structureVersion(),
                                                false)));
        assertThat(
                        json.<JsonNode>valueToTree(drafts().read(c, f.project().id(), i))
                                .at("/answer/value/text")
                                .asText())
                .isEqualTo("Retain this full answer");
    }

    @Test
    void collectedSubmittedSchemaRequiresReasonAndAtomicallyReopens() {
        var r = reviewFixture();
        var f = r.f();
        var before = detail(f.tenant(), f.project());
        var original = before.structure().getFirst().path("items").get(0);
        var def = definition(original);
        ((ObjectNode) def.path("validation")).put("maxLength", 180);
        code(
                () ->
                        as(
                                f.tenant().actor(),
                                () ->
                                        editor().patchItem(
                                                        f.tenant().workspace(),
                                                        f.project().id(),
                                                        r.item(),
                                                        new ItemPatch(
                                                                def,
                                                                before.project().structureVersion(),
                                                                false))),
                "REOPEN_REQUIRED");
        code(
                () ->
                        as(
                                f.tenant().actor(),
                                () ->
                                        editor().patchItem(
                                                        f.tenant().workspace(),
                                                        f.project().id(),
                                                        r.item(),
                                                        new ItemPatch(
                                                                def,
                                                                before.project().structureVersion(),
                                                                true))),
                "REOPEN_REQUIRED");
        as(
                f.tenant().actor(),
                () ->
                        editor().patchItem(
                                        f.tenant().workspace(),
                                        f.project().id(),
                                        r.item(),
                                        new ItemPatch(
                                                def,
                                                before.project().structureVersion(),
                                                true,
                                                "Revise the requested limit")));
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.items where id=?",
                                String.class,
                                r.item()))
                .isEqualTo("DRAFT");
        assertThat(count(f.tenant(), "submission_revisions")).isEqualTo(1);
        assertThat(count(f.tenant(), "item_reopenings")).isEqualTo(1);
        assertThat(detail(f.tenant(), f.project()).project().structureVersion())
                .isEqualTo(before.project().structureVersion() + 1);
    }

    @Test
    void collectedApprovedReopenProofAllowsCompatibleStructureAndRetainsSnapshot() {
        var r = reviewFixture();
        var f = r.f();
        decide(r, "APPROVE", "approve");
        reopenItem(r, r.submitted().itemVersion() + 1, "New wording needed", "open");
        var current = detail(f.tenant(), f.project());
        var def = definition(current.structure().getFirst().path("items").get(0));
        ((ObjectNode) def.path("validation")).put("maxLength", 180);
        as(
                f.tenant().actor(),
                () ->
                        editor().patchItem(
                                        f.tenant().workspace(),
                                        f.project().id(),
                                        r.item(),
                                        new ItemPatch(
                                                def, current.project().structureVersion(), false)));
        assertThat(count(f.tenant(), "review_decisions")).isEqualTo(1);
        assertThat(count(f.tenant(), "submission_revisions")).isEqualTo(1);
    }

    @Test
    void lifecycleAndReopeningRollbackIncludeHistoryAndVersions() {
        var f = draftProject(ProjectType.WEBSITE);
        assertThatThrownBy(
                        () ->
                                tx().executeWithoutResult(
                                                s1 -> {
                                                    lifecycle(f, "publish", null, "rollback");
                                                    throw new IllegalStateException(
                                                            "Synthetic rollback");
                                                }))
                .isInstanceOf(IllegalStateException.class);
        assertThat(detail(f.tenant(), f.project()).project().state().name()).isEqualTo("DRAFT");
        assertThat(count(f.tenant(), "project_lifecycle_events")).isZero();
        lifecycle(f, "publish", null, "rollback");
        var r = reviewFixture();
        decide(r, "APPROVE", "a");
        assertThatThrownBy(
                        () ->
                                tx().executeWithoutResult(
                                                st -> {
                                                    reopenItem(
                                                            r,
                                                            r.submitted().itemVersion() + 1,
                                                            "Reason",
                                                            "rollback-item");
                                                    throw new IllegalStateException(
                                                            "Synthetic rollback");
                                                }))
                .isInstanceOf(IllegalStateException.class);
        assertThat(count(r.f().tenant(), "item_reopenings")).isZero();
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.items where id=?",
                                String.class,
                                r.item()))
                .isEqualTo("APPROVED");
    }

    @Test
    void lifecycleHttpSecurityCorrelationAndExactStateContracts() throws Exception {
        var f = draftProject(ProjectType.WEBSITE);
        String path = f.tenant().root() + "/projects/" + f.project().id() + "/publish";
        var input =
                new com.ayaantrix.collector.project.dto.ProjectLifecycleDtos.Command(
                        detail(f.tenant(), f.project()).project().version(), null);
        String body = json.writeValueAsString(input);
        mvc.perform(
                        post(path)
                                .header("Authorization", bearer(f.tenant()))
                                .header("Idempotency-Key", "http")
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isForbidden());
        mvc.perform(
                        post(path)
                                .with(csrf().asHeader())
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isUnauthorized());
        mvc.perform(
                        post(path)
                                .with(csrf().asHeader())
                                .header("Authorization", bearer(f.tenant()))
                                .header("Idempotency-Key", "http")
                                .header("X-Request-ID", "publication-contract")
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.projectState").value("ACTIVE"))
                .andExpect(header().string("X-Request-ID", "publication-contract"));
        var other = tenant();
        assertThatThrownBy(
                        () ->
                                as(
                                        other.actor(),
                                        () ->
                                                lifecycle()
                                                        .transition(
                                                                f.tenant().workspace(),
                                                                f.project().id(),
                                                                "archive",
                                                                input,
                                                                "foreign")))
                .isInstanceOf(ApiException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"reviewer", "exporter", "unassigned", "revoked"})
    void reopeningRespectsIndependentPermissionAndOwnerLifecycle(String kind) {
        var r = reviewFixture();
        var f = r.f();
        decide(r, "APPROVE", "approved");
        var actor = actor();
        var member =
                new WorkspaceMember(f.tenant().workspace(), actor.id(), WorkspaceRole.MEMBER, NOW);
        context.getBean(WorkspaceMemberRepository.class).saveAndFlush(member);
        if (!kind.equals("unassigned"))
            jdbc.update(
                    "insert into"
                        + " collector.project_members(workspace_id,project_id,workspace_member_id,can_review,can_export,created_at,updated_at)"
                        + " values(?,?,?,?,?,?,?)",
                    f.tenant().workspace(),
                    f.project().id(),
                    member.id(),
                    kind.equals("reviewer"),
                    kind.equals("exporter"),
                    java.sql.Timestamp.from(NOW),
                    java.sql.Timestamp.from(NOW));
        if (kind.equals("revoked"))
            jdbc.update(
                    "update collector.workspace_members set state='DISABLED' where id=?",
                    member.id());
        var cmd =
                new com.ayaantrix.collector.project.dto.ProjectLifecycleDtos.Reopen(
                        r.submitted().itemVersion() + 1, "Client updates");
        if (kind.equals("reviewer"))
            as(
                    actor,
                    () ->
                            reopening()
                                    .reopen(
                                            f.tenant().workspace(),
                                            f.project().id(),
                                            r.item(),
                                            cmd,
                                            "reviewer"));
        else
            assertThatThrownBy(
                            () ->
                                    as(
                                            actor,
                                            () ->
                                                    reopening()
                                                            .reopen(
                                                                    f.tenant().workspace(),
                                                                    f.project().id(),
                                                                    r.item(),
                                                                    cmd,
                                                                    "denied")))
                    .isInstanceOf(ApiException.class);
        assertThatThrownBy(
                        () ->
                                as(
                                        actor,
                                        () ->
                                                lifecycle()
                                                        .transition(
                                                                f.tenant().workspace(),
                                                                f.project().id(),
                                                                "archive",
                                                                new com.ayaantrix.collector.project
                                                                        .dto.ProjectLifecycleDtos
                                                                        .Command(1, null),
                                                                "owner-only")))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void reopeningCannotRaceAStaleApprovalIntoTheNewDraft() throws Exception {
        var r = reviewFixture();
        decide(r, "APPROVE", "approved");
        try (var pool = Executors.newFixedThreadPool(2)) {
            var opening =
                    pool.submit(
                            () ->
                                    reopenItem(
                                            r,
                                            r.submitted().itemVersion() + 1,
                                            "Update content",
                                            "opening"));
            var stale =
                    pool.submit(
                            () -> {
                                code(
                                        () -> decide(r, "APPROVE", "stale-approval"),
                                        "ITEM_VERSION_CONFLICT");
                                return true;
                            });
            opening.get(20, TimeUnit.SECONDS);
            assertThat(stale.get(20, TimeUnit.SECONDS)).isTrue();
        }
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.items where id=?",
                                String.class,
                                r.item()))
                .isEqualTo("DRAFT");
        assertThat(count(r.f().tenant(), "review_decisions")).isEqualTo(1);
    }

    @Test
    void lifecyclePauseSerializesAgainstAutosaveWithoutLosingSavedText() throws Exception {
        var f = draftProject(ProjectType.WEBSITE);
        lifecycle(f, "publish", null, "pub");
        String c = enter(f).credential();
        UUID i = textItem(f);
        save(f, c, i, text("Preserved draft"), 0);
        long structure = detail(f.tenant(), f.project()).project().structureVersion();
        var held = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var writer =
                    pool.submit(
                            () ->
                                    tx().executeWithoutResult(
                                                    st -> {
                                                        lifecycle(f, "pause", null, "pause");
                                                        held.countDown();
                                                        try {
                                                            if (!release.await(
                                                                    12, TimeUnit.SECONDS))
                                                                throw new IllegalStateException(
                                                                        "Lock deadline");
                                                        } catch (InterruptedException e) {
                                                            throw new IllegalStateException(e);
                                                        }
                                                    }));
            assertThat(held.await(10, TimeUnit.SECONDS)).isTrue();
            var saving =
                    pool.submit(
                            () -> {
                                code(
                                        () ->
                                                drafts().save(
                                                                c,
                                                                f.project().id(),
                                                                i,
                                                                saveCommand(
                                                                        text("Late autosave"),
                                                                        1,
                                                                        structure)),
                                        "READ_ONLY");
                                return true;
                            });
            release.countDown();
            writer.get(20, TimeUnit.SECONDS);
            assertThat(saving.get(20, TimeUnit.SECONDS)).isTrue();
        }
        assertThat(
                        json.<JsonNode>valueToTree(drafts().read(c, f.project().id(), i))
                                .at("/answer/value/text")
                                .asText())
                .isEqualTo("Preserved draft");
    }

    com.ayaantrix.collector.reminder.service.ReminderService reminders() {
        return context.getBean(com.ayaantrix.collector.reminder.service.ReminderService.class);
    }

    com.ayaantrix.collector.reminder.worker.ReminderWorker reminderWorker() {
        return context.getBean(com.ayaantrix.collector.reminder.worker.ReminderWorker.class);
    }

    UUID remind(Fixture f, String key) {
        return as(
                f.tenant().actor(),
                () ->
                        reminders()
                                .send(
                                        f.tenant().workspace(),
                                        f.project().id(),
                                        new com.ayaantrix.collector.reminder.dto.ReminderDtos.Send(
                                                f.contact(), "EMAIL"),
                                        key));
    }

    @Test
    void reminderAcceptedIsNotDeliveredAndContainsOnlySafeLinks() {
        var f = fixture();
        enter(f);
        String key = UUID.randomUUID().toString();
        var id = remind(f, key);
        assertThat(remind(f, key)).isEqualTo(id);
        assertThat(reminderWorker().dispatchOne()).isTrue();
        var row = jdbc.queryForMap("select * from collector.reminder_deliveries where id=?", id);
        assertThat(row.get("state")).isEqualTo("ACCEPTED");
        assertThat(row.get("encrypted_payload")).isNull();
        var sent = context.getBean(ReminderMail.class).messages.getFirst();
        assertThat(sent.body())
                .contains("required content items", "/client/access#token=", "preferences=1")
                .doesNotContain("storage_key", "password");
        assertThat(sent.replyTo())
                .isEqualTo(
                        jdbc.queryForObject(
                                "select email_normalized from collector.users where id=?",
                                String.class,
                                f.tenant().actor().id()));
        var token = sent.body().split("token=")[1].split("\\s")[0];
        assertThat(access().exchange(input(token), null).projectId()).isEqualTo(f.project().id());
        assertThatThrownBy(() -> access().exchange(input(token), null))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> remind(f, UUID.randomUUID().toString()))
                .hasMessageContaining("DAILY_LIMIT");
    }

    @ParameterizedTest
    @ValueSource(strings = {"PAUSED", "COMPLETED", "ARCHIVED", "REVOKED", "OPT_OUT"})
    void reminderFinalEligibilityPreventsChase(String reason) {
        var f = fixture();
        var cookie = enter(f).credential();
        var id = remind(f, UUID.randomUUID().toString());
        switch (reason) {
            case "REVOKED" ->
                    as(
                            f.tenant().actor(),
                            () -> {
                                access().revoke(
                                                f.tenant().workspace(),
                                                f.project().id(),
                                                f.contact());
                                return true;
                            });
            case "OPT_OUT" ->
                    reminders()
                            .preferences(
                                    cookie,
                                    f.project().id(),
                                    new com.ayaantrix.collector.reminder.dto.ReminderDtos
                                            .ChangePreferences(false, "Asia/Kabul"));
            case "SUBMITTED" ->
                    jdbc.update(
                            "update collector.items set"
                                + " required=false,schema_json=jsonb_set(schema_json,'{required}','false'::jsonb)"
                                + " where workspace_id=? and project_id=?",
                            f.tenant().workspace(),
                            f.project().id());
            default ->
                    jdbc.update(
                            "update collector.projects set state=? where id=?",
                            reason,
                            f.project().id());
        }
        reminderWorker().dispatchOne();
        assertThat(context.getBean(ReminderMail.class).messages).isEmpty();
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isIn("SUPPRESSED", "CANCELLED");
    }

    @Test
    void reminderSubmittedItemsAreNotMissingClientWork() {
        var r = reviewFixture();
        jdbc.update(
                "update collector.items set"
                    + " required=false,schema_json=jsonb_set(schema_json,'{required}','false'::jsonb)"
                    + " where workspace_id=? and project_id=? and id<>?",
                r.f().tenant().workspace(),
                r.f().project().id(),
                r.item());
        var preview =
                as(
                        r.f().tenant().actor(),
                        () ->
                                reminders()
                                        .preview(
                                                r.f().tenant().workspace(),
                                                r.f().project().id(),
                                                new com.ayaantrix.collector.reminder.dto
                                                        .ReminderDtos.Send(
                                                        r.f().contact(), "EMAIL")));
        assertThat(preview.eligible()).isFalse();
        assertThat(preview.reasons()).contains("NO_CLIENT_ACTION");
    }

    @Test
    void reminderUnknownNeverResendsAndPolicyConflictsRollback() {
        var f = fixture();
        enter(f);
        var id = remind(f, UUID.randomUUID().toString());
        context.getBean(ReminderMail.class).outcome = "UNKNOWN";
        reminderWorker().dispatchOne();
        assertThat(reminderWorker().dispatchOne()).isFalse();
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("UNKNOWN");
        var policy =
                as(
                        f.tenant().actor(),
                        () -> reminders().policy(f.tenant().workspace(), f.project().id()));
        var command =
                new com.ayaantrix.collector.reminder.dto.ReminderDtos.Update(
                        policy.rules(), policy.timezone(), true, policy.version(), true);
        as(
                f.tenant().actor(),
                () -> reminders().update(f.tenant().workspace(), f.project().id(), command));
        assertThatThrownBy(
                        () ->
                                as(
                                        f.tenant().actor(),
                                        () ->
                                                reminders()
                                                        .update(
                                                                f.tenant().workspace(),
                                                                f.project().id(),
                                                                command)))
                .hasMessageContaining("Reload");
    }

    @Test
    void reminderConcurrentIdempotencyAndTenantIsolation() throws Exception {
        var f = fixture();
        enter(f);
        String key = UUID.randomUUID().toString();
        var pool = Executors.newFixedThreadPool(2);
        try {
            var a = pool.submit(() -> remind(f, key));
            var b = pool.submit(() -> remind(f, key));
            assertThat(a.get(20, TimeUnit.SECONDS)).isEqualTo(b.get(20, TimeUnit.SECONDS));
        } finally {
            pool.shutdownNow();
        }
        var other = tenant();
        assertThatThrownBy(
                        () ->
                                as(
                                        other.actor(),
                                        () ->
                                                reminders()
                                                        .policy(
                                                                f.tenant().workspace(),
                                                                f.project().id())))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void reminderClientPreferencesRequireOwnSessionAndCsrf() throws Exception {
        var f = fixture();
        String cookie = enter(f).credential(),
                path = "/api/v1/client/projects/" + f.project().id() + "/notification-preferences";
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(
                        put(path)
                                .cookie(new jakarta.servlet.http.Cookie(cookieName(), cookie))
                                .contentType("application/json")
                                .content("{\"emailEnabled\":false,\"timezone\":\"Asia/Kabul\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(
                        put(path)
                                .with(csrf())
                                .cookie(new jakarta.servlet.http.Cookie(cookieName(), cookie))
                                .contentType("application/json")
                                .content("{\"emailEnabled\":false,\"timezone\":\"Asia/Kabul\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.preferences.emailEnabled").value(false));
    }

    @Test
    void reminderWebhookSignatureDedupSuppressionAndUnknownSafety() throws Exception {
        var f = fixture();
        enter(f);
        var id = remind(f, UUID.randomUUID().toString());
        reminderWorker().dispatchOne();
        String provider =
                jdbc.queryForObject(
                        "select provider_id from collector.reminder_deliveries where id=?",
                        String.class,
                        id);
        String body =
                json.writeValueAsString(
                        Map.of(
                                "type",
                                "email.bounced",
                                "created_at",
                                NOW.toString(),
                                "data",
                                Map.of("email_id", provider)));
        String event = "msg_" + UUID.randomUUID(), time = Long.toString(NOW.getEpochSecond());
        var mac = javax.crypto.Mac.getInstance("HmacSHA256");
        mac.init(new javax.crypto.spec.SecretKeySpec(new byte[32], "HmacSHA256"));
        String sig =
                "v1,"
                        + Base64.getEncoder()
                                .encodeToString(
                                        mac.doFinal(
                                                (event + "." + time + "." + body)
                                                        .getBytes(
                                                                java.nio.charset.StandardCharsets
                                                                        .UTF_8)));
        mvc.perform(post("/api/v1/webhooks/email").contentType("application/json").content(body))
                .andExpect(status().isUnauthorized());
        for (int n = 0; n < 2; n++)
            mvc.perform(
                            post("/api/v1/webhooks/email")
                                    .header("svix-id", event)
                                    .header("svix-timestamp", time)
                                    .header("svix-signature", sig)
                                    .contentType("application/json")
                                    .content(body))
                    .andExpect(status().isOk());
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from collector.email_webhook_events where"
                                        + " event_id=?",
                                Integer.class,
                                event))
                .isEqualTo(1);
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("BOUNCED");
        assertThatThrownBy(() -> remind(f, UUID.randomUUID().toString()))
                .hasMessageContaining("EMAIL_SUPPRESSED");
    }

    @Test
    void reminderDefiniteFailuresRetryButAbandonedClaimsRemainUnknown() {
        var f = fixture();
        enter(f);
        var id = remind(f, UUID.randomUUID().toString());
        context.getBean(ReminderMail.class).outcome = "QUEUED";
        reminderWorker().dispatchOne();
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("QUEUED");
        context.getBean(TestClock.class).time = NOW.plusSeconds(31);
        context.getBean(ReminderMail.class).outcome = "ACCEPTED";
        reminderWorker().dispatchOne();
        var messages = context.getBean(ReminderMail.class).messages;
        assertThat(messages).hasSize(2);
        assertThat(messages.get(0)).isEqualTo(messages.get(1));
        var other = fixture();
        enter(other);
        var abandoned = remind(other, UUID.randomUUID().toString());
        var repo =
                context.getBean(
                        com.ayaantrix.collector.reminder.repository.ReminderRepository.class);
        assertThat(
                        tx().execute(t -> repo.claim(context.getBean(TestClock.class).instant()))
                                .orElseThrow()
                                .id())
                .isEqualTo(abandoned);
        context.getBean(TestClock.class).time = NOW.plusSeconds(152);
        reminderWorker().dispatchOne();
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                abandoned))
                .isEqualTo("UNKNOWN");
        assertThat(messages).hasSize(2);
    }

    @Test
    void reminderPolicyCancellationAndAuditRollback() {
        var f = fixture();
        enter(f);
        var id = remind(f, UUID.randomUUID().toString());
        var policy =
                as(
                        f.tenant().actor(),
                        () -> reminders().policy(f.tenant().workspace(), f.project().id()));
        try {
            tx().executeWithoutResult(
                            t -> {
                                as(
                                        f.tenant().actor(),
                                        () ->
                                                reminders()
                                                        .update(
                                                                f.tenant().workspace(),
                                                                f.project().id(),
                                                                new com.ayaantrix.collector.reminder
                                                                        .dto.ReminderDtos.Update(
                                                                        policy.rules(),
                                                                        "UTC",
                                                                        true,
                                                                        policy.version(),
                                                                        true)));
                                throw new IllegalStateException("rollback");
                            });
        } catch (IllegalStateException expected) {
        }
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("QUEUED");
        assertThat(
                        as(
                                        f.tenant().actor(),
                                        () ->
                                                reminders()
                                                        .policy(
                                                                f.tenant().workspace(),
                                                                f.project().id()))
                                .version())
                .isEqualTo(policy.version());
        jdbc.update(
                "update collector.projects set due_date=due_date+1 where id=?", f.project().id());
        assertThat(
                        as(
                                        f.tenant().actor(),
                                        () ->
                                                reminders()
                                                        .policy(
                                                                f.tenant().workspace(),
                                                                f.project().id()))
                                .version())
                .isEqualTo(policy.version() + 1);
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("CANCELLED");
    }

    @Test
    void reminderWeeklyLimitAppliesAcrossRecipients() {
        var f = fixture();
        enter(f);
        for (int i = 0; i < 6; i++) {
            Fixture target = f;
            if (i > 0) {
                var c =
                        as(
                                f.tenant().actor(),
                                () ->
                                        context.getBean(
                                                        com.ayaantrix.collector.project.service
                                                                .ProjectClientService.class)
                                                .createContact(
                                                        f.tenant().workspace(),
                                                        f.project().id(),
                                                        new com.ayaantrix.collector.project.dto
                                                                .ProjectClientDtos.ContactCreate(
                                                                f.tenant().client(),
                                                                "Other client",
                                                                "reminder-"
                                                                        + UUID.randomUUID()
                                                                        + "@example.test",
                                                                NOW.plus(Duration.ofDays(90)))));
                target = new Fixture(f.tenant(), f.project(), c.id());
                enter(target);
            }
            var current = target;
            if (i < 5) assertThat(remind(current, UUID.randomUUID().toString())).isNotNull();
            else
                assertThatThrownBy(() -> remind(current, UUID.randomUUID().toString()))
                        .hasMessageContaining("WEEKLY_LIMIT");
        }
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from collector.reminder_deliveries where"
                                        + " project_id=?",
                                Integer.class,
                                f.project().id()))
                .isEqualTo(5);
    }

    @Test
    void reminderSchedulerDeduplicatesAndNeverReplaysMissedBacklog() {
        var f = fixture();
        enter(f);
        jdbc.update(
                "update collector.projects set state='PAUSED' where id<>? and state='ACTIVE'",
                f.project().id());
        var now = context.getBean(TestClock.class).instant();
        jdbc.update(
                "update collector.projects set due_date=? where id=?",
                now.atZone(ZoneOffset.UTC).toLocalDate(),
                f.project().id());
        var p =
                as(
                        f.tenant().actor(),
                        () -> reminders().policy(f.tenant().workspace(), f.project().id()));
        var rules =
                List.of(-2, -1, 0).stream()
                        .map(
                                d ->
                                        new com.ayaantrix.collector.reminder.dto.ReminderDtos.Rule(
                                                UUID.randomUUID(), "EMAIL", d, "00:00", false))
                        .toList();
        as(
                f.tenant().actor(),
                () ->
                        reminders()
                                .update(
                                        f.tenant().workspace(),
                                        f.project().id(),
                                        new com.ayaantrix.collector.reminder.dto.ReminderDtos
                                                .Update(rules, "UTC", false, p.version(), true)));
        for (int i = 0; i < 3; i++) reminderWorker().schedule();
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from collector.reminder_deliveries where"
                                        + " project_id=?",
                                Integer.class,
                                f.project().id()))
                .isEqualTo(1);
        reminderWorker().dispatchOne();
        for (int i = 0; i < 3; i++) reminderWorker().schedule();
        assertThat(context.getBean(ReminderMail.class).messages).hasSize(1);
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from collector.reminder_deliveries where"
                                        + " project_id=?",
                                Integer.class,
                                f.project().id()))
                .isEqualTo(1);
    }

    @Test
    void reminderPreparationFailureRetriesWithoutLeakingOrDuplicatingTokens() {
        var f = fixture();
        enter(f);
        var id = remind(f, UUID.randomUUID().toString());
        int before =
                jdbc.queryForObject(
                        "select count(*) from collector.access_tokens where project_id=?",
                        Integer.class,
                        f.project().id());
        jdbc.update(
                "update collector.users set verified_at=null where id=?", f.tenant().actor().id());
        reminderWorker().dispatchOne();
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("QUEUED");
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from collector.access_tokens where project_id=?",
                                Integer.class,
                                f.project().id()))
                .isEqualTo(before);
        assertThat(context.getBean(ReminderMail.class).messages).isEmpty();
        jdbc.update(
                "update collector.users set verified_at=created_at where id=?",
                f.tenant().actor().id());
        context.getBean(TestClock.class).time = NOW.plusSeconds(31);
        reminderWorker().dispatchOne();
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("ACCEPTED");
        assertThat(context.getBean(ReminderMail.class).messages).hasSize(1);
    }

    com.ayaantrix.collector.sms.service.SmsService sms() {
        return context.getBean(com.ayaantrix.collector.sms.service.SmsService.class);
    }

    com.ayaantrix.collector.sms.worker.SmsVerificationWorker smsWorker() {
        return context.getBean(com.ayaantrix.collector.sms.worker.SmsVerificationWorker.class);
    }

    record SmsFixture(Fixture f, String cookie, String zone) {}

    SmsFixture smsFixture() {
        context.getBean(SmsFake.class).enabled = true;
        var day = NOW.atZone(ZoneOffset.UTC).toLocalDate();
        while (day.getDayOfWeek().getValue() > 5) day = day.plusDays(1);
        context.getBean(TestClock.class).time =
                day.atTime(NOW.atZone(ZoneOffset.UTC).toLocalTime()).toInstant(ZoneOffset.UTC);
        var f = fixture();
        String cookie = enter(f).credential();
        String zone =
                ZoneOffset.ofHours(
                                12
                                        - context.getBean(TestClock.class)
                                                .instant()
                                                .atZone(ZoneOffset.UTC)
                                                .getHour())
                        .getId();
        reminders()
                .preferences(
                        cookie,
                        f.project().id(),
                        new com.ayaantrix.collector.reminder.dto.ReminderDtos.ChangePreferences(
                                true, zone));
        return new SmsFixture(f, cookie, zone);
    }

    UUID smsStart(SmsFixture f) {
        return sms().start(
                        f.cookie(),
                        f.f().project().id(),
                        new com.ayaantrix.collector.sms.dto.SmsDtos.Start(
                                "+12025550123",
                                com.ayaantrix.collector.sms.service.SmsService.CONSENT_VERSION,
                                true),
                        UUID.randomUUID().toString());
    }

    void smsVerify(SmsFixture f, UUID id) {
        assertThat(smsWorker().dispatchOne()).isTrue();
        String message = context.getBean(SmsFake.class).messages.getLast();
        String code =
                java.util.regex.Pattern.compile("\\b[0-9]{6}\\b")
                        .matcher(message)
                        .results()
                        .findFirst()
                        .orElseThrow()
                        .group();
        assertThat(
                        sms().confirm(
                                        f.cookie(),
                                        f.f().project().id(),
                                        new com.ayaantrix.collector.sms.dto.SmsDtos.Confirm(
                                                id, code)))
                .isEqualTo("VERIFIED_OPTED_IN");
    }

    @Test
    void smsRequiresRecipientConsentTimezoneAndUSPhone() {
        var f = smsFixture();
        code(
                () ->
                        sms().start(
                                        f.cookie(),
                                        f.f().project().id(),
                                        new com.ayaantrix.collector.sms.dto.SmsDtos.Start(
                                                "+14165550123",
                                                com.ayaantrix.collector.sms.service.SmsService
                                                        .CONSENT_VERSION,
                                                true),
                                        "ca"),
                "VALIDATION_FAILED");
        code(
                () ->
                        sms().start(
                                        f.cookie(),
                                        f.f().project().id(),
                                        new com.ayaantrix.collector.sms.dto.SmsDtos.Start(
                                                "+12025550123", "old", true),
                                        "old"),
                "SMS_CONSENT_REQUIRED");
        code(
                () ->
                        sms().start(
                                        f.cookie(),
                                        f.f().project().id(),
                                        new com.ayaantrix.collector.sms.dto.SmsDtos.Start(
                                                "+12025550123",
                                                com.ayaantrix.collector.sms.service.SmsService
                                                        .CONSENT_VERSION,
                                                false),
                                        "no"),
                "SMS_CONSENT_REQUIRED");
        var id = smsStart(f);
        smsVerify(f, id);
        assertThat(sms().status(f.f().tenant().workspace(), f.f().project().id(), f.f().contact()))
                .isEqualTo("VERIFIED_OPTED_IN");
        assertThat(
                        jdbc.queryForObject(
                                "select encrypted_payload is null from collector.sms_verifications"
                                        + " where id=?",
                                Boolean.class,
                                id))
                .isTrue();
        sms().withdraw(f.cookie(), f.f().project().id());
        assertThat(reminders().preferences(f.cookie(), f.f().project().id()).emailEnabled())
                .isTrue();
        assertThat(sms().status(f.f().tenant().workspace(), f.f().project().id(), f.f().contact()))
                .isEqualTo("OPTED_OUT");
    }

    @Test
    void smsVerificationWrongAttemptsPersistAndTenantBindingHolds() {
        var f = smsFixture();
        var id = smsStart(f);
        smsWorker().dispatchOne();
        var other = smsFixture();
        code(
                () ->
                        sms().confirm(
                                        other.cookie(),
                                        f.f().project().id(),
                                        new com.ayaantrix.collector.sms.dto.SmsDtos.Confirm(
                                                id, "000000")),
                "NOT_FOUND");
        for (int i = 0; i < 5; i++)
            assertThat(
                            sms().confirm(
                                            f.cookie(),
                                            f.f().project().id(),
                                            new com.ayaantrix.collector.sms.dto.SmsDtos.Confirm(
                                                    id, "not-six-digits")))
                    .isEqualTo("INVALID_CODE");
        code(
                () ->
                        sms().confirm(
                                        f.cookie(),
                                        f.f().project().id(),
                                        new com.ayaantrix.collector.sms.dto.SmsDtos.Confirm(
                                                id, "000000")),
                "SMS_VERIFICATION_LIMIT");
        assertThat(
                        jdbc.queryForObject(
                                "select attempts from collector.sms_verifications where id=?",
                                Integer.class,
                                id))
                .isEqualTo(5);
    }

    @Test
    void smsOutboxUsesConfirmedConsentAndChargesExactSegments() {
        var f = smsFixture();
        smsVerify(f, smsStart(f));
        var project = f.f();
        UUID id =
                as(
                        project.tenant().actor(),
                        () ->
                                reminders()
                                        .send(
                                                project.tenant().workspace(),
                                                project.project().id(),
                                                new com.ayaantrix.collector.reminder.dto
                                                        .ReminderDtos.Send(
                                                        project.contact(), "SMS"),
                                                "sms-send"));
        reminderWorker().dispatchOne();
        String body = context.getBean(SmsFake.class).messages.getLast();
        assertThat(body).contains("Reply STOP", "/client/access#token=");
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("ACCEPTED");
        assertThat(
                        jdbc.queryForObject(
                                "select sms_segments from collector.reminder_deliveries where id=?",
                                Integer.class,
                                id))
                .isEqualTo(com.ayaantrix.collector.sms.service.SmsRules.segments(body));
        assertThat(
                        jdbc.queryForObject(
                                "select reserved_segments from collector.sms_usage where"
                                        + " workspace_id=?",
                                Integer.class,
                                project.tenant().workspace()))
                .isZero();
    }

    @Test
    void smsStopSuppressesScopeAndStartRequiresFreshClientVerification() {
        var f = smsFixture();
        smsVerify(f, smsStart(f));
        var repo = context.getBean(com.ayaantrix.collector.sms.repository.SmsRepository.class);
        String hash =
                com.ayaantrix.collector.common.repository.IdempotencyRepository.hash(
                        "+12025550123");
        tx().executeWithoutResult(
                        t ->
                                repo.inbound(
                                        "SM" + "1".repeat(32),
                                        context.getBean(SmsFake.class).scope(),
                                        hash,
                                        "STOP",
                                        context.getBean(TestClock.class).instant()));
        assertThat(sms().status(f.f().tenant().workspace(), f.f().project().id(), f.f().contact()))
                .isEqualTo("OPTED_OUT");
        context.getBean(TestClock.class).time =
                context.getBean(TestClock.class).instant().plusSeconds(61);
        tx().executeWithoutResult(
                        t ->
                                repo.inbound(
                                        "SM" + "2".repeat(32),
                                        context.getBean(SmsFake.class).scope(),
                                        hash,
                                        "START",
                                        context.getBean(TestClock.class).instant()));
        assertThat(sms().status(f.f().tenant().workspace(), f.f().project().id(), f.f().contact()))
                .isEqualTo("OPTED_OUT");
        smsVerify(f, smsStart(f));
        assertThat(sms().status(f.f().tenant().workspace(), f.f().project().id(), f.f().contact()))
                .isEqualTo("VERIFIED_OPTED_IN");
    }

    @Test
    void smsQuietWindowDefersWithoutSendingThenResumes() {
        var f = smsFixture();
        smsVerify(f, smsStart(f));
        var project = f.f();
        UUID id =
                as(
                        project.tenant().actor(),
                        () ->
                                reminders()
                                        .send(
                                                project.tenant().workspace(),
                                                project.project().id(),
                                                new com.ayaantrix.collector.reminder.dto
                                                        .ReminderDtos.Send(
                                                        project.contact(), "SMS"),
                                                "quiet-send"));
        var clock = context.getBean(TestClock.class);
        clock.time = clock.instant().plusSeconds(8 * 3600);
        assertThat(com.ayaantrix.collector.sms.service.SmsRules.quiet(clock.instant(), f.zone()))
                .isTrue();
        reminderWorker().dispatchOne();
        assertThat(context.getBean(SmsFake.class).messages).hasSize(1);
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("QUEUED");
        clock.time =
                com.ayaantrix.collector.sms.service.SmsRules.nextAllowed(clock.instant(), f.zone());
        reminderWorker().dispatchOne();
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("ACCEPTED");
    }

    @Test
    void smsUnknownVerificationNeverResendsOrActivates() {
        var f = smsFixture();
        var id = smsStart(f);
        context.getBean(SmsFake.class).outcome = "UNKNOWN";
        smsWorker().dispatchOne();
        assertThat(smsWorker().dispatchOne()).isFalse();
        assertThat(context.getBean(SmsFake.class).messages).hasSize(1);
        code(
                () ->
                        sms().confirm(
                                        f.cookie(),
                                        f.f().project().id(),
                                        new com.ayaantrix.collector.sms.dto.SmsDtos.Confirm(
                                                id, "123456")),
                "SMS_VERIFICATION_UNAVAILABLE");
        assertThat(
                        jdbc.queryForObject(
                                "select reserved_segments from collector.sms_usage where"
                                        + " workspace_id=?",
                                Integer.class,
                                f.f().tenant().workspace()))
                .isZero();
        assertThat(
                        jdbc.queryForObject(
                                "select used_segments from collector.sms_usage where"
                                        + " workspace_id=?",
                                Integer.class,
                                f.f().tenant().workspace()))
                .isEqualTo(1);
    }

    @Test
    void smsReservationConcurrencyAndRollback() throws Exception {
        var f = smsFixture();
        var repo = context.getBean(com.ayaantrix.collector.sms.repository.SmsRepository.class);
        var budget = sms().budget(f.f().tenant().workspace());
        var pool = Executors.newFixedThreadPool(2);
        try {
            var a =
                    pool.submit(
                            () ->
                                    tx().execute(
                                                    t ->
                                                            repo.reserve(
                                                                    f.f().tenant().workspace(),
                                                                    budget,
                                                                    20,
                                                                    2000)));
            var b =
                    pool.submit(
                            () ->
                                    tx().execute(
                                                    t ->
                                                            repo.reserve(
                                                                    f.f().tenant().workspace(),
                                                                    budget,
                                                                    20,
                                                                    2000)));
            assertThat(List.of(a.get(20, TimeUnit.SECONDS), b.get(20, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
        } finally {
            pool.shutdownNow();
        }
        var other = smsFixture();
        try {
            tx().executeWithoutResult(
                            t -> {
                                smsStart(other);
                                throw new IllegalStateException("rollback");
                            });
        } catch (IllegalStateException expected) {
        }
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from collector.sms_verifications where"
                                        + " workspace_id=?",
                                Integer.class,
                                other.f().tenant().workspace()))
                .isZero();
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from collector.sms_consents where workspace_id=?",
                                Integer.class,
                                other.f().tenant().workspace()))
                .isZero();
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from collector.sms_usage where workspace_id=?",
                                Integer.class,
                                other.f().tenant().workspace()))
                .isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"expired", "revoked"})
    void smsConfirmationRechecksGrantAndExpiry(String kind) {
        var f = smsFixture();
        var id = smsStart(f);
        smsWorker().dispatchOne();
        if (kind.equals("expired")) {
            context.getBean(TestClock.class).time =
                    context.getBean(TestClock.class).instant().plusSeconds(601);
            code(
                    () ->
                            sms().confirm(
                                            f.cookie(),
                                            f.f().project().id(),
                                            new com.ayaantrix.collector.sms.dto.SmsDtos.Confirm(
                                                    id, "123456")),
                    "SMS_VERIFICATION_UNAVAILABLE");
        } else {
            as(
                    f.f().tenant().actor(),
                    () -> {
                        access().revoke(
                                        f.f().tenant().workspace(),
                                        f.f().project().id(),
                                        f.f().contact());
                        return true;
                    });
            code(
                    () ->
                            sms().confirm(
                                            f.cookie(),
                                            f.f().project().id(),
                                            new com.ayaantrix.collector.sms.dto.SmsDtos.Confirm(
                                                    id, "123456")),
                    "CLIENT_ACCESS_UNAVAILABLE");
        }
    }

    @Test
    void smsHttpCsrfAndSignedStopAreRequiredAndDeduplicated() throws Exception {
        var f = smsFixture();
        String path = "/api/v1/client/projects/" + f.f().project().id() + "/sms/verification",
                body =
                        "{\"phoneE164\":\"+12025550123\",\"consent\":true,\"consentTextVersion\":\"2026-11-03\"}";
        mvc.perform(
                        post(path)
                                .header("Idempotency-Key", "csrf")
                                .cookie(new jakarta.servlet.http.Cookie(cookieName(), f.cookie()))
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isForbidden());
        smsVerify(f, smsStart(f));
        var params =
                new TreeMap<>(
                        Map.of(
                                "AccountSid",
                                "AC" + "0".repeat(32),
                                "MessagingServiceSid",
                                "MG" + "0".repeat(32),
                                "MessageSid",
                                "SM" + "3".repeat(32),
                                "From",
                                "+12025550123",
                                "OptOutType",
                                "STOP"));
        String url = "http://localhost/api/v1/webhooks/twilio/inbound";
        var signed = new StringBuilder(url);
        params.forEach((k, v) -> signed.append(k).append(v));
        var mac = javax.crypto.Mac.getInstance("HmacSHA1");
        mac.init(
                new javax.crypto.spec.SecretKeySpec(
                        "synthetic-webhook-secret"
                                .getBytes(java.nio.charset.StandardCharsets.UTF_8),
                        "HmacSHA1"));
        String sig =
                Base64.getEncoder()
                        .encodeToString(
                                mac.doFinal(
                                        signed.toString()
                                                .getBytes(
                                                        java.nio.charset.StandardCharsets.UTF_8)));
        String form =
                params.entrySet().stream()
                        .map(
                                e ->
                                        java.net.URLEncoder.encode(
                                                        e.getKey(),
                                                        java.nio.charset.StandardCharsets.UTF_8)
                                                + "="
                                                + java.net.URLEncoder.encode(
                                                        e.getValue(),
                                                        java.nio.charset.StandardCharsets.UTF_8))
                        .collect(java.util.stream.Collectors.joining("&"));
        mvc.perform(
                        post("/api/v1/webhooks/twilio/inbound")
                                .contentType("application/x-www-form-urlencoded")
                                .content(form))
                .andExpect(status().isUnauthorized());
        for (int n = 0; n < 2; n++)
            mvc.perform(
                            post("/api/v1/webhooks/twilio/inbound")
                                    .header("X-Twilio-Signature", sig)
                                    .contentType("application/x-www-form-urlencoded")
                                    .content(form))
                    .andExpect(status().isOk());
        assertThat(sms().status(f.f().tenant().workspace(), f.f().project().id(), f.f().contact()))
                .isEqualTo("OPTED_OUT");
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from collector.sms_events where event_key=?",
                                Integer.class,
                                "inbound:" + params.get("MessageSid")))
                .isEqualTo(1);
    }

    com.ayaantrix.collector.reminder.worker.DeliveryReconciliationWorker reconciliationWorker() {
        return context.getBean(
                com.ayaantrix.collector.reminder.worker.DeliveryReconciliationWorker.class);
    }

    com.ayaantrix.collector.reminder.service.DeliveryReconciliationService reconciliation() {
        return context.getBean(
                com.ayaantrix.collector.reminder.service.DeliveryReconciliationService.class);
    }

    com.ayaantrix.collector.reminder.repository.DeliveryReconciliationRepository
            reconciliationRepo() {
        return context.getBean(
                com.ayaantrix.collector.reminder.repository.DeliveryReconciliationRepository.class);
    }

    String contactEmail(Fixture f) {
        return jdbc.queryForObject(
                "select email_normalized from collector.project_contacts where workspace_id=? and"
                        + " project_id=? and id=?",
                String.class,
                f.tenant().workspace(),
                f.project().id(),
                f.contact());
    }

    UUID unknownEmail(Fixture f) {
        enter(f);
        context.getBean(ReminderMail.class).outcome = "UNKNOWN";
        var id = remind(f, UUID.randomUUID().toString());
        reminderWorker().dispatchOne();
        return id;
    }

    String providerFor(UUID id) {
        String provider = UUID.randomUUID().toString();
        jdbc.update(
                "update collector.reminder_deliveries set provider_id=? where id=?", provider, id);
        return provider;
    }

    @Test
    void reconcileKnownEmailUsesReadOnlyLookupAndNeverSendsAgain() {
        var f = fixture();
        var id = unknownEmail(f);
        String provider = providerFor(id);
        var mail = context.getBean(ReminderMail.class);
        mail.receipts.put(
                provider,
                new com.ayaantrix.collector.reminder.service.EmailSender.Receipt(
                        provider, contactEmail(f), "ACCEPTED"));
        assertThat(reconciliationWorker().reconcileOne()).isTrue();
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("ACCEPTED");
        assertThat(reconciliationWorker().reconcileOne()).isFalse();
        assertThat(mail.messages).hasSize(1);
        assertThat(mail.lookups.get()).isEqualTo(1);
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from collector.audit_logs where resource_id=? and"
                                        + " action like 'DELIVERY_RECONCILED_%'",
                                Integer.class, id))
                .isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"missing", "error", "mismatch"})
    void reconcileInconclusiveEvidenceStaysUnknown(String kind) {
        var f = fixture();
        var id = unknownEmail(f);
        String provider = providerFor(id);
        var mail = context.getBean(ReminderMail.class);
        if (kind.equals("error")) mail.lookupThrows = true;
        if (kind.equals("mismatch"))
            mail.receipts.put(
                    provider,
                    new com.ayaantrix.collector.reminder.service.EmailSender.Receipt(
                            provider, "other-tenant@example.test", "DELIVERED"));
        assertThat(reconciliationWorker().reconcileOne()).isTrue();
        assertThat(reconciliationWorker().reconcileOne()).isFalse();
        assertThat(reminderWorker().dispatchOne()).isFalse();
        assertThat(mail.messages).hasSize(1);
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("UNKNOWN");
        assertThat(mail.lookups.get()).isEqualTo(1);
        assertThat(
                        jdbc.queryForObject(
                                "select encrypted_payload from collector.reminder_deliveries where"
                                        + " id=?",
                                byte[].class,
                                id))
                .isNull();
    }

    @Test
    void reconcileWithoutProviderIdNeverGuesses() {
        var f = fixture();
        var id = unknownEmail(f);
        assertThat(reconciliationWorker().reconcileOne()).isFalse();
        assertThat(context.getBean(ReminderMail.class).lookups.get()).isZero();
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("UNKNOWN");
    }

    @Test
    void reconcileFencesLateLookupsAndRollsBackAuditWithState() throws Exception {
        var f = fixture();
        var id = unknownEmail(f);
        String provider = providerFor(id);
        var now = context.getBean(TestClock.class);
        var old =
                tx().execute(t -> reconciliationRepo().claim(true, false, false, now.instant()))
                        .orElseThrow();
        now.time = now.instant().plusSeconds(61);
        var current =
                tx().execute(t -> reconciliationRepo().claim(true, false, false, now.instant()))
                        .orElseThrow();
        var proof =
                Optional.of(
                        new com.ayaantrix.collector.reminder.service.EmailSender.Receipt(
                                provider, contactEmail(f), "DELIVERED"));
        reconciliation().lookup(old, proof);
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("UNKNOWN");
        try {
            tx().executeWithoutResult(
                            t -> {
                                reconciliation().lookup(current, proof);
                                throw new IllegalStateException("rollback");
                            });
        } catch (IllegalStateException expected) {
        }
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("UNKNOWN");
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from collector.audit_logs where resource_id=? and"
                                        + " action like 'DELIVERY_RECONCILED_%'",
                                Integer.class, id))
                .isZero();
        reconciliation().lookup(current, proof);
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("DELIVERED");
    }

    @Test
    void reconcileClaimsAreExclusiveAcrossPostgresTransactions() throws Exception {
        var f = fixture();
        var id = unknownEmail(f);
        providerFor(id);
        var pool = Executors.newFixedThreadPool(2);
        try {
            var a =
                    pool.submit(
                            () ->
                                    tx().execute(
                                                    t ->
                                                            reconciliationRepo()
                                                                    .claim(
                                                                            true,
                                                                            false,
                                                                            false,
                                                                            context.getBean(
                                                                                            TestClock
                                                                                                    .class)
                                                                                    .instant()))
                                            .isPresent());
            var b =
                    pool.submit(
                            () ->
                                    tx().execute(
                                                    t ->
                                                            reconciliationRepo()
                                                                    .claim(
                                                                            true,
                                                                            false,
                                                                            false,
                                                                            context.getBean(
                                                                                            TestClock
                                                                                                    .class)
                                                                                    .instant()))
                                            .isPresent());
            assertThat(List.of(a.get(20, TimeUnit.SECONDS), b.get(20, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
        } finally {
            pool.shutdownNow();
        }
    }

    ResultActions emailProof(
            UUID attempt,
            String provider,
            String recipient,
            String type,
            String event,
            String signatureOverride)
            throws Exception {
        String body =
                json.writeValueAsString(
                        Map.of(
                                "type",
                                type,
                                "created_at",
                                context.getBean(TestClock.class).instant().toString(),
                                "data",
                                Map.of(
                                        "email_id",
                                        provider,
                                        "to",
                                        List.of(recipient),
                                        "tags",
                                        Map.of("collector_delivery_id", attempt.toString()))));
        String time = Long.toString(context.getBean(TestClock.class).instant().getEpochSecond());
        var mac = javax.crypto.Mac.getInstance("HmacSHA256");
        mac.init(new javax.crypto.spec.SecretKeySpec(new byte[32], "HmacSHA256"));
        String signature =
                signatureOverride == null
                        ? "v1,"
                                + Base64.getEncoder()
                                        .encodeToString(
                                                mac.doFinal(
                                                        (event + "." + time + "." + body)
                                                                .getBytes(
                                                                        java.nio.charset
                                                                                .StandardCharsets
                                                                                .UTF_8)))
                        : signatureOverride;
        return mvc.perform(
                post("/api/v1/webhooks/email")
                        .header("svix-id", event)
                        .header("svix-timestamp", time)
                        .header("svix-signature", signature)
                        .contentType("application/json")
                        .content(body));
    }

    @Test
    void reconcileEmailWebhookCorrelatesLostReceiptAndRejectsWrongTenantOrSignature()
            throws Exception {
        var f = fixture();
        var id = unknownEmail(f);
        String provider = UUID.randomUUID().toString(), event = "msg_" + UUID.randomUUID();
        emailProof(id, provider, contactEmail(f), "email.delivered", event, "bad")
                .andExpect(status().isUnauthorized());
        var other = fixture();
        emailProof(id, provider, contactEmail(other), "email.delivered", event, null)
                .andExpect(status().isBadRequest());
        assertThat(
                        jdbc.queryForObject(
                                "select provider_id from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isNull();
        for (int n = 0; n < 2; n++)
            emailProof(id, provider, contactEmail(f), "email.delivered", event, null)
                    .andExpect(status().isOk());
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("DELIVERED");
        assertThat(context.getBean(ReminderMail.class).messages).hasSize(1);
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from collector.audit_logs where resource_id=? and"
                                        + " action like 'DELIVERY_RECONCILED_%'",
                                Integer.class, id))
                .isEqualTo(1);
    }

    ResultActions smsProof(UUID attempt, String sid, String to, String state, boolean tamper)
            throws Exception {
        String query = "attempt=" + attempt, url = "http://localhost/api/v1/webhooks/twilio/status";
        var params =
                new TreeMap<>(
                        Map.of(
                                "AccountSid",
                                "AC" + "0".repeat(32),
                                "MessagingServiceSid",
                                "MG" + "0".repeat(32),
                                "MessageSid",
                                sid,
                                "To",
                                to,
                                "MessageStatus",
                                state));
        var signed = new StringBuilder(url + "?" + query);
        params.forEach((k, v) -> signed.append(k).append(v));
        var mac = javax.crypto.Mac.getInstance("HmacSHA1");
        mac.init(
                new javax.crypto.spec.SecretKeySpec(
                        "synthetic-webhook-secret"
                                .getBytes(java.nio.charset.StandardCharsets.UTF_8),
                        "HmacSHA1"));
        String signature =
                Base64.getEncoder()
                        .encodeToString(
                                mac.doFinal(
                                        signed.toString()
                                                .getBytes(
                                                        java.nio.charset.StandardCharsets.UTF_8)));
        String form =
                params.entrySet().stream()
                        .map(
                                e ->
                                        java.net.URLEncoder.encode(
                                                        e.getKey(),
                                                        java.nio.charset.StandardCharsets.UTF_8)
                                                + "="
                                                + java.net.URLEncoder.encode(
                                                        e.getValue(),
                                                        java.nio.charset.StandardCharsets.UTF_8))
                        .collect(java.util.stream.Collectors.joining("&"));
        return mvc.perform(
                post("/api/v1/webhooks/twilio/status")
                        .queryParam(
                                "attempt",
                                tamper ? UUID.randomUUID().toString() : attempt.toString())
                        .header("X-Twilio-Signature", signature)
                        .contentType("application/x-www-form-urlencoded")
                        .content(form));
    }

    @Test
    void reconcileSmsLostReceiptPreservesStopAndSpentQuota() throws Exception {
        var f = smsFixture();
        smsVerify(f, smsStart(f));
        var project = f.f();
        context.getBean(SmsFake.class).outcome = "UNKNOWN";
        UUID id =
                as(
                        project.tenant().actor(),
                        () ->
                                reminders()
                                        .send(
                                                project.tenant().workspace(),
                                                project.project().id(),
                                                new com.ayaantrix.collector.reminder.dto
                                                        .ReminderDtos.Send(
                                                        project.contact(), "SMS"),
                                                "unknown-sms"));
        reminderWorker().dispatchOne();
        int spent =
                jdbc.queryForObject(
                        "select used_segments from collector.sms_usage where workspace_id=?",
                        Integer.class,
                        project.tenant().workspace());
        tx().executeWithoutResult(
                        t ->
                                context.getBean(
                                                com.ayaantrix.collector.sms.repository.SmsRepository
                                                        .class)
                                        .inbound(
                                                "SM" + "4".repeat(32),
                                                context.getBean(SmsFake.class).scope(),
                                                com.ayaantrix.collector.common.repository
                                                        .IdempotencyRepository.hash("+12025550123"),
                                                "STOP",
                                                context.getBean(TestClock.class).instant()));
        String sid = "SM" + "5".repeat(32);
        smsProof(id, sid, "+12025550123", "delivered", true).andExpect(status().isUnauthorized());
        smsProof(id, sid, "+12025550123", "delivered", false).andExpect(status().isOk());
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("DELIVERED");
        assertThat(
                        sms().status(
                                        project.tenant().workspace(),
                                        project.project().id(),
                                        project.contact()))
                .isEqualTo("OPTED_OUT");
        assertThat(
                        jdbc.queryForObject(
                                "select used_segments from collector.sms_usage where"
                                        + " workspace_id=?",
                                Integer.class,
                                project.tenant().workspace()))
                .isEqualTo(spent);
        assertThat(context.getBean(SmsFake.class).messages).hasSize(2);
    }

    @Test
    void reconcileVerificationDoesNotAcceptConsentWithoutTheCode() throws Exception {
        var f = smsFixture();
        var id = smsStart(f);
        context.getBean(SmsFake.class).outcome = "UNKNOWN";
        smsWorker().dispatchOne();
        String code =
                java.util.regex.Pattern.compile("\\b[0-9]{6}\\b")
                        .matcher(context.getBean(SmsFake.class).messages.getFirst())
                        .results()
                        .findFirst()
                        .orElseThrow()
                        .group();
        smsProof(id, "SM" + "6".repeat(32), "+12025550123", "sent", false)
                .andExpect(status().isOk());
        assertThat(sms().status(f.f().tenant().workspace(), f.f().project().id(), f.f().contact()))
                .isEqualTo("UNVERIFIED");
        assertThat(
                        sms().confirm(
                                        f.cookie(),
                                        f.f().project().id(),
                                        new com.ayaantrix.collector.sms.dto.SmsDtos.Confirm(
                                                id, code)))
                .isEqualTo("VERIFIED_OPTED_IN");
        assertThat(context.getBean(SmsFake.class).messages).hasSize(1);
    }

    @Test
    void reconcileEarlyCallbackSurvivesLostSendResponseWithoutAnotherProviderCall()
            throws Exception {
        var f = fixture();
        var id = unknownEmail(f);
        jdbc.update("update collector.reminder_deliveries set state='SENDING' where id=?", id);
        String provider = UUID.randomUUID().toString();
        emailProof(
                        id,
                        provider,
                        contactEmail(f),
                        "email.delivered",
                        "msg_" + UUID.randomUUID(),
                        null)
                .andExpect(status().isOk());
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("SENDING");
        jdbc.update("update collector.reminder_deliveries set state='UNKNOWN' where id=?", id);
        reconciliation().storedAttempt(id);
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.reminder_deliveries where id=?",
                                String.class,
                                id))
                .isEqualTo("DELIVERED");
        assertThat(context.getBean(ReminderMail.class).lookups.get()).isZero();
        assertThat(context.getBean(ReminderMail.class).messages).hasSize(1);
    }
}

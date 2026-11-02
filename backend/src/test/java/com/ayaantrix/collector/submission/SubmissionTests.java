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
        Mailbox teamMail() {
            return new Mailbox();
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
                                "--collector.delivery.worker-enabled=false",
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
        context.getBean(TestClock.class).time = NOW;
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
}

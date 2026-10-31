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

    private ConfigurableApplicationContext context;
    private SigningKeyFixture keys;
    private JdbcTemplate jdbc;
    private JsonMapper json;
    private MockMvc mvc;
    private String hash;

    @BeforeAll
    void start() throws Exception {
        keys = SigningKeyFixture.create(directory, "catalog-test");
        open();
        hash = context.getBean(PasswordEncoder.class).encode(PASSWORD);
    }

    ConfigurableApplicationContext start(String url) {
        return new SpringApplicationBuilder(CollectorApplication.class, Configuration.class)
                .profiles("test")
                .run(
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
                                + Base64.getEncoder().encodeToString(new byte[32]));
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
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
        context.getBean(TestClock.class).time = NOW;
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
        var t = tenant();
        var p = create(t, ProjectType.WEBSITE);
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
        assertThat(json.valueToTree(snapshot).at("/revision/schemaSnapshot/visible").asBoolean())
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
}

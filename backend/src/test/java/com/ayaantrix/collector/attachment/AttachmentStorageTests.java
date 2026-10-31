package com.ayaantrix.collector.attachment;

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
import org.junit.jupiter.params.provider.*;
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
class AttachmentStorageTests {
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

    private StorageFixture storageFixture;
    private ConfigurableApplicationContext context;
    private SigningKeyFixture keys;
    private JdbcTemplate jdbc;
    private JsonMapper json;
    private MockMvc mvc;
    private String hash;

    @BeforeAll
    void start() throws Exception {
        storageFixture = new StorageFixture();
        storageFixture.start();
        keys = SigningKeyFixture.create(directory, "catalog-test");
        open();
        hash = context.getBean(PasswordEncoder.class).encode(PASSWORD);
    }

    ConfigurableApplicationContext start(String url) {
        var args =
                new ArrayList<String>(
                        List.of(
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
        args.addAll(List.of(storageFixture.args()));
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
        if (storageFixture != null) storageFixture.close();
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

    com.ayaantrix.collector.attachment.service.AttachmentService files() {
        return context.getBean(com.ayaantrix.collector.attachment.service.AttachmentService.class);
    }

    com.ayaantrix.collector.attachment.service.AttachmentWorker worker() {
        return context.getBean(com.ayaantrix.collector.attachment.service.AttachmentWorker.class);
    }

    record Target(Fixture f, UUID item, String cookie, long structure) {}

    Target target(String type) {
        var f = fixture();
        UUID section = emptySection(f.tenant(), f.project());
        var definition = field("upload." + UUID.randomUUID().toString().replace("-", ""), type);
        var validation = definition.withObject("validation");
        validation
                .putArray("allowedExtensions")
                .add("txt")
                .add("png")
                .add("pdf")
                .add("docx")
                .add("svg")
                .add("jpg");
        UUID item = id(add(f.tenant(), f.project(), section, definition));
        return new Target(
                f,
                item,
                enter(f).credential(),
                detail(f.tenant(), f.project()).project().structureVersion());
    }

    com.ayaantrix.collector.attachment.dto.AttachmentDtos.Reserve input(
            Target t, String name, String type, int size) {
        return new com.ayaantrix.collector.attachment.dto.AttachmentDtos.Reserve(
                t.item(), name, type, (long) size, true);
    }

    com.ayaantrix.collector.attachment.dto.AttachmentDtos.Reservation reserve(
            Target t, String name, String type, byte[] bytes) {
        return files().reserve(
                        t.cookie(),
                        t.f().project().id(),
                        input(t, name, type, bytes.length),
                        UUID.randomUUID().toString());
    }

    void transfer(com.ayaantrix.collector.attachment.dto.AttachmentDtos.Reservation r, byte[] bytes)
            throws Exception {
        var request =
                java.net.http.HttpRequest.newBuilder(java.net.URI.create(r.putUrl()))
                        .PUT(java.net.http.HttpRequest.BodyPublishers.ofByteArray(bytes));
        r.requiredHeaders().forEach(request::header);
        var response =
                java.net.http.HttpClient.newBuilder()
                        .version(java.net.http.HttpClient.Version.HTTP_1_1)
                        .build()
                        .send(request.build(), java.net.http.HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode())
                .as(
                        response.body()
                                .replaceAll("(?s).*<Code>([^<]+)</Code>.*", "$1")
                                .replaceAll("(?s)<.*", "redacted storage error"))
                .isBetween(200, 299);
    }

    void finish(Target t, com.ayaantrix.collector.attachment.dto.AttachmentDtos.Reservation r) {
        files().finalizeUpload(
                        t.cookie(),
                        t.f().project().id(),
                        r.uploadId(),
                        UUID.randomUUID().toString());
        assertThat(worker().dispatchOne()).isTrue();
    }

    @Test
    void privateS3UploadRemainsQuarantinedUntilScannerAndSurvivesReload() throws Exception {
        var t = target("FILE");
        byte[] bytes =
                "Synthetic private document".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        var r = reserve(t, "notes.txt", "text/plain", bytes);
        assertThat(files().read(t.cookie(), t.f().project().id(), r.assetId()).state())
                .isEqualTo("RESERVED");
        assertThatThrownBy(
                        () ->
                                files().clientDownload(
                                                t.cookie(),
                                                t.f().project().id(),
                                                r.assetId(),
                                                "ORIGINAL"))
                .isInstanceOf(ApiException.class);
        transfer(r, bytes);
        finish(t, r);
        assertThat(files().read(t.cookie(), t.f().project().id(), r.assetId()).state())
                .as(
                        jdbc.queryForObject(
                                "select rejection_code from collector.file_assets where id=?",
                                String.class,
                                r.assetId()))
                .isEqualTo("READY");
        var url =
                files().clientDownload(t.cookie(), t.f().project().id(), r.assetId(), "ORIGINAL")
                        .get("url");
        var response =
                java.net.http.HttpClient.newHttpClient()
                        .send(
                                java.net.http.HttpRequest.newBuilder(java.net.URI.create(url))
                                        .GET()
                                        .build(),
                                java.net.http.HttpResponse.BodyHandlers.ofByteArray());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).isEqualTo(bytes);
        assertThat(response.headers().firstValue("Content-Disposition").orElse(""))
                .contains("attachment");
        context.close();
        open();
        assertThat(files().read(t.cookie(), t.f().project().id(), r.assetId()).state())
                .isEqualTo("READY");
    }

    byte[] text() {
        return "Synthetic document for storage acceptance"
                .getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    void denial(Runnable action, String code) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(
                        ApiException.class, e -> assertThat(e.getCode()).isEqualTo(code));
    }

    long reserved(Target t) {
        return jdbc.queryForObject(
                "select storage_reserved_bytes from collector.workspaces where id=?",
                Long.class,
                t.f().tenant().workspace());
    }

    @Test
    void duplicateIntentDoesNotReserveTwiceAndCancelledIntentCannotReplay() {
        var t = target("FILE");
        String key = UUID.randomUUID().toString();
        var in = input(t, "notes.txt", "text/plain", text().length);
        var a = files().reserve(t.cookie(), t.f().project().id(), in, key);
        var b = files().reserve(t.cookie(), t.f().project().id(), in, key);
        assertThat(b.assetId()).isEqualTo(a.assetId());
        assertThat(reserved(t)).isEqualTo(text().length);
        files().remove(t.cookie(), t.f().project().id(), a.uploadId(), true);
        files().remove(t.cookie(), t.f().project().id(), a.uploadId(), true);
        assertThat(reserved(t)).isZero();
        denial(() -> files().reserve(t.cookie(), t.f().project().id(), in, key), "UPLOAD_EXPIRED");
    }

    @Test
    void absentTransferCannotFinalizeAndMetadataContainsNoKeys() {
        var t = target("FILE");
        var r = reserve(t, "notes.txt", "text/plain", text());
        denial(
                () ->
                        files().finalizeUpload(
                                        t.cookie(),
                                        t.f().project().id(),
                                        r.uploadId(),
                                        UUID.randomUUID().toString()),
                "UPLOAD_NOT_AVAILABLE");
        assertThat(
                        json.writeValueAsString(
                                files().read(t.cookie(), t.f().project().id(), r.assetId())))
                .doesNotContain("staging/", "objects/", "putUrl", "secret");
    }

    @Test
    void uploadReferenceMustBeReadyAndBelongToThisQuestion() throws Exception {
        var t = target("FILE");
        var r = reserve(t, "notes.txt", "text/plain", text());
        var value = json.createObjectNode();
        value.putArray("assetIds").add(r.assetId().toString());
        denial(
                () ->
                        files().validateReferences(
                                        t.f().tenant().workspace(),
                                        t.f().project().id(),
                                        t.item(),
                                        value),
                "INVALID_ASSET_REFERENCE");
        transfer(r, text());
        finish(t, r);
        files().validateReferences(
                        t.f().tenant().workspace(), t.f().project().id(), t.item(), value);
        denial(
                () ->
                        files().validateReferences(
                                        t.f().tenant().workspace(),
                                        t.f().project().id(),
                                        UUID.randomUUID(),
                                        value),
                "INVALID_ASSET_REFERENCE");
        var other = target("FILE");
        denial(
                () ->
                        files().validateReferences(
                                        other.f().tenant().workspace(),
                                        other.f().project().id(),
                                        other.item(),
                                        value),
                "INVALID_ASSET_REFERENCE");
    }

    @Test
    void canonicalBytesCannotChangeWhenStagingCapabilityIsReused() throws Exception {
        var t = target("FILE");
        var bytes = text();
        var r = reserve(t, "notes.txt", "text/plain", bytes);
        transfer(r, bytes);
        finish(t, r);
        byte[] changed = bytes.clone();
        changed[0] = 'X';
        transfer(r, changed);
        var url =
                files().clientDownload(t.cookie(), t.f().project().id(), r.assetId(), "ORIGINAL")
                        .get("url");
        var response =
                java.net.http.HttpClient.newHttpClient()
                        .send(
                                java.net.http.HttpRequest.newBuilder(java.net.URI.create(url))
                                        .GET()
                                        .build(),
                                java.net.http.HttpResponse.BodyHandlers.ofByteArray());
        assertThat(response.body()).isEqualTo(bytes);
        String unsigned = url.substring(0, url.indexOf('?'));
        var denied =
                java.net.http.HttpClient.newHttpClient()
                        .send(
                                java.net.http.HttpRequest.newBuilder(java.net.URI.create(unsigned))
                                        .GET()
                                        .build(),
                                java.net.http.HttpResponse.BodyHandlers.discarding());
        assertThat(denied.statusCode()).isIn(401, 403);
    }

    @Test
    void missingCookieAndCsrfAreRejectedAtHttpBoundary() throws Exception {
        var t = target("FILE");
        String root = "/api/v1/client/projects/" + t.f().project().id();
        mvc.perform(
                        post(root + "/uploads")
                                .contentType("application/json")
                                .header("Idempotency-Key", UUID.randomUUID())
                                .content(
                                        json.writeValueAsString(
                                                input(t, "notes.txt", "text/plain", 10))))
                .andExpect(status().isForbidden());
        mvc.perform(
                        post(root + "/uploads")
                                .with(csrf().asHeader())
                                .contentType("application/json")
                                .header("Idempotency-Key", UUID.randomUUID())
                                .content(
                                        json.writeValueAsString(
                                                input(t, "notes.txt", "text/plain", 10))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void revokedGrantCannotFinalizeAndWorkerNeverReleasesFile() throws Exception {
        var t = target("FILE");
        var r = reserve(t, "notes.txt", "text/plain", text());
        transfer(r, text());
        files().finalizeUpload(
                        t.cookie(),
                        t.f().project().id(),
                        r.uploadId(),
                        UUID.randomUUID().toString());
        var f = t.f();
        as(
                f.tenant().actor(),
                () -> {
                    access().revoke(f.tenant().workspace(), f.project().id(), f.contact());
                    return null;
                });
        assertThatThrownBy(() -> files().read(t.cookie(), f.project().id(), r.assetId()))
                .isInstanceOf(ApiException.class);
        worker().dispatchOne();
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.file_assets where id=?",
                                String.class,
                                r.assetId()))
                .isEqualTo("FAILED");
        assertThat(reserved(t)).isZero();
    }

    @Test
    void archivedProjectRejectsNewReservations() {
        var t = target("FILE");
        jdbc.update(
                "update collector.projects set state='ARCHIVED' where id=?", t.f().project().id());
        assertThatThrownBy(() -> reserve(t, "notes.txt", "text/plain", text()))
                .isInstanceOf(ApiException.class);
        assertThat(reserved(t)).isZero();
    }

    @Test
    void abandonedReservationCleanupReleasesQuotaOnlyOnce() {
        var t = target("FILE");
        var r = reserve(t, "notes.txt", "text/plain", text());
        context.getBean(TestClock.class).time = NOW.plus(Duration.ofHours(25));
        worker().cleanup();
        worker().cleanup();
        assertThat(reserved(t)).isZero();
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.file_assets where id=?",
                                String.class,
                                r.assetId()))
                .isEqualTo("DELETED");
    }

    @Test
    void finalizedSizeMustMatchReservation() throws Exception {
        var t = target("FILE");
        var r = reserve(t, "notes.txt", "text/plain", text());
        var a =
                context.getBean(
                                com.ayaantrix.collector.attachment.repository.AttachmentRepository
                                        .class)
                        .find(t.f().tenant().workspace(), t.f().project().id(), r.assetId())
                        .orElseThrow();
        storageFixture
                .client()
                .putObject(
                        software.amazon.awssdk.services.s3.model.PutObjectRequest.builder()
                                .bucket(StorageFixture.STAGING)
                                .key(a.staging())
                                .build(),
                        software.amazon.awssdk.core.sync.RequestBody.fromBytes(new byte[] {1}));
        denial(
                () ->
                        files().finalizeUpload(
                                        t.cookie(),
                                        t.f().project().id(),
                                        r.uploadId(),
                                        UUID.randomUUID().toString()),
                "FILE_SIZE_MISMATCH");
        files().remove(t.cookie(), t.f().project().id(), r.uploadId(), true);
    }

    @Test
    void simultaneousQuotaReservationsSerializeInPostgres() throws Exception {
        var t = target("FILE");
        jdbc.update(
                "update collector.workspaces set storage_limit_bytes=? where id=?",
                text().length,
                t.f().tenant().workspace());
        try (var pool = Executors.newFixedThreadPool(2)) {
            var ready = new CountDownLatch(2);
            var go = new CountDownLatch(1);
            var outcomes = new ArrayList<Future<String>>();
            for (int n = 0; n < 2; n++)
                outcomes.add(
                        pool.submit(
                                () -> {
                                    ready.countDown();
                                    go.await();
                                    try {
                                        reserve(t, "notes.txt", "text/plain", text());
                                        return "reserved";
                                    } catch (ApiException e) {
                                        return e.getCode();
                                    }
                                }));
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            var results = new ArrayList<String>();
            for (var future : outcomes) results.add(future.get(30, TimeUnit.SECONDS));
            assertThat(results).containsExactlyInAnyOrder("reserved", "STORAGE_QUOTA_EXCEEDED");
            assertThat(reserved(t)).isEqualTo(text().length);
        }
    }

    @Test
    void actualClamdRejectsEicarBeforeItCanBeDownloaded() throws Exception {
        var t = target("FILE");
        byte[] bytes =
                ("X5O!P%@AP[4" + "\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*")
                        .getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        var r = reserve(t, "scanner-test.txt", "text/plain", bytes);
        transfer(r, bytes);
        finish(t, r);
        var a = files().read(t.cookie(), t.f().project().id(), r.assetId());
        assertThat(a.state()).isEqualTo("REJECTED");
        assertThat(a.rejectionCode()).isEqualTo("MALWARE_DETECTED");
        assertThat(reserved(t)).isZero();
        denial(
                () ->
                        files().clientDownload(
                                        t.cookie(), t.f().project().id(), r.assetId(), "ORIGINAL"),
                "ASSET_NOT_READY");
    }

    @Test
    void malformedContentIsRejectedWithoutReleasingItToDownloads() throws Exception {
        var t = target("FILE");
        byte[] bytes = {0, (byte) 255, 0};
        var r = reserve(t, "notes.txt", "text/plain", bytes);
        transfer(r, bytes);
        finish(t, r);
        assertThat(files().read(t.cookie(), t.f().project().id(), r.assetId()).state())
                .isEqualTo("REJECTED");
        assertThat(reserved(t)).isZero();
    }

    @Test
    void imageSandboxProducesBoundedAlphaPreservingVariantsWithoutOriginal() throws Exception {
        var t = target("IMAGE");
        var image =
                new java.awt.image.BufferedImage(
                        3000, 30, java.awt.image.BufferedImage.TYPE_INT_ARGB);
        image.setRGB(100, 10, 0x80ff0000);
        var out = new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(image, "png", out);
        var bytes = out.toByteArray();
        var in =
                new com.ayaantrix.collector.attachment.dto.AttachmentDtos.Reserve(
                        t.item(), "alpha.png", "image/png", (long) bytes.length, false);
        var r = files().reserve(t.cookie(), t.f().project().id(), in, UUID.randomUUID().toString());
        transfer(r, bytes);
        finish(t, r);
        var a = files().read(t.cookie(), t.f().project().id(), r.assetId());
        assertThat(a.state()).isEqualTo("READY");
        assertThat(a.availableVariants()).containsExactlyInAnyOrder("WORKING", "THUMBNAIL");
        assertThat(reserved(t)).isZero();
        for (String variant : a.availableVariants()) {
            var url =
                    files().clientDownload(t.cookie(), t.f().project().id(), r.assetId(), variant)
                            .get("url");
            var response =
                    java.net.http.HttpClient.newHttpClient()
                            .send(
                                    java.net.http.HttpRequest.newBuilder(java.net.URI.create(url))
                                            .GET()
                                            .build(),
                                    java.net.http.HttpResponse.BodyHandlers.ofByteArray());
            var decoded =
                    javax.imageio.ImageIO.read(new java.io.ByteArrayInputStream(response.body()));
            assertThat(decoded.getWidth()).isEqualTo(variant.equals("WORKING") ? 2560 : 480);
            assertThat(decoded.getColorModel().hasAlpha()).isTrue();
            assertThat(response.headers().firstValue("Content-Type").orElse(""))
                    .contains("application/octet-stream");
        }
        assertThatThrownBy(
                        () ->
                                files().clientDownload(
                                                t.cookie(),
                                                t.f().project().id(),
                                                r.assetId(),
                                                "ORIGINAL"))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void attachmentLimitCountsPendingReservations() {
        var t = target("FILE");
        jdbc.update(
                "update collector.items set"
                    + " schema_json=jsonb_set(schema_json,'{validation,maxFiles}','1'::jsonb) where"
                    + " id=?",
                t.item());
        var r = reserve(t, "first.txt", "text/plain", text());
        denial(() -> reserve(t, "second.txt", "text/plain", text()), "ATTACHMENT_LIMIT");
        files().remove(t.cookie(), t.f().project().id(), r.uploadId(), true);
        reserve(t, "replacement.txt", "text/plain", text());
        assertThat(reserved(t)).isEqualTo(text().length);
    }

    @Test
    void readyAttachmentMustBeUnselectedAndSavedBeforeRemoval() throws Exception {
        var t = target("FILE");
        var r = reserve(t, "notes.txt", "text/plain", text());
        transfer(r, text());
        finish(t, r);
        var answers =
                context.getBean(
                        com.ayaantrix.collector.collection.service.ClientAnswerService.class);
        var value = json.createObjectNode();
        value.putArray("assetIds").add(r.assetId().toString());
        var saved =
                answers.save(
                        t.cookie(),
                        t.f().project().id(),
                        t.item(),
                        new com.ayaantrix.collector.collection.dto.ClientAnswerDtos.Save(
                                value, 0L, t.structure(), UUID.randomUUID()));
        denial(
                () -> files().remove(t.cookie(), t.f().project().id(), r.assetId(), false),
                "ASSET_IN_USE");
        var empty = json.createObjectNode();
        empty.putArray("assetIds");
        answers.save(
                t.cookie(),
                t.f().project().id(),
                t.item(),
                new com.ayaantrix.collector.collection.dto.ClientAnswerDtos.Save(
                        empty, saved.answer().version(), t.structure(), UUID.randomUUID()));
        files().remove(t.cookie(), t.f().project().id(), r.assetId(), false);
        assertThat(files().read(t.cookie(), t.f().project().id(), r.assetId()).state())
                .isEqualTo("DELETED");
        denial(
                () ->
                        files().clientDownload(
                                        t.cookie(), t.f().project().id(), r.assetId(), "ORIGINAL"),
                "ASSET_NOT_READY");
        context.getBean(TestClock.class).time = NOW.plus(Duration.ofHours(25));
        worker().cleanup();
        assertThat(
                        jdbc.queryForObject(
                                "select storage_used_bytes from collector.workspaces where id=?",
                                Long.class,
                                t.f().tenant().workspace()))
                .isZero();
    }

    @Test
    void liveAgencyAssignmentAndTenantBoundariesProtectDownloads() throws Exception {
        var t = target("FILE");
        var r = reserve(t, "notes.txt", "text/plain", text());
        transfer(r, text());
        finish(t, r);
        var f = t.f();
        assertThat(
                        as(
                                f.tenant().actor(),
                                () ->
                                        files().agencyDownload(
                                                        f.tenant().workspace(),
                                                        f.project().id(),
                                                        r.assetId(),
                                                        "ORIGINAL")))
                .containsKey("url");
        var other = tenant();
        assertThatThrownBy(
                        () ->
                                as(
                                        other.actor(),
                                        () ->
                                                files().agencyDownload(
                                                                f.tenant().workspace(),
                                                                f.project().id(),
                                                                r.assetId(),
                                                                "ORIGINAL")))
                .isInstanceOf(ApiException.class);
        var member = actor();
        var m = new WorkspaceMember(f.tenant().workspace(), member.id(), WorkspaceRole.MEMBER, NOW);
        context.getBean(WorkspaceMemberRepository.class).saveAndFlush(m);
        assertThatThrownBy(
                        () ->
                                as(
                                        member,
                                        () ->
                                                files().agencyDownload(
                                                                f.tenant().workspace(),
                                                                f.project().id(),
                                                                r.assetId(),
                                                                "ORIGINAL")))
                .isInstanceOf(ApiException.class);
        jdbc.update(
                "insert into"
                    + " collector.project_members(id,workspace_id,project_id,workspace_member_id,can_review,can_export,created_at,updated_at)"
                    + " values(?,?,?,?,false,false,?,?)",
                UUID.randomUUID(),
                f.tenant().workspace(),
                f.project().id(),
                m.id(),
                java.sql.Timestamp.from(NOW),
                java.sql.Timestamp.from(NOW));
        assertThat(
                        as(
                                member,
                                () ->
                                        files().agencyDownload(
                                                        f.tenant().workspace(),
                                                        f.project().id(),
                                                        r.assetId(),
                                                        "ORIGINAL")))
                .containsKey("url");
        jdbc.update(
                "delete from collector.project_members where workspace_id=? and project_id=? and"
                        + " workspace_member_id=?",
                f.tenant().workspace(),
                f.project().id(),
                m.id());
        assertThatThrownBy(
                        () ->
                                as(
                                        member,
                                        () ->
                                                files().agencyDownload(
                                                                f.tenant().workspace(),
                                                                f.project().id(),
                                                                r.assetId(),
                                                                "ORIGINAL")))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void repeatedFinalizationDoesNotDuplicateJobsOrUsage() throws Exception {
        var t = target("FILE");
        var r = reserve(t, "notes.txt", "text/plain", text());
        transfer(r, text());
        String key = UUID.randomUUID().toString();
        files().finalizeUpload(t.cookie(), t.f().project().id(), r.uploadId(), key);
        files().finalizeUpload(t.cookie(), t.f().project().id(), r.uploadId(), key);
        worker().dispatchOne();
        files().finalizeUpload(t.cookie(), t.f().project().id(), r.uploadId(), key);
        assertThat(reserved(t)).isZero();
        assertThat(
                        jdbc.queryForObject(
                                "select storage_used_bytes from collector.workspaces where id=?",
                                Long.class,
                                t.f().tenant().workspace()))
                .isEqualTo(text().length);
        assertThat(
                        jdbc.queryForObject(
                                "select attempts from collector.file_assets where id=?",
                                Integer.class,
                                r.assetId()))
                .isEqualTo(1);
    }

    @Test
    void missingScannerCannotDeclareContentSafe() {
        var env =
                new org.springframework.mock.env.MockEnvironment()
                        .withProperty("CLAMAV_HOST", "127.0.0.1")
                        .withProperty("CLAMAV_PORT", "1");
        assertThatThrownBy(
                        () ->
                                new com.ayaantrix.collector.attachment.storage.ClamAvScanner(env)
                                        .verify(text()))
                .isInstanceOf(
                        com.ayaantrix.collector.attachment.storage.ClamAvScanner.ScanUnavailable
                                .class);
    }

    com.ayaantrix.collector.attachment.service.AttachmentWorker workerWith(
            com.ayaantrix.collector.attachment.storage.PrivateObjectStorage store,
            com.ayaantrix.collector.attachment.storage.MalwareScanner scanner) {
        return new com.ayaantrix.collector.attachment.service.AttachmentWorker(
                context.getBean(
                        com.ayaantrix.collector.attachment.repository.AttachmentRepository.class),
                context.getBean(
                        com.ayaantrix.collector.attachment.security.AttachmentAuthorization.class),
                context.getBean(
                        com.ayaantrix.collector.clientaccess.security.ClientAccessAuthorization
                                .class),
                store,
                scanner,
                context.getBean(
                        com.ayaantrix.collector.attachment.storage.SandboxedImageProcessor.class),
                context.getBean(
                        com.ayaantrix.collector.attachment.service.AttachmentValidationService
                                .class),
                context.getBean(PlatformTransactionManager.class),
                context.getBean(TestClock.class));
    }

    @Test
    void scannerOutageRetriesDurablyThenFailsClosedAndReleasesQuota() throws Exception {
        var t = target("FILE");
        var r = reserve(t, "notes.txt", "text/plain", text());
        transfer(r, text());
        files().finalizeUpload(
                        t.cookie(),
                        t.f().project().id(),
                        r.uploadId(),
                        UUID.randomUUID().toString());
        var unavailable =
                workerWith(
                        context.getBean(
                                com.ayaantrix.collector.attachment.storage.PrivateObjectStorage
                                        .class),
                        bytes -> {
                            throw new com.ayaantrix.collector.attachment.storage.ClamAvScanner
                                    .ScanUnavailable();
                        });
        for (int n = 0; n < 3; n++) {
            assertThat(unavailable.dispatchOne()).isTrue();
            context.getBean(TestClock.class).time =
                    context.getBean(TestClock.class).time.plusSeconds(31);
        }
        var a = files().read(t.cookie(), t.f().project().id(), r.assetId());
        assertThat(a.state()).isEqualTo("FAILED");
        assertThat(a.rejectionCode()).isEqualTo("SCANNER_UNAVAILABLE");
        assertThat(reserved(t)).isZero();
        denial(
                () ->
                        files().clientDownload(
                                        t.cookie(), t.f().project().id(), r.assetId(), "ORIGINAL"),
                "ASSET_NOT_READY");
    }

    @Test
    void missingObjectDuringProcessingNeverBecomesReady() throws Exception {
        var t = target("FILE");
        var r = reserve(t, "notes.txt", "text/plain", text());
        transfer(r, text());
        files().finalizeUpload(
                        t.cookie(),
                        t.f().project().id(),
                        r.uploadId(),
                        UUID.randomUUID().toString());
        var a =
                context.getBean(
                                com.ayaantrix.collector.attachment.repository.AttachmentRepository
                                        .class)
                        .find(t.f().tenant().workspace(), t.f().project().id(), r.assetId())
                        .orElseThrow();
        context.getBean(com.ayaantrix.collector.attachment.storage.PrivateObjectStorage.class)
                .deleteStaging(a.staging());
        worker().dispatchOne();
        assertThat(files().read(t.cookie(), t.f().project().id(), r.assetId()).state())
                .isEqualTo("PROCESSING");
        denial(
                () ->
                        files().clientDownload(
                                        t.cookie(), t.f().project().id(), r.assetId(), "ORIGINAL"),
                "ASSET_NOT_READY");
        files().remove(t.cookie(), t.f().project().id(), r.assetId(), false);
        assertThat(reserved(t)).isZero();
    }

    @Test
    void databaseFailureAfterPrivateWriteRollsBackReadyAndQuotaAtomically() throws Exception {
        var t = target("FILE");
        var r = reserve(t, "notes.txt", "text/plain", text());
        transfer(r, text());
        files().finalizeUpload(
                        t.cookie(),
                        t.f().project().id(),
                        r.uploadId(),
                        UUID.randomUUID().toString());
        jdbc.execute(
                "create function collector.test_reject_ready() returns trigger language plpgsql as"
                        + " $$ begin if new.id='"
                        + r.assetId()
                        + "'::uuid and new.state='READY' then raise exception 'synthetic rollback"
                        + " test'; end if; return new; end $$");
        jdbc.execute(
                "create trigger test_reject_ready before update on collector.file_assets for each"
                        + " row execute function collector.test_reject_ready()");
        try {
            worker().dispatchOne();
            assertThat(files().read(t.cookie(), t.f().project().id(), r.assetId()).state())
                    .isEqualTo("PROCESSING");
            assertThat(reserved(t)).isEqualTo(text().length);
            assertThat(
                            jdbc.queryForObject(
                                    "select storage_used_bytes from collector.workspaces where"
                                            + " id=?",
                                    Long.class,
                                    t.f().tenant().workspace()))
                    .isZero();
        } finally {
            jdbc.execute("drop trigger test_reject_ready on collector.file_assets");
            jdbc.execute("drop function collector.test_reject_ready()");
        }
        context.getBean(TestClock.class).time = NOW.plusSeconds(31);
        worker().dispatchOne();
        assertThat(files().read(t.cookie(), t.f().project().id(), r.assetId()).state())
                .isEqualTo("READY");
        assertThat(reserved(t)).isZero();
    }

    @Test
    void jpegSandboxIsVerifiedBeforeAdvertisingThatFormat() throws Exception {
        var t = target("IMAGE");
        var image =
                new java.awt.image.BufferedImage(40, 20, java.awt.image.BufferedImage.TYPE_INT_RGB);
        var out = new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(image, "jpeg", out);
        var r = reserve(t, "camera.jpg", "image/jpeg", out.toByteArray());
        transfer(r, out.toByteArray());
        finish(t, r);
        assertThat(files().read(t.cookie(), t.f().project().id(), r.assetId()).availableVariants())
                .containsExactlyInAnyOrder("ORIGINAL", "WORKING", "THUMBNAIL");
    }

    @Test
    void projectPausedAfterTransferPreventsWorkerPublication() throws Exception {
        var t = target("FILE");
        var r = reserve(t, "notes.txt", "text/plain", text());
        transfer(r, text());
        files().finalizeUpload(
                        t.cookie(),
                        t.f().project().id(),
                        r.uploadId(),
                        UUID.randomUUID().toString());
        jdbc.update(
                "update collector.projects set state='PAUSED' where id=?", t.f().project().id());
        worker().dispatchOne();
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.file_assets where id=?",
                                String.class,
                                r.assetId()))
                .isEqualTo("FAILED");
        assertThat(reserved(t)).isZero();
    }

    @Test
    void signedPutPreflightAllowsLocalHttpsBrowser() throws Exception {
        var t = target("FILE");
        var r = reserve(t, "notes.txt", "text/plain", text());
        var request =
                java.net.http.HttpRequest.newBuilder(java.net.URI.create(r.putUrl()))
                        .method("OPTIONS", java.net.http.HttpRequest.BodyPublishers.noBody())
                        .header("Origin", "https://127.0.0.1:5173")
                        .header("Access-Control-Request-Method", "PUT")
                        .header(
                                "Access-Control-Request-Headers",
                                String.join(",", r.requiredHeaders().keySet()))
                        .build();
        var response =
                java.net.http.HttpClient.newHttpClient()
                        .send(request, java.net.http.HttpResponse.BodyHandlers.discarding());
        assertThat(response.statusCode()).isBetween(200, 299);
        assertThat(response.headers().firstValue("Access-Control-Allow-Origin").orElse(""))
                .isEqualTo("https://127.0.0.1:5173");
    }

    @Test
    void crossProjectAndDisabledItemUploadIntentsAreDenied() {
        var t = target("FILE");
        var other = target("FILE");
        denial(
                () ->
                        files().reserve(
                                        other.cookie(),
                                        t.f().project().id(),
                                        input(t, "notes.txt", "text/plain", 10),
                                        UUID.randomUUID().toString()),
                "NOT_FOUND");
        jdbc.update("update collector.items set enabled=false where id=?", t.item());
        denial(() -> reserve(t, "notes.txt", "text/plain", text()), "NOT_FOUND");
        assertThat(reserved(t)).isZero();
    }

    @Test
    void expiredClientSessionCannotCreateAnotherReservation() {
        var t = target("FILE");
        context.getBean(TestClock.class).time = NOW.plus(Duration.ofHours(25));
        denial(() -> reserve(t, "notes.txt", "text/plain", text()), "CLIENT_ACCESS_UNAVAILABLE");
        assertThat(reserved(t)).isZero();
    }

    @Test
    void simultaneousQuestionCountLimitSerializesInPostgres() throws Exception {
        var t = target("FILE");
        jdbc.update(
                "update collector.items set"
                    + " schema_json=jsonb_set(schema_json,'{validation,maxFiles}','1'::jsonb) where"
                    + " id=?",
                t.item());
        try (var pool = Executors.newFixedThreadPool(2)) {
            var ready = new CountDownLatch(2);
            var go = new CountDownLatch(1);
            var futures = new ArrayList<Future<String>>();
            for (int n = 0; n < 2; n++)
                futures.add(
                        pool.submit(
                                () -> {
                                    ready.countDown();
                                    go.await();
                                    try {
                                        reserve(t, "notes.txt", "text/plain", text());
                                        return "reserved";
                                    } catch (ApiException e) {
                                        return e.getCode();
                                    }
                                }));
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            var outcomes = new ArrayList<String>();
            for (var future : futures) outcomes.add(future.get(30, TimeUnit.SECONDS));
            assertThat(outcomes).containsExactlyInAnyOrder("reserved", "ATTACHMENT_LIMIT");
            assertThat(reserved(t)).isEqualTo(text().length);
        }
    }

    @Test
    void staleAttachmentAnswerCannotOverwritePersistedSelection() throws Exception {
        var t = target("FILE");
        var r = reserve(t, "notes.txt", "text/plain", text());
        transfer(r, text());
        finish(t, r);
        var answers =
                context.getBean(
                        com.ayaantrix.collector.collection.service.ClientAnswerService.class);
        var selected = json.createObjectNode();
        selected.putArray("assetIds").add(r.assetId().toString());
        answers.save(
                t.cookie(),
                t.f().project().id(),
                t.item(),
                new com.ayaantrix.collector.collection.dto.ClientAnswerDtos.Save(
                        selected, 0L, t.structure(), UUID.randomUUID()));
        var empty = json.createObjectNode();
        empty.putArray("assetIds");
        denial(
                () ->
                        answers.save(
                                t.cookie(),
                                t.f().project().id(),
                                t.item(),
                                new com.ayaantrix.collector.collection.dto.ClientAnswerDtos.Save(
                                        empty, 0L, t.structure(), UUID.randomUUID())),
                "ANSWER_VERSION_CONFLICT");
        assertThat(
                        jdbc.queryForObject(
                                "select value_json::text from collector.answers where item_id=?",
                                String.class,
                                t.item()))
                .contains(r.assetId().toString());
    }

    @Test
    void collectedFilesProtectStableStructureIdsAndOriginalTemplateSnapshot() {
        var t = target("FILE");
        var before = detail(t.f().tenant(), t.f().project());
        reserve(t, "notes.txt", "text/plain", text());
        JsonNode item = null;
        for (var section : before.structure())
            for (var candidate : section.path("items"))
                if (id(candidate).equals(t.item())) item = candidate;
        var change = definition(item);
        change.withObject("validation").put("maxFiles", 1);
        var patch = new ItemPatch(change, before.project().structureVersion(), false);
        denial(
                () ->
                        as(
                                t.f().tenant().actor(),
                                () ->
                                        editor().patchItem(
                                                        t.f().tenant().workspace(),
                                                        t.f().project().id(),
                                                        t.item(),
                                                        patch)),
                "REOPEN_REQUIRED");
        var after = detail(t.f().tenant(), t.f().project());
        assertThat(after.project().structureVersion())
                .isEqualTo(before.project().structureVersion());
        var ids = new HashSet<UUID>();
        for (var section : after.structure())
            for (var candidate : section.path("items")) ids.add(id(candidate));
        assertThat(ids).contains(t.item());
    }

    @Test
    void repeatedProcessCrashesCannotRestartVerificationForever() throws Exception {
        var t = target("FILE");
        var r = reserve(t, "notes.txt", "text/plain", text());
        transfer(r, text());
        files().finalizeUpload(
                        t.cookie(),
                        t.f().project().id(),
                        r.uploadId(),
                        UUID.randomUUID().toString());
        jdbc.update(
                "update collector.file_assets set attempts=3,lease_owner=?,lease_until=? where"
                        + " id=?",
                UUID.randomUUID(),
                java.sql.Timestamp.from(NOW.minusSeconds(1)),
                r.assetId());
        worker().dispatchOne();
        var a = files().read(t.cookie(), t.f().project().id(), r.assetId());
        assertThat(a.state()).isEqualTo("FAILED");
        assertThat(a.rejectionCode()).isEqualTo("PROCESSING_ATTEMPTS_EXHAUSTED");
        assertThat(reserved(t)).isZero();
        assertThat(
                        jdbc.queryForObject(
                                "select attempts from collector.file_assets where id=?",
                                Integer.class,
                                r.assetId()))
                .isEqualTo(3);
        denial(
                () ->
                        files().clientDownload(
                                        t.cookie(), t.f().project().id(), r.assetId(), "ORIGINAL"),
                "ASSET_NOT_READY");
    }

    @Test
    void readOnlyPlanBlocksNewUploadsAndWorkerReleaseButKeepsReadyDownloads() throws Exception {
        var t = target("FILE");
        var ready = reserve(t, "ready.txt", "text/plain", text());
        transfer(ready, text());
        finish(t, ready);
        var pending = reserve(t, "pending.txt", "text/plain", text());
        transfer(pending, text());
        files().finalizeUpload(
                        t.cookie(),
                        t.f().project().id(),
                        pending.uploadId(),
                        UUID.randomUUID().toString());
        jdbc.update(
                "update collector.subscriptions set state='READ_ONLY' where workspace_id=?",
                t.f().tenant().workspace());
        denial(() -> reserve(t, "new.txt", "text/plain", text()), "READ_ONLY");
        assertThat(
                        files().clientDownload(
                                        t.cookie(),
                                        t.f().project().id(),
                                        ready.assetId(),
                                        "ORIGINAL"))
                .containsKey("url");
        var checklist = portal().checklist(t.cookie(), t.f().project().id());
        assertThat(json.valueToTree(checklist).path("capabilities").path("canUpload").asBoolean())
                .isFalse();
        worker().dispatchOne();
        assertThat(files().read(t.cookie(), t.f().project().id(), pending.assetId()).state())
                .isEqualTo("FAILED");
        assertThat(reserved(t)).isZero();
    }

    @Test
    void downloadAndRemovalRacePreservesTheShortCapabilityBoundary() throws Exception {
        var t = target("FILE");
        var r = reserve(t, "notes.txt", "text/plain", text());
        transfer(r, text());
        finish(t, r);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var ready = new CountDownLatch(2);
            var go = new CountDownLatch(1);
            var download =
                    pool.submit(
                            () -> {
                                ready.countDown();
                                go.await();
                                try {
                                    return files().clientDownload(
                                                    t.cookie(),
                                                    t.f().project().id(),
                                                    r.assetId(),
                                                    "ORIGINAL");
                                } catch (ApiException e) {
                                    return Map.of("error", e.getCode());
                                }
                            });
            var remove =
                    pool.submit(
                            () -> {
                                ready.countDown();
                                go.await();
                                files().remove(
                                                t.cookie(),
                                                t.f().project().id(),
                                                r.assetId(),
                                                false);
                                return true;
                            });
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            assertThat(remove.get(30, TimeUnit.SECONDS)).isTrue();
            var outcome = download.get(30, TimeUnit.SECONDS);
            if (outcome.containsKey("error"))
                assertThat(outcome.get("error")).isEqualTo("ASSET_NOT_READY");
            else {
                String expiry =
                        Arrays.stream(
                                        java.net
                                                .URI
                                                .create(outcome.get("url"))
                                                .getRawQuery()
                                                .split("&"))
                                .filter(value -> value.startsWith("X-Amz-Expires="))
                                .map(value -> value.substring("X-Amz-Expires=".length()))
                                .findFirst()
                                .orElse("");
                assertThat(expiry).isEqualTo("60");
            }
        }
        denial(
                () ->
                        files().clientDownload(
                                        t.cookie(), t.f().project().id(), r.assetId(), "ORIGINAL"),
                "ASSET_NOT_READY");
        assertThat(reserved(t)).isZero();
    }

    @Test
    void sessionLogoutDuringTransferPreventsFinalization() throws Exception {
        var t = target("FILE");
        var r = reserve(t, "notes.txt", "text/plain", text());
        transfer(r, text());
        access().logout(t.cookie());
        denial(
                () ->
                        files().finalizeUpload(
                                        t.cookie(),
                                        t.f().project().id(),
                                        r.uploadId(),
                                        UUID.randomUUID().toString()),
                "CLIENT_ACCESS_UNAVAILABLE");
        assertThat(
                        jdbc.queryForObject(
                                "select state from collector.file_assets where id=?",
                                String.class,
                                r.assetId()))
                .isEqualTo("RESERVED");
        context.getBean(TestClock.class).time = NOW.plus(Duration.ofHours(25));
        worker().cleanup();
        assertThat(reserved(t)).isZero();
    }

    @Test
    void twoAuthorizedClientContactsShareOnlyTheSameProjectAssetAndDraftVersion() throws Exception {
        var t = target("FILE");
        var r = reserve(t, "notes.txt", "text/plain", text());
        transfer(r, text());
        finish(t, r);
        var f = t.f();
        var contact =
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
                                                        "Second synthetic client",
                                                        "second-"
                                                                + UUID.randomUUID()
                                                                + "@example.test",
                                                        NOW.plus(Duration.ofDays(90)))));
        var second = enter(new Fixture(f.tenant(), f.project(), contact.id())).credential();
        assertThat(files().read(second, f.project().id(), r.assetId()).state()).isEqualTo("READY");
        var value = json.createObjectNode();
        value.putArray("assetIds").add(r.assetId().toString());
        var answers =
                context.getBean(
                        com.ayaantrix.collector.collection.service.ClientAnswerService.class);
        answers.save(
                second,
                f.project().id(),
                t.item(),
                new com.ayaantrix.collector.collection.dto.ClientAnswerDtos.Save(
                        value, 0L, t.structure(), UUID.randomUUID()));
        denial(
                () ->
                        answers.save(
                                t.cookie(),
                                f.project().id(),
                                t.item(),
                                new com.ayaantrix.collector.collection.dto.ClientAnswerDtos.Save(
                                        value, 0L, t.structure(), UUID.randomUUID())),
                "ANSWER_VERSION_CONFLICT");
        assertThat(
                        jdbc.queryForObject(
                                "select uploaded_by_contact_id from collector.file_assets where"
                                    + " id=?",
                                UUID.class,
                                r.assetId()))
                .isEqualTo(f.contact());
    }

    @Test
    void stalledStorageRequestsHaveABoundedDeadline() throws Exception {
        var release = new CountDownLatch(1);
        var accepted = new CountDownLatch(1);
        var executor = Executors.newCachedThreadPool();
        var server =
                com.sun.net.httpserver.HttpServer.create(
                        new java.net.InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(executor);
        server.createContext(
                "/",
                exchange -> {
                    accepted.countDown();
                    try {
                        release.await(60, TimeUnit.SECONDS);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        exchange.close();
                    }
                });
        server.start();
        var env =
                new org.springframework.mock.env.MockEnvironment()
                        .withProperty("collector.storage.enabled", "true")
                        .withProperty(
                                "S3_ENDPOINT", "http://127.0.0.1:" + server.getAddress().getPort())
                        .withProperty("S3_ACCESS_KEY", StorageFixture.ACCESS)
                        .withProperty("S3_SECRET_KEY", StorageFixture.SECRET)
                        .withProperty("S3_BUCKET_STAGING", StorageFixture.STAGING)
                        .withProperty("S3_BUCKET_PRIVATE", StorageFixture.PRIVATE);
        try (var storage =
                new com.ayaantrix.collector.attachment.storage.S3PrivateObjectStorage(env)) {
            long started = System.nanoTime();
            assertThatThrownBy(() -> storage.head("synthetic-stalled-object"))
                    .isInstanceOf(software.amazon.awssdk.core.exception.SdkClientException.class);
            assertThat(accepted.getCount()).isZero();
            assertThat(Duration.ofNanos(System.nanoTime() - started))
                    .isLessThan(Duration.ofSeconds(55));
        } finally {
            release.countDown();
            server.stop(0);
            executor.shutdownNow();
        }
    }
}

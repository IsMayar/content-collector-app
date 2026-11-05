package com.ayaantrix.collector.export.service;

import com.ayaantrix.collector.attachment.repository.AttachmentRepository;
import com.ayaantrix.collector.attachment.storage.PrivateObjectStorage;
import com.ayaantrix.collector.collection.repository.ClientAnswerRepository;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.repository.*;
import com.ayaantrix.collector.export.dto.ExportDtos.*;
import com.ayaantrix.collector.export.repository.ExportRepository;
import com.ayaantrix.collector.project.repository.*;
import com.ayaantrix.collector.project.security.ProjectAuthorization;
import com.ayaantrix.collector.project.service.ProjectDraftVisibility;
import com.ayaantrix.collector.submission.repository.SubmissionRepository;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.*;
import java.util.*;

@Service
@Transactional
public class ExportService {
    private final ProjectAuthorization auth;
    private final ProjectRepository projects;
    private final ProjectStructureRepository structures;
    private final ClientAnswerRepository answers;
    private final SubmissionRepository submissions;
    private final AttachmentRepository assets;
    private final ExportRepository jobs;
    private final PrivateObjectStorage storage;
    private final IdempotencyRepository requests;
    private final AuditRepository audit;
    private final JsonMapper json;
    private final Clock clock;

    public ExportService(
            ProjectAuthorization auth,
            ProjectRepository projects,
            ProjectStructureRepository structures,
            ClientAnswerRepository answers,
            SubmissionRepository submissions,
            AttachmentRepository assets,
            ExportRepository jobs,
            PrivateObjectStorage storage,
            IdempotencyRepository requests,
            AuditRepository audit,
            JsonMapper json,
            Clock clock) {
        this.auth = auth;
        this.projects = projects;
        this.structures = structures;
        this.answers = answers;
        this.submissions = submissions;
        this.assets = assets;
        this.jobs = jobs;
        this.storage = storage;
        this.requests = requests;
        this.audit = audit;
        this.json = json;
        this.clock = clock;
    }

    private com.ayaantrix.collector.workspace.security.WorkspaceAuthorization.Access access(
            UUID w, UUID p) {
        var a = auth.access(w, false);
        auth.readableProject(a, p);
        var project = projects.lockForStructure(w, p).orElseThrow(ProjectAuthorization::missing);
        if (project.state().name().equals("DELETION_PENDING")) throw ProjectAuthorization.missing();
        if (!auth.permissions(a, p, false).canExport())
            throw error(HttpStatus.FORBIDDEN, "EXPORT_FORBIDDEN", "Export permission is required.");
        return a;
    }

    public Map<String, Object> create(UUID w, UUID p, Create input, String key) {
        var a = access(w, p);
        if (!storage.enabled())
            throw error(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "EXPORT_UNAVAILABLE",
                    "Private export storage is unavailable.");
        var now = clock.instant();
        String route = "projects/" + p + "/exports",
                hash = IdempotencyRepository.hash(json.writeValueAsString(input));
        var replay = requests.replay(w, a.member().userId(), route, key, hash, now);
        if (replay.isPresent())
            return json.readValue(
                    replay.get(),
                    new tools.jackson.core.type.TypeReference<Map<String, Object>>() {});
        var project =
                projects.findByWorkspaceIdAndId(w, p).orElseThrow(ProjectAuthorization::missing);
        if (input.format() == null || input.expectedProjectVersion() == null)
            throw error(
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_FAILED",
                    "Select a format and project version.");
        if (project.version().longValue() != input.expectedProjectVersion().longValue())
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "PROJECT_VERSION_CONFLICT",
                    "Reload the project before exporting.",
                    project.version());
        var all = structures.structure(w, p);
        Set<UUID> selected = new HashSet<>();
        if (input.sectionIds() != null) {
            selected.addAll(input.sectionIds());
            if (selected.isEmpty()
                    || selected.size() != input.sectionIds().size()
                    || !all.stream()
                            .map(s -> UUID.fromString(s.path("id").asText()))
                            .toList()
                            .containsAll(selected))
                throw error(
                        HttpStatus.UNPROCESSABLE_ENTITY,
                        "VALIDATION_FAILED",
                        "Select valid project sections.");
        }
        var values = new HashMap<UUID, JsonNode>();
        answers.drafts(w, p).forEach((id, d) -> values.put(id, d.answer().value()));
        UUID id = UUID.randomUUID();
        var manifest =
                json.createObjectNode()
                        .put("exportId", id.toString())
                        .put("projectId", p.toString())
                        .put("projectTitle", project.title())
                        .put("projectType", project.projectType().name())
                        .put("projectVersion", project.version())
                        .put("structureVersion", project.structureVersion())
                        .put("createdAt", now.toString())
                        .put("includeOriginals", input.includeOriginals());
        var sections = manifest.putArray("sections");
        var sources = json.createArrayNode();
        boolean partial = false;
        long fileBytes = 0;
        for (var section : all) {
            boolean included =
                    selected.isEmpty()
                            || selected.contains(UUID.fromString(section.path("id").asText()));
            var out =
                    json.createObjectNode()
                            .put("id", section.path("id").asText())
                            .put("key", section.path("key").asText())
                            .put("title", section.path("title").asText());
            var items = out.putArray("items");
            for (var item : section.path("items")) {
                if (!ProjectDraftVisibility.visible(section, item, all, values)) continue;
                boolean approved =
                        item.path("state").asText().equals("APPROVED")
                                && !item.path("currentRevisionId").isNull();
                if (item.path("required").asBoolean() && (!approved || !included)) partial = true;
                if (!approved || !included) continue;
                UUID iid = UUID.fromString(item.path("id").asText()),
                        rid = UUID.fromString(item.path("currentRevisionId").asText());
                if (!jobs.approved(w, p, iid, rid))
                    throw error(
                            HttpStatus.CONFLICT,
                            "EXPORT_REVISION_CONFLICT",
                            "An approved revision is unavailable. Reload the project.");
                var revision = submissions.detail(w, p, iid, rid);
                var exported =
                        json.createObjectNode()
                                .put("itemId", iid.toString())
                                .put("key", revision.path("itemKey").asText())
                                .put("revisionId", rid.toString())
                                .put("revisionNo", revision.path("revisionNo").asInt())
                                .put(
                                        "structureVersion",
                                        revision.path("structureVersion").asLong());
                exported.set("schema", revision.path("schemaSnapshot"));
                exported.set("value", revision.path("valueSnapshot"));
                var files = exported.putArray("files");
                for (var reference : revision.path("assets")) {
                    UUID aid = UUID.fromString(reference.path("id").asText());
                    var asset = assets.find(w, p, aid).orElseThrow(ProjectAuthorization::missing);
                    if (!asset.state().equals("READY") || !asset.item().equals(iid))
                        throw error(
                                HttpStatus.CONFLICT,
                                "EXPORT_ASSET_UNAVAILABLE",
                                "A verified file is unavailable.");
                    var variants = new LinkedHashMap<String, String>();
                    if (asset.variants().has("WORKING"))
                        variants.put("WORKING", asset.variants().path("WORKING").asText());
                    else variants.put("ORIGINAL", asset.variants().path("ORIGINAL").asText());
                    if (input.includeOriginals() && asset.variants().has("ORIGINAL"))
                        variants.put("ORIGINAL", asset.variants().path("ORIGINAL").asText());
                    for (var variant : variants.entrySet()) {
                        String path =
                                "files/"
                                        + aid
                                        + "/"
                                        + variant.getKey().toLowerCase(Locale.ROOT)
                                        + (variant.getKey().equals("WORKING")
                                                ? ".png"
                                                : "-" + safeName(asset.name()));
                        long bytes;
                        try {
                            bytes = storage.headPrivate(variant.getValue()).bytes();
                        } catch (RuntimeException unavailable) {
                            throw error(
                                    HttpStatus.SERVICE_UNAVAILABLE,
                                    "EXPORT_ASSET_UNAVAILABLE",
                                    "A verified file is unavailable.");
                        }
                        fileBytes = Math.addExact(fileBytes, bytes);
                        files.add(
                                json.createObjectNode()
                                        .put("id", aid.toString())
                                        .put("name", asset.name())
                                        .put("variant", variant.getKey())
                                        .put("bytes", bytes)
                                        .put("path", path)
                                        .put(
                                                "contentType",
                                                variant.getKey().equals("WORKING")
                                                        ? "image/png"
                                                        : asset.detectedType()));
                        sources.add(
                                json.createObjectNode()
                                        .put("path", path)
                                        .put("key", variant.getValue())
                                        .put("bytes", bytes));
                    }
                }
                items.add(exported);
            }
            if (!items.isEmpty()) sections.add(out);
        }
        if (partial && !input.acknowledgePartial())
            throw error(
                    HttpStatus.CONFLICT,
                    "PARTIAL_EXPORT_ACK_REQUIRED",
                    "Required content is not fully approved. Explicitly acknowledge a partial"
                            + " export.");
        if (sections.isEmpty())
            throw error(
                    HttpStatus.CONFLICT,
                    "NO_APPROVED_CONTENT",
                    "Approve visible content before exporting.");
        manifest.put("partial", partial);
        var internal = json.createObjectNode();
        internal.set("public", manifest);
        internal.set("sources", sources);
        if (fileBytes + internal.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length
                > com.ayaantrix.collector.export.worker.ExportRenderer.LIMIT)
            throw error(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "EXPORT_TOO_LARGE",
                    "Export exceeds 2 GB. Select fewer sections and create separate exports.");
        jobs.insert(
                id,
                w,
                p,
                a.member().id(),
                input.format().name(),
                project.version(),
                internal,
                input.acknowledgePartial(),
                now);
        audit.write(
                w,
                p,
                a.member().userId(),
                "EXPORT_REQUESTED",
                "EXPORT",
                id,
                Map.of(
                        "format",
                        input.format().name(),
                        "partial",
                        partial,
                        "projectVersion",
                        project.version()),
                now);
        var result = Map.<String, Object>of("jobId", id, "state", "QUEUED");
        requests.remember(
                w,
                a.member().userId(),
                route,
                key,
                hash,
                json.writeValueAsString(result),
                202,
                now);
        return result;
    }

    public Map<String, Object> list(UUID w, UUID p) {
        access(w, p);
        long version = projects.findByWorkspaceIdAndId(w, p).orElseThrow().version();
        return Map.of("data", jobs.list(w, p).stream().map(j -> summary(j, version)).toList());
    }

    public Map<String, Object> get(UUID w, UUID p, UUID id) {
        access(w, p);
        return Map.of(
                "export",
                summary(
                        jobs.find(w, p, id).orElseThrow(ProjectAuthorization::missing),
                        projects.findByWorkspaceIdAndId(w, p).orElseThrow().version()));
    }

    public Map<String, String> download(UUID w, UUID p, UUID id) {
        var access = access(w, p);
        var j = jobs.find(w, p, id).orElseThrow(ProjectAuthorization::missing);
        long seconds = Duration.between(clock.instant(), j.expires()).toSeconds();
        if (seconds < 1)
            throw error(
                    HttpStatus.GONE,
                    "EXPORT_EXPIRED",
                    "This export has expired. Create a new export.");
        if (!j.state().equals("READY"))
            throw error(
                    HttpStatus.CONFLICT,
                    "EXPORT_NOT_READY",
                    "The export is not ready for download.");
        long readableSeconds =
                Duration.between(clock.instant(), auth.readableUntil(access)).toSeconds();
        if (readableSeconds < 1)
            throw error(
                    HttpStatus.FORBIDDEN,
                    "WORKSPACE_ACCESS_EXPIRED",
                    "The workspace read-only access period has ended.");
        return Map.of(
                "url",
                storage.download(
                        j.key(),
                        "approved-" + j.id() + extension(j.format()),
                        "application/octet-stream",
                        Duration.ofSeconds(Math.min(60, Math.min(seconds, readableSeconds)))));
    }

    private Map<String, Object> summary(ExportRepository.Job j, long current) {
        var result = new LinkedHashMap<String, Object>();
        result.put("id", j.id());
        result.put("state", !clock.instant().isBefore(j.expires()) ? "EXPIRED" : j.state());
        result.put("format", j.format());
        result.put("projectVersion", j.version());
        result.put("partial", j.manifest().path("public").path("partial").asBoolean());
        result.put("createdAt", j.created());
        result.put("expiresAt", j.expires());
        result.put("olderThanCurrentProject", j.version() != current);
        if (j.failure() != null) result.put("failureCode", j.failure());
        return result;
    }

    public static String extension(String format) {
        return format.equals("APPROVED_ZIP")
                ? ".zip"
                : format.equals("APPROVED_JSON") ? ".json" : ".md";
    }

    private static String safeName(String name) {
        String s = name.replaceAll("[^a-zA-Z0-9._-]", "_");
        return s.substring(0, Math.min(s.length(), 120));
    }

    private static ApiException error(HttpStatus status, String code, String message) {
        return new ApiException(status, code, message);
    }
}

package com.ayaantrix.collector.submission.service;

import com.ayaantrix.collector.attachment.repository.AttachmentRepository;
import com.ayaantrix.collector.attachment.service.AttachmentService;
import com.ayaantrix.collector.clientaccess.security.ClientAccessAuthorization;
import com.ayaantrix.collector.collection.repository.ClientAnswerRepository;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.repository.*;
import com.ayaantrix.collector.project.repository.*;
import com.ayaantrix.collector.project.security.ProjectAuthorization;
import com.ayaantrix.collector.project.service.ProjectDraftVisibility;
import com.ayaantrix.collector.submission.dto.SubmissionDtos.*;
import com.ayaantrix.collector.submission.repository.SubmissionRepository;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.util.*;

@Service
@Transactional
public class SubmissionService {
    private final ClientAccessAuthorization clients;
    private final ProjectAuthorization agency;
    private final ProjectRepository projects;
    private final ProjectStructureRepository structures;
    private final ClientAnswerRepository drafts;
    private final SubmissionRepository revisions;
    private final SubmissionValidationService validation;
    private final AttachmentService attachments;
    private final AttachmentRepository assets;
    private final IdempotencyRepository requests;
    private final AuditRepository audit;
    private final JsonMapper json;
    private final Clock clock;
    private final com.ayaantrix.collector.workspace.repository.WorkspaceSubscriptionRepository
            plans;

    public SubmissionService(
            ClientAccessAuthorization clients,
            ProjectAuthorization agency,
            ProjectRepository projects,
            ProjectStructureRepository structures,
            ClientAnswerRepository drafts,
            SubmissionRepository revisions,
            SubmissionValidationService validation,
            AttachmentService attachments,
            AttachmentRepository assets,
            IdempotencyRepository requests,
            AuditRepository audit,
            JsonMapper json,
            Clock clock,
            com.ayaantrix.collector.workspace.repository.WorkspaceSubscriptionRepository plans) {
        this.plans = plans;
        this.clients = clients;
        this.agency = agency;
        this.projects = projects;
        this.structures = structures;
        this.drafts = drafts;
        this.revisions = revisions;
        this.validation = validation;
        this.attachments = attachments;
        this.assets = assets;
        this.requests = requests;
        this.audit = audit;
        this.json = json;
        this.clock = clock;
    }

    public Submitted submit(String cookie, UUID p, UUID i, Submit input, String key) {
        var a = clients.require(cookie, p);
        writable(a);
        UUID w = a.grant().workspace();
        String route = "client/projects/" + p + "/items/" + i + "/submit",
                hash = IdempotencyRepository.hash(json.writeValueAsString(input));
        var replay = requests.replay(w, a.grant().contact(), route, key, hash, clock.instant());
        if (replay.isPresent()) return json.readValue(replay.get(), Submitted.class);
        var all = structures.structure(w, p);
        var rows = drafts.drafts(w, p);
        var item = visible(all, rows, i);
        if (!Set.of("DRAFT", "NOT_STARTED", "CHANGES_REQUESTED")
                        .contains(item.path("state").asText())
                || !item.path("currentRevisionId").isNull())
            throw conflict(
                    "READ_ONLY",
                    "This item has already been submitted or needs the review workflow.");
        if (input.expectedStructureVersion() != a.project().structureVersion())
            throw conflict(
                    "STRUCTURE_CONFLICT", "The content request changed. Reload before submitting.");
        var draft = rows.get(i);
        long version = draft == null ? 0 : draft.answer().version();
        if (version != input.expectedAnswerVersion())
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "ANSWER_VERSION_CONFLICT",
                    "The saved answer changed. Reload before submitting.",
                    version);
        var value = draft == null ? json.createObjectNode() : draft.answer().value();
        if (assets.item(w, p, i).stream()
                .anyMatch(x -> Set.of("RESERVED", "UPLOADED", "PROCESSING").contains(x.state())))
            throw conflict(
                    "UPLOAD_INCOMPLETE",
                    "Wait for this question's uploads to finish or cancel them before submitting.");
        validation.validate(item, value);
        attachments.validateSubmissionObjects(w, p, i, item, value);
        var ids = new LinkedHashSet<UUID>();
        collect(value, ids);
        var manifest = new ArrayList<JsonNode>();
        for (UUID id : ids) {
            var asset = assets.find(w, p, id).orElseThrow(ProjectAuthorization::missing);
            manifest.add(
                    json.valueToTree(
                            new com.ayaantrix.collector.attachment.dto.AttachmentDtos.Summary(
                                    asset.id(),
                                    asset.item(),
                                    asset.name(),
                                    asset.detectedType(),
                                    asset.state(),
                                    asset.bytes(),
                                    asset.retained(),
                                    asset.keep(),
                                    asset.variants().propertyNames().stream().toList(),
                                    asset.rejection())));
        }
        UUID r = UUID.randomUUID();
        int n = revisions.next(w, p, i);
        var effective = effectiveStructure(all, rows);
        var submittedSchema = item.deepCopy();
        ((tools.jackson.databind.node.ObjectNode) submittedSchema).put("visible", true);
        revisions.insert(
                w,
                p,
                i,
                r,
                n,
                a.project().structureVersion(),
                version,
                a.grant().contact(),
                clock.instant(),
                submittedSchema,
                value,
                effective,
                manifest);
        audit.writeClient(w, p, a.grant().contact(), "CLIENT_ITEM_SUBMITTED", r, clock.instant());
        var result = new Submitted(r, n, item.path("version").asLong() + 1, "SUBMITTED");
        requests.remember(
                w,
                a.grant().contact(),
                route,
                key,
                hash,
                json.writeValueAsString(result),
                201,
                clock.instant());
        return result;
    }

    public Withdrawn withdraw(String cookie, UUID p, UUID i, Withdraw input, String key) {
        var a = clients.require(cookie, p);
        writable(a);
        UUID w = a.grant().workspace();
        String route = "client/projects/" + p + "/items/" + i + "/withdraw",
                hash = IdempotencyRepository.hash(json.writeValueAsString(input));
        var replay = requests.replay(w, a.grant().contact(), route, key, hash, clock.instant());
        if (replay.isPresent()) return json.readValue(replay.get(), Withdrawn.class);
        var item = visible(structures.structure(w, p), drafts.drafts(w, p), i);
        if (!item.path("state").asText().equals("SUBMITTED")
                || item.path("version").asLong() != input.expectedItemVersion())
            throw conflict(
                    "ITEM_VERSION_CONFLICT",
                    "This submitted item changed. Reload before withdrawing.");
        revisions.transition(w, p, i, "DRAFT", null, clock.instant());
        revisions.event(
                w,
                p,
                i,
                UUID.fromString(item.path("currentRevisionId").asText()),
                "ITEM_WITHDRAWN",
                clock.instant());
        audit.writeClient(
                w,
                p,
                a.grant().contact(),
                "CLIENT_SUBMISSION_WITHDRAWN",
                UUID.fromString(item.path("currentRevisionId").asText()),
                clock.instant());
        var result = new Withdrawn("DRAFT", input.expectedItemVersion() + 1);
        requests.remember(
                w,
                a.grant().contact(),
                route,
                key,
                hash,
                json.writeValueAsString(result),
                200,
                clock.instant());
        return result;
    }

    private void writable(ClientAccessAuthorization.Access a) {
        if (!a.project().state().name().equals("ACTIVE")
                || !a.workspace().state().name().equals("ACTIVE")
                || plans.lockedForWorkspace(a.grant().workspace())
                        .filter(plan -> plan.writable(clock.instant()))
                        .isEmpty()) throw conflict("READ_ONLY", "This project is read-only.");
    }

    private static ApiException conflict(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message);
    }

    private JsonNode visible(
            List<JsonNode> all, Map<UUID, ClientAnswerRepository.Draft> rows, UUID i) {
        var values = new HashMap<UUID, JsonNode>();
        rows.forEach((id, d) -> values.put(id, d.answer().value()));
        for (var s : all)
            for (var item : s.path("items"))
                if (item.path("id").asText().equals(i.toString())
                        && ProjectDraftVisibility.visible(s, item, all, values)) return item;
        throw ProjectAuthorization.missing();
    }

    /**
     * Freeze the same evaluated visibility used for this authorized submission, not initial UI
     * hints.
     */
    private List<JsonNode> effectiveStructure(
            List<JsonNode> all, Map<UUID, ClientAnswerRepository.Draft> rows) {
        var values = new HashMap<UUID, JsonNode>();
        rows.forEach((id, d) -> values.put(id, d.answer().value()));
        var frozen = new ArrayList<JsonNode>();
        for (var section : all) {
            var copy = (tools.jackson.databind.node.ObjectNode) section.deepCopy();
            for (var item : copy.path("items"))
                ((tools.jackson.databind.node.ObjectNode) item)
                        .put("visible", ProjectDraftVisibility.visible(section, item, all, values));
            frozen.add(copy);
        }
        return frozen;
    }

    private void collect(JsonNode value, Set<UUID> ids) {
        if (value.has("assetIds"))
            for (var id : value.path("assetIds")) ids.add(UUID.fromString(id.asText()));
        if (value.has("rows"))
            for (var row : value.path("rows"))
                for (var cell : row.path("values"))
                    if (cell.isArray()) for (var id : cell) ids.add(UUID.fromString(id.asText()));
    }

    private void agency(UUID w, UUID p, boolean review) {
        var a = agency.access(w, false);
        agency.readableProject(a, p);
        var project = projects.lockForStructure(w, p).orElseThrow(ProjectAuthorization::missing);
        if (project.state().name().equals("DELETION_PENDING")) throw ProjectAuthorization.missing();
        if (review && !agency.permissions(a, p, false).canReview())
            throw new ApiException(
                    HttpStatus.FORBIDDEN, "REVIEW_FORBIDDEN", "Review access is required.");
    }

    public Map<String, Object> queue(UUID w, UUID p, int page, int size) {
        agency(w, p, true);
        if (page < 0 || size < 1 || size > 100 || page > Integer.MAX_VALUE / size)
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Use valid pagination.");
        return Map.of(
                "data",
                revisions.queue(w, p, page, size),
                "page",
                Map.of("number", page, "size", size, "totalElements", revisions.queueCount(w, p)));
    }

    public Map<String, Object> history(UUID w, UUID p, UUID i) {
        agency(w, p, false);
        return Map.of("data", revisions.history(w, p, i));
    }

    public Map<String, Object> detail(UUID w, UUID p, UUID i, UUID r) {
        agency(w, p, false);
        return Map.of("revision", revisions.detail(w, p, i, r));
    }
}

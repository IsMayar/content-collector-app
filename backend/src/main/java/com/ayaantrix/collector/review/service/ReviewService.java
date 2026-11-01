package com.ayaantrix.collector.review.service;

import com.ayaantrix.collector.clientaccess.security.ClientAccessAuthorization;
import com.ayaantrix.collector.collection.repository.ClientAnswerRepository;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.repository.*;
import com.ayaantrix.collector.project.repository.ProjectStructureRepository;
import com.ayaantrix.collector.project.security.ProjectAuthorization;
import com.ayaantrix.collector.project.service.ProjectDraftVisibility;
import com.ayaantrix.collector.review.dto.ReviewDtos.*;
import com.ayaantrix.collector.review.repository.ReviewRepository;
import com.ayaantrix.collector.review.security.ReviewAuthorization;
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
public class ReviewService {
    private final ReviewAuthorization auth;
    private final ReviewRepository reviews;
    private final SubmissionRepository submissions;
    private final ClientAnswerRepository answers;
    private final ProjectStructureRepository structures;
    private final ClientAccessAuthorization clients;
    private final AuditRepository audit;
    private final IdempotencyRepository requests;
    private final JsonMapper json;
    private final Clock clock;
    private final com.ayaantrix.collector.workspace.repository.WorkspaceSubscriptionRepository
            plans;

    public ReviewService(
            ReviewAuthorization auth,
            ReviewRepository reviews,
            SubmissionRepository submissions,
            ClientAnswerRepository answers,
            ProjectStructureRepository structures,
            ClientAccessAuthorization clients,
            AuditRepository audit,
            IdempotencyRepository requests,
            JsonMapper json,
            Clock clock,
            com.ayaantrix.collector.workspace.repository.WorkspaceSubscriptionRepository plans) {
        this.plans = plans;
        this.auth = auth;
        this.reviews = reviews;
        this.submissions = submissions;
        this.answers = answers;
        this.structures = structures;
        this.clients = clients;
        this.audit = audit;
        this.requests = requests;
        this.json = json;
        this.clock = clock;
    }

    public Map<String, Object> decide(UUID w, UUID p, UUID i, Decide input, String key) {
        var a = auth.require(w, p, true, true);
        String reason = input.reason() == null ? null : input.reason().strip();
        if (input.revisionId() == null
                || input.expectedItemVersion() == null
                || input.expectedItemVersion() < 1
                || input.decision() == null
                || (reason != null && reason.length() > 5000)
                || (input.decision() == Decision.REQUEST_CHANGES
                        && (reason == null || reason.isBlank())))
            throw new ApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "VALIDATION_FAILED",
                    "Change requests require feedback of at most 5000 characters.");
        String route = "projects/" + p + "/items/" + i + "/review-decisions",
                hash = IdempotencyRepository.hash(json.writeValueAsString(input));
        var replay = requests.replay(w, a.member().userId(), route, key, hash, clock.instant());
        if (replay.isPresent())
            return json.readValue(
                    replay.get(),
                    new tools.jackson.core.type.TypeReference<Map<String, Object>>() {});
        var item = reviews.item(w, p, i);
        if (!item.path("state").asText().equals("SUBMITTED")
                || item.path("version").asLong() != input.expectedItemVersion()
                || !item.path("currentRevisionId").asText().equals(input.revisionId().toString()))
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "ITEM_VERSION_CONFLICT",
                    "The submitted revision changed. Reload before deciding.",
                    item.path("version").asLong());
        var revision = submissions.detail(w, p, i, input.revisionId());
        UUID id = UUID.randomUUID();
        var now = clock.instant();
        reviews.decide(
                id,
                w,
                p,
                i,
                input.revisionId(),
                a.member().id(),
                input.decision().name(),
                reason,
                input.expectedItemVersion(),
                now);
        if (input.decision() == Decision.REQUEST_CHANGES) {
            answers.restoreSubmission(
                    w,
                    p,
                    i,
                    UUID.fromString(revision.path("submittedByContactId").asText()),
                    revision.path("valueSnapshot"),
                    revision.path("structureVersion").asLong(),
                    now);
            reviews.comment(
                    w, p, i, input.revisionId(), a.member().id(), null, reason, "CLIENT", now);
        }
        submissions.transition(
                w,
                p,
                i,
                input.decision() == Decision.APPROVE ? "APPROVED" : "CHANGES_REQUESTED",
                input.decision() == Decision.APPROVE ? input.revisionId() : null,
                now);
        audit.write(
                w,
                p,
                a.member().userId(),
                "REVIEW_DECIDED",
                "REVIEW_DECISION",
                id,
                Map.of("decision", input.decision().name(), "revisionId", input.revisionId()),
                now);
        var result =
                Map.<String, Object>of(
                        "item",
                        structures.structure(w, p).stream()
                                .flatMap(
                                        s ->
                                                java.util.stream.StreamSupport.stream(
                                                        s.path("items").spliterator(), false))
                                .filter(n -> n.path("id").asText().equals(i.toString()))
                                .findFirst()
                                .orElseThrow(ProjectAuthorization::missing),
                        "decision",
                        reviews.decisions(w, p, i, input.revisionId()).getFirst());
        requests.remember(
                w,
                a.member().userId(),
                route,
                key,
                hash,
                json.writeValueAsString(result),
                201,
                now);
        return result;
    }

    public Map<String, Object> agencyComments(UUID w, UUID p, UUID i) {
        auth.require(w, p, false, false);
        reviews.item(w, p, i);
        return Map.of("data", reviews.comments(w, p, i, false));
    }

    public Map<String, Object> addAgencyComment(UUID w, UUID p, UUID i, AgencyComment input) {
        var a = auth.require(w, p, false, true);
        reviews.item(w, p, i);
        if (input.visibility() == null)
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Select comment visibility.");
        var body = body(input.body());
        UUID id =
                reviews.comment(
                        w,
                        p,
                        i,
                        null,
                        a.member().id(),
                        null,
                        body,
                        input.visibility().name(),
                        clock.instant());
        audit.write(
                w,
                p,
                a.member().userId(),
                "COMMENT_ADDED",
                "COMMENT",
                id,
                Map.of("visibility", input.visibility().name()),
                clock.instant());
        return Map.of(
                "comment",
                reviews.comments(w, p, i, false).stream()
                        .filter(n -> n.path("id").asText().equals(id.toString()))
                        .findFirst()
                        .orElseThrow());
    }

    public Map<String, Object> clientComments(String cookie, UUID p, UUID i) {
        var a = client(cookie, p, i);
        return Map.of("data", reviews.comments(a.grant().workspace(), p, i, true));
    }

    public Map<String, Object> addClientComment(
            String cookie, UUID p, UUID i, ClientComment input) {
        var a = client(cookie, p, i);
        if (!a.project().state().name().equals("ACTIVE")
                || !a.workspace().state().name().equals("ACTIVE")
                || plans.lockedForWorkspace(a.grant().workspace())
                        .filter(plan -> plan.writable(clock.instant()))
                        .isEmpty())
            throw new ApiException(HttpStatus.CONFLICT, "READ_ONLY", "This project is read-only.");
        UUID w = a.grant().workspace();
        UUID id =
                reviews.comment(
                        w,
                        p,
                        i,
                        null,
                        null,
                        a.grant().contact(),
                        body(input.body()),
                        "CLIENT",
                        clock.instant());
        audit.writeClient(w, p, a.grant().contact(), "CLIENT_COMMENT_ADDED", id, clock.instant());
        return Map.of(
                "comment",
                reviews.comments(w, p, i, true).stream()
                        .filter(n -> n.path("id").asText().equals(id.toString()))
                        .findFirst()
                        .orElseThrow());
    }

    private ClientAccessAuthorization.Access client(String cookie, UUID p, UUID i) {
        var a = clients.require(cookie, p);
        var all = structures.structure(a.grant().workspace(), p);
        var values = new HashMap<UUID, JsonNode>();
        answers.drafts(a.grant().workspace(), p)
                .forEach((id, d) -> values.put(id, d.answer().value()));
        for (var s : all)
            for (var f : s.path("items"))
                if (f.path("id").asText().equals(i.toString())
                        && ProjectDraftVisibility.visible(s, f, all, values)) return a;
        throw ProjectAuthorization.missing();
    }

    private String body(String text) {
        if (text == null || text.isBlank() || text.length() > 5000)
            throw new ApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "VALIDATION_FAILED",
                    "Write a comment of at most 5000 characters.");
        return text.strip();
    }
}

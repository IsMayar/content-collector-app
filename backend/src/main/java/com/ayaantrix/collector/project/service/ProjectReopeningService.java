package com.ayaantrix.collector.project.service;

import com.ayaantrix.collector.collection.repository.ClientAnswerRepository;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.repository.*;
import com.ayaantrix.collector.project.dto.ProjectLifecycleDtos.Reopen;
import com.ayaantrix.collector.project.repository.*;
import com.ayaantrix.collector.project.security.ProjectAuthorization;
import com.ayaantrix.collector.review.repository.ReviewRepository;
import com.ayaantrix.collector.review.security.ReviewAuthorization;
import com.ayaantrix.collector.submission.repository.SubmissionRepository;
import com.ayaantrix.collector.workspace.security.WorkspaceAuthorization;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.util.*;

@Service
@Transactional
public class ProjectReopeningService {
    private final ReviewAuthorization auth;
    private final ReviewRepository reviews;
    private final SubmissionRepository submissions;
    private final ClientAnswerRepository answers;
    private final ProjectLifecycleRepository lifecycle;
    private final IdempotencyRepository requests;
    private final AuditRepository audit;
    private final JsonMapper json;
    private final Clock clock;
    private final ProjectStructureRepository structures;

    public ProjectReopeningService(
            ReviewAuthorization auth,
            ReviewRepository reviews,
            SubmissionRepository submissions,
            ClientAnswerRepository answers,
            ProjectLifecycleRepository lifecycle,
            IdempotencyRepository requests,
            AuditRepository audit,
            JsonMapper json,
            Clock clock,
            ProjectStructureRepository structures) {
        this.structures = structures;
        this.auth = auth;
        this.reviews = reviews;
        this.submissions = submissions;
        this.answers = answers;
        this.lifecycle = lifecycle;
        this.requests = requests;
        this.audit = audit;
        this.json = json;
        this.clock = clock;
    }

    public Map<String, Object> reopen(UUID w, UUID p, UUID i, Reopen input, String key) {
        var a = auth.require(w, p, true, true);
        String reason = ProjectLifecycleService.reason(input.reason());
        String route = "projects/" + p + "/items/" + i + "/reopen",
                hash = IdempotencyRepository.hash(json.writeValueAsString(input));
        var replay = requests.replay(w, a.member().userId(), route, key, hash, clock.instant());
        if (replay.isPresent())
            return json.readValue(
                    replay.get(),
                    new tools.jackson.core.type.TypeReference<Map<String, Object>>() {});
        var item = reviews.item(w, p, i);
        if (!item.path("state").asText().equals("APPROVED")
                || item.path("version").asLong() != input.expectedItemVersion())
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "ITEM_VERSION_CONFLICT",
                    "This approved item changed. Reload before reopening.",
                    item.path("version").asLong());
        open(w, p, i, UUID.fromString(item.path("currentRevisionId").asText()), a, reason);
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
                                .orElseThrow(ProjectAuthorization::missing));
        requests.remember(
                w,
                a.member().userId(),
                route,
                key,
                hash,
                json.writeValueAsString(result),
                200,
                clock.instant());
        return result;
    }

    public void open(
            UUID w, UUID p, UUID i, UUID r, WorkspaceAuthorization.Access a, String reason) {
        var revision = submissions.detail(w, p, i, r);
        var now = clock.instant();
        answers.restoreSubmission(
                w,
                p,
                i,
                UUID.fromString(revision.path("submittedByContactId").asText()),
                revision.path("valueSnapshot"),
                revision.path("structureVersion").asLong(),
                now);
        submissions.transition(w, p, i, "DRAFT", null, now);
        recordOpening(w, p, i, r, a, reason);
    }

    public void recordOpening(
            UUID w, UUID p, UUID i, UUID r, WorkspaceAuthorization.Access a, String reason) {
        var now = clock.instant();
        lifecycle.opening(w, p, i, r, a.member().id(), ProjectLifecycleService.reason(reason), now);
        reviews.comment(w, p, i, r, a.member().id(), null, reason, "CLIENT", now);
        audit.write(
                w,
                p,
                a.member().userId(),
                "ITEM_REOPENED",
                "ITEM",
                i,
                Map.of("revisionId", r),
                now);
    }
}

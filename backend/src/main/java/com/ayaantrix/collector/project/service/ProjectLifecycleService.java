package com.ayaantrix.collector.project.service;

import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.repository.*;
import com.ayaantrix.collector.project.dto.ProjectLifecycleDtos.*;
import com.ayaantrix.collector.project.entity.*;
import com.ayaantrix.collector.project.repository.*;
import com.ayaantrix.collector.project.security.ProjectAuthorization;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.util.*;

@Service
@Transactional
public class ProjectLifecycleService {
    private final ProjectAuthorization auth;
    private final ProjectRepository projects;
    private final ProjectStructureRepository structures;
    private final ProjectStructureValidationService schema;
    private final ProjectLifecycleRepository lifecycle;
    private final IdempotencyRepository requests;
    private final AuditRepository audit;
    private final JsonMapper json;
    private final Clock clock;

    public ProjectLifecycleService(
            ProjectAuthorization auth,
            ProjectRepository projects,
            ProjectStructureRepository structures,
            ProjectStructureValidationService schema,
            ProjectLifecycleRepository lifecycle,
            IdempotencyRepository requests,
            AuditRepository audit,
            JsonMapper json,
            Clock clock) {
        this.auth = auth;
        this.projects = projects;
        this.structures = structures;
        this.schema = schema;
        this.lifecycle = lifecycle;
        this.requests = requests;
        this.audit = audit;
        this.json = json;
        this.clock = clock;
    }

    public Map<String, Object> transition(
            UUID w, UUID p, String action, Command input, String key) {
        var a = auth.access(w, true);
        auth.writable(a);
        var project = projects.lockForStructure(w, p).orElseThrow(ProjectAuthorization::missing);
        var now = clock.instant();
        String route = "projects/" + p + "/" + action,
                hash = IdempotencyRepository.hash(json.writeValueAsString(input));
        var replay = requests.replay(w, a.member().userId(), route, key, hash, now);
        if (replay.isPresent())
            return json.readValue(
                    replay.get(),
                    new tools.jackson.core.type.TypeReference<Map<String, Object>>() {});
        if (project.version() != input.expectedVersion())
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "PROJECT_VERSION_CONFLICT",
                    "The project changed. Refresh before continuing.",
                    project.version());
        ProjectState state = project.state();
        ProjectState next =
                switch (action) {
                    case "publish" -> {
                        require(state == ProjectState.DRAFT);
                        publishable(project);
                        yield ProjectState.ACTIVE;
                    }
                    case "pause" -> {
                        require(state == ProjectState.ACTIVE);
                        yield ProjectState.PAUSED;
                    }
                    case "resume" -> {
                        require(state == ProjectState.PAUSED);
                        if (project.publishedAt() == null) publishable(project);
                        yield ProjectState.ACTIVE;
                    }
                    case "complete" -> {
                        require(state == ProjectState.ACTIVE || state == ProjectState.PAUSED);
                        var progress = structures.progress(w, List.of(p)).get(p);
                        if (progress.approvedRequired() != progress.requiredTotal())
                            throw new ApiException(
                                    HttpStatus.CONFLICT,
                                    "PROJECT_INCOMPLETE",
                                    "Approve every visible required item before completing.");
                        yield ProjectState.COMPLETED;
                    }
                    case "reopen" -> {
                        require(state == ProjectState.COMPLETED);
                        reason(input.reason());
                        yield ProjectState.ACTIVE;
                    }
                    case "archive" -> {
                        require(
                                state != ProjectState.ARCHIVED
                                        && state != ProjectState.DELETION_PENDING);
                        yield ProjectState.ARCHIVED;
                    }
                    case "restore" -> {
                        require(state == ProjectState.ARCHIVED);
                        yield ProjectState.PAUSED;
                    }
                    default -> throw ProjectAuthorization.missing();
                };
        project.transition(next, now);
        projects.saveAndFlush(project);
        lifecycle.transition(
                w,
                p,
                a.member().id(),
                action,
                state.name(),
                next.name(),
                project.version(),
                input.reason(),
                now);
        if (next == ProjectState.ARCHIVED) lifecycle.stopInvitations(w, p, now);
        audit.write(
                w,
                p,
                a.member().userId(),
                "PROJECT_" + action.toUpperCase(Locale.ROOT),
                "PROJECT",
                p,
                Map.of("from", state.name(), "to", next.name()),
                now);
        var result = new LinkedHashMap<String, Object>();
        result.put("projectState", next.name());
        result.put("projectVersion", project.version());
        result.put("publishedAt", project.publishedAt());
        result.put("publishedVersion", project.publishedVersion());
        requests.remember(
                w,
                a.member().userId(),
                route,
                key,
                hash,
                json.writeValueAsString(result),
                200,
                now);
        return result;
    }

    private void publishable(Project project) {
        var all = structures.structure(project.workspaceId(), project.id());
        schema.validate(project, all);
        boolean requested =
                all.stream()
                        .anyMatch(
                                s ->
                                        s.path("enabled").asBoolean()
                                                && java.util.stream.StreamSupport.stream(
                                                                s.path("items").spliterator(),
                                                                false)
                                                        .anyMatch(
                                                                i ->
                                                                        i.path("enabled")
                                                                                .asBoolean()));
        if (!requested
                || !lifecycle.contact(project.workspaceId(), project.id(), clock.instant())
                || project.dueDate() == null)
            throw new ApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "PUBLICATION_VALIDATION_FAILED",
                    "Provide enabled content requests, an active unexpired client contact and a due"
                        + " date before publishing.");
    }

    private void require(boolean allowed) {
        if (!allowed)
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "INVALID_PROJECT_TRANSITION",
                    "This project action is unavailable in its current state.");
    }

    public static String reason(String value) {
        if (value == null || value.isBlank() || value.length() > 5000)
            throw new ApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "VALIDATION_FAILED",
                    "Provide a reason of at most 5000 characters.");
        return value.strip();
    }
}

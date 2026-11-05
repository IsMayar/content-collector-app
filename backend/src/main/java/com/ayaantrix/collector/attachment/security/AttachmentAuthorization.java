package com.ayaantrix.collector.attachment.security;

import com.ayaantrix.collector.clientaccess.security.ClientAccessAuthorization;
import com.ayaantrix.collector.collection.repository.ClientAnswerRepository;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.project.repository.*;
import com.ayaantrix.collector.project.security.ProjectAuthorization;
import com.ayaantrix.collector.project.service.ProjectDraftVisibility;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

import tools.jackson.databind.JsonNode;

import java.util.*;

@Component
@Transactional(propagation = Propagation.MANDATORY)
public class AttachmentAuthorization {
    private final ClientAccessAuthorization clients;
    private final ProjectAuthorization agency;
    private final ProjectRepository projects;
    private final ProjectStructureRepository structures;
    private final ClientAnswerRepository drafts;
    private final com.ayaantrix.collector.workspace.repository.WorkspaceSubscriptionRepository
            plans;
    private final java.time.Clock clock;

    public AttachmentAuthorization(
            ClientAccessAuthorization clients,
            ProjectAuthorization agency,
            ProjectRepository projects,
            ProjectStructureRepository structures,
            ClientAnswerRepository drafts,
            com.ayaantrix.collector.workspace.repository.WorkspaceSubscriptionRepository plans,
            java.time.Clock clock) {
        this.clients = clients;
        this.agency = agency;
        this.projects = projects;
        this.structures = structures;
        this.drafts = drafts;
        this.plans = plans;
        this.clock = clock;
    }

    public ClientAccessAuthorization.Access client(String cookie, UUID project, boolean write) {
        var a = clients.require(cookie, project);
        if (write
                && (!a.project().state().name().equals("ACTIVE")
                        || !a.workspace().state().name().equals("ACTIVE")
                        || !uploadsWritable(a.grant().workspace())))
            throw new ApiException(HttpStatus.CONFLICT, "READ_ONLY", "This project is read-only.");
        return a;
    }

    public boolean uploadsWritable(UUID workspace) {
        return plans.lockedForWorkspace(workspace)
                .filter(plan -> plan.writable(clock.instant()))
                .isPresent();
    }

    public long downloadSeconds(UUID workspace) {
        var now = clock.instant();
        return plans.lockedForWorkspace(workspace)
                .filter(p -> p.readable(now))
                .map(p -> java.time.Duration.between(now, p.readOnlyDeadline()).toSeconds())
                .filter(seconds -> seconds >= 1)
                .map(seconds -> Math.min(60, seconds))
                .orElseThrow(
                        () ->
                                new ApiException(
                                        HttpStatus.FORBIDDEN,
                                        "WORKSPACE_ACCESS_EXPIRED",
                                        "The workspace read-only access period has ended."));
    }

    public void agency(UUID workspace, UUID project) {
        var a = agency.access(workspace, false);
        agency.readableProject(a, project);
        var p =
                projects.lockForStructure(workspace, project)
                        .orElseThrow(ProjectAuthorization::missing);
        if (p.state().name().equals("DELETION_PENDING")) throw ProjectAuthorization.missing();
    }

    public Optional<JsonNode> visibleItem(UUID workspace, UUID project, UUID item) {
        var all = structures.structure(workspace, project);
        var values =
                drafts.drafts(workspace, project).entrySet().stream()
                        .collect(
                                java.util.stream.Collectors.toMap(
                                        Map.Entry::getKey, e -> e.getValue().answer().value()));
        for (var section : all)
            for (var field : section.path("items"))
                if (field.path("id").asText().equals(item.toString())
                        && ProjectDraftVisibility.visible(section, field, all, values))
                    return Optional.of(field);
        return Optional.empty();
    }

    public static boolean editable(JsonNode i) {
        return Set.of("NOT_STARTED", "DRAFT", "CHANGES_REQUESTED")
                        .contains(i.path("state").asText())
                && i.path("currentRevisionId").isNull();
    }

    public JsonNode item(UUID workspace, UUID project, UUID item, boolean write) {
        var field =
                visibleItem(workspace, project, item).orElseThrow(ProjectAuthorization::missing);
        if (write && !editable(field))
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "READ_ONLY",
                    "This item cannot be changed without the revision workflow.");
        return field;
    }
}

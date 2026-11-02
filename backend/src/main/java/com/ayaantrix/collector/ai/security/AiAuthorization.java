package com.ayaantrix.collector.ai.security;

import com.ayaantrix.collector.ai.config.AiSettings;
import com.ayaantrix.collector.clientaccess.security.ClientAccessAuthorization;
import com.ayaantrix.collector.collection.repository.ClientAnswerRepository;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.project.repository.ProjectStructureRepository;
import com.ayaantrix.collector.project.service.ProjectDraftVisibility;
import com.ayaantrix.collector.workspace.repository.WorkspaceSubscriptionRepository;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import tools.jackson.databind.JsonNode;

import java.time.Clock;
import java.util.*;

@Component
public class AiAuthorization {
    private final ClientAnswerRepository answers;
    private final ProjectStructureRepository structures;
    private final WorkspaceSubscriptionRepository plans;
    private final Clock clock;
    private final AiSettings settings;

    public AiAuthorization(
            ClientAnswerRepository answers,
            ProjectStructureRepository structures,
            WorkspaceSubscriptionRepository plans,
            Clock clock,
            AiSettings settings) {
        this.answers = answers;
        this.structures = structures;
        this.plans = plans;
        this.clock = clock;
        this.settings = settings;
    }

    public JsonNode field(ClientAccessAuthorization.Access a, UUID item, boolean writing) {
        var all = structures.structure(a.grant().workspace(), a.project().id());
        var values = new HashMap<UUID, JsonNode>();
        answers.drafts(a.grant().workspace(), a.project().id())
                .forEach((id, d) -> values.put(id, d.answer().value()));
        for (var s : all)
            for (var i : s.path("items"))
                if (i.path("id").asText().equals(item.toString())
                        && ProjectDraftVisibility.visible(s, i, all, values)) {
                    if (writing
                            && (!a.project().state().name().equals("ACTIVE")
                                    || !a.workspace().state().name().equals("ACTIVE")
                                    || !a.project().aiEnabled()
                                    || !i.path("type").asText().equals("LONG_TEXT")
                                    || !i.path("ai").path("enabled").asBoolean()
                                    || !Set.of("NOT_STARTED", "DRAFT", "CHANGES_REQUESTED")
                                            .contains(i.path("state").asText())
                                    || !i.path("currentRevisionId").isNull()))
                        throw new ApiException(
                                HttpStatus.CONFLICT,
                                "AI_UNAVAILABLE",
                                "AI assistance is unavailable for this item. You can keep writing"
                                        + " manually.");
                    if (writing) allowance(a);
                    return i;
                }
        throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "This question is unavailable.");
    }

    public int allowance(ClientAccessAuthorization.Access a) {
        var plan =
                plans.lockedForWorkspace(a.grant().workspace())
                        .filter(p -> p.writable(clock.instant()))
                        .orElseThrow(
                                () ->
                                        new ApiException(
                                                HttpStatus.FORBIDDEN,
                                                "WORKSPACE_READ_ONLY",
                                                "AI assistance is unavailable for this"
                                                        + " workspace."));
        return plan.trial() ? settings.trial : plan.plan().aiDrafts();
    }

    public long version(ClientAccessAuthorization.Access a, UUID item) {
        var row = answers.drafts(a.grant().workspace(), a.project().id()).get(item);
        return row == null ? 0 : row.answer().version();
    }
}

package com.ayaantrix.collector.project.service;

import com.ayaantrix.collector.attachment.service.AttachmentService;
import com.ayaantrix.collector.collection.repository.ClientAnswerRepository;
import com.ayaantrix.collector.collection.validation.ClientFieldValidator;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.project.entity.Project;
import com.ayaantrix.collector.project.repository.ProjectLifecycleRepository;
import com.ayaantrix.collector.submission.repository.SubmissionRepository;
import com.ayaantrix.collector.workspace.security.WorkspaceAuthorization;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

import tools.jackson.databind.JsonNode;

import java.util.*;

@Service
@Transactional(propagation = Propagation.MANDATORY)
public class ProjectCollectedWorkService {
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager entities;
    private final ProjectStructureMutationPolicy policy;
    private final ClientAnswerRepository answers;
    private final SubmissionRepository submissions;
    private final ProjectLifecycleRepository lifecycle;
    private final ProjectReopeningService reopening;
    private final ClientFieldValidator validator;
    private final AttachmentService attachments;

    public ProjectCollectedWorkService(
            ProjectStructureMutationPolicy policy,
            ClientAnswerRepository answers,
            SubmissionRepository submissions,
            ProjectLifecycleRepository lifecycle,
            ProjectReopeningService reopening,
            ClientFieldValidator validator,
            AttachmentService attachments) {
        this.policy = policy;
        this.answers = answers;
        this.submissions = submissions;
        this.lifecycle = lifecycle;
        this.reopening = reopening;
        this.validator = validator;
        this.attachments = attachments;
    }

    public void apply(
            Project p,
            WorkspaceAuthorization.Access access,
            List<JsonNode> before,
            List<JsonNode> after,
            ProjectStructureMutationPolicy.Impact impact,
            boolean requested,
            String reason) {
        if (!impact.requiresCollectedWorkHandling()) return;
        var old = items(before);
        var candidate = items(after);
        var drafts = answers.drafts(p.workspaceId(), p.id());
        var opens = new LinkedHashMap<UUID, UUID>();
        var collected = new HashSet<UUID>(impact.draftItemIds());
        collected.addAll(impact.revisionItemIds());
        for (UUID id : collected) {
            var row = old.get(id);
            var history = submissions.history(p.workspaceId(), p.id(), id);
            var draft = drafts.get(id);
            JsonNode value = draft == null ? null : draft.answer().value();
            if (history.isEmpty()) {
                if (draft == null) policy.requireSupported(impact, requested);
            } else {
                UUID revision = UUID.fromString(history.getFirst().path("revisionId").asText());
                boolean pending =
                        Set.of("SUBMITTED", "APPROVED").contains(row.path("state").asText())
                                || !row.path("currentRevisionId").isNull();
                if (pending || !lifecycle.opened(p.workspaceId(), p.id(), id, revision)) {
                    if (!requested || reason == null || reason.isBlank())
                        policy.requireSupported(impact, requested);
                    ProjectLifecycleService.reason(reason);
                    opens.put(id, revision);
                }
                if (pending)
                    value =
                            submissions
                                    .detail(p.workspaceId(), p.id(), id, revision)
                                    .path("valueSnapshot");
            }
            if (value != null) {
                try {
                    validator.validate(candidate.get(id), value);
                    attachments.validateStructureReferences(
                            p.workspaceId(), p.id(), id, candidate.get(id), value);
                } catch (ApiException invalid) {
                    throw new ApiException(
                            HttpStatus.UNPROCESSABLE_ENTITY,
                            "DRAFT_REVALIDATION_FAILED",
                            "Saved answer for item "
                                    + id
                                    + " does not fit the proposed structure. Preserve it, correct"
                                    + " the draft or choose a compatible definition.");
                }
            }
        }
        boolean transitioned = false;
        for (var entry : opens.entrySet()) {
            var row = old.get(entry.getKey());
            if (Set.of("SUBMITTED", "APPROVED").contains(row.path("state").asText())
                    || !row.path("currentRevisionId").isNull()) {
                reopening.open(
                        p.workspaceId(), p.id(), entry.getKey(), entry.getValue(), access, reason);
                transitioned = true;
            } else
                reopening.recordOpening(
                        p.workspaceId(), p.id(), entry.getKey(), entry.getValue(), access, reason);
        }
        if (transitioned) entities.refresh(p);
    }

    private Map<UUID, JsonNode> items(List<JsonNode> sections) {
        var map = new LinkedHashMap<UUID, JsonNode>();
        for (var s : sections)
            for (var i : s.path("items")) map.put(UUID.fromString(i.path("id").asText()), i);
        return map;
    }
}

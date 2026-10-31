package com.ayaantrix.collector.clientaccess.service;

import com.ayaantrix.collector.clientaccess.security.ClientAccessAuthorization;
import com.ayaantrix.collector.project.service.ProjectContentPresentation;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
@Transactional
public class ClientPortalService {
    private final com.ayaantrix.collector.attachment.repository.AttachmentRepository assets;
    private final com.ayaantrix.collector.attachment.storage.PrivateObjectStorage storage;
    private final com.ayaantrix.collector.attachment.security.AttachmentAuthorization
            attachmentAuthorization;
    private final tools.jackson.databind.json.JsonMapper json;
    private final com.ayaantrix.collector.collection.repository.ClientAnswerRepository answers;
    private final com.ayaantrix.collector.project.repository.ProjectStructureRepository structures;
    private final ClientAccessAuthorization auth;
    private final ProjectContentPresentation presentation;

    public ClientPortalService(
            ClientAccessAuthorization auth,
            ProjectContentPresentation presentation,
            com.ayaantrix.collector.collection.repository.ClientAnswerRepository answers,
            com.ayaantrix.collector.project.repository.ProjectStructureRepository structures,
            tools.jackson.databind.json.JsonMapper json,
            com.ayaantrix.collector.attachment.repository.AttachmentRepository assets,
            com.ayaantrix.collector.attachment.storage.PrivateObjectStorage storage,
            com.ayaantrix.collector.attachment.security.AttachmentAuthorization
                    attachmentAuthorization) {
        this.attachmentAuthorization = attachmentAuthorization;
        this.assets = assets;
        this.storage = storage;
        this.json = json;
        this.auth = auth;
        this.presentation = presentation;
        this.answers = answers;
        this.structures = structures;
    }

    public Map<String, Object> checklist(String cookie, UUID project) {
        var access = auth.require(cookie, project);
        var p = access.project();
        var drafts = answers.drafts(p.workspaceId(), project);
        var source = structures.structure(p.workspaceId(), project);
        var safe = new ArrayList<tools.jackson.databind.JsonNode>();
        boolean writable =
                p.state().name().equals("ACTIVE")
                        && access.workspace().state().name().equals("ACTIVE");
        boolean canUpload =
                writable
                        && storage.enabled()
                        && attachmentAuthorization.uploadsWritable(p.workspaceId());
        for (var section : source) {
            if (!section.path("enabled").asBoolean()) continue;
            var shown = section.deepCopy();
            var items = ((tools.jackson.databind.node.ObjectNode) shown).putArray("items");
            for (var item : section.path("items")) {
                if (!com.ayaantrix.collector.project.service.ProjectDraftVisibility.visible(
                        section,
                        item,
                        source,
                        drafts.entrySet().stream()
                                .collect(
                                        java.util.stream.Collectors.toMap(
                                                Map.Entry::getKey,
                                                e -> e.getValue().answer().value())))) continue;
                var node = tools.jackson.databind.node.JsonNodeFactory.instance.objectNode();
                for (String k :
                        List.of(
                                "id",
                                "key",
                                "label",
                                "type",
                                "instructions",
                                "example",
                                "required",
                                "validation",
                                "enabled",
                                "ai",
                                "visibleWhen",
                                "version",
                                "state")) if (item.has(k)) node.set(k, item.get(k).deepCopy());
                var draft = drafts.get(UUID.fromString(item.path("id").asText()));
                boolean editable =
                        writable
                                && Set.of("NOT_STARTED", "DRAFT", "CHANGES_REQUESTED")
                                        .contains(item.path("state").asText())
                                && item.path("currentRevisionId").isNull()
                                && (canUpload
                                        || !Set.of("IMAGE", "FILE")
                                                .contains(item.path("type").asText()));
                node.put("visible", true).put("canEdit", editable);
                if (draft == null) node.putNull("answer");
                else node.set("answer", json.valueToTree(draft.answer()));
                node.set(
                        "assets",
                        json.valueToTree(
                                assets.summaries(
                                        p.workspaceId(),
                                        project,
                                        UUID.fromString(item.path("id").asText()))));
                node.putArray("comments");
                items.add(node);
            }
            safe.add(shown);
        }
        var preview = presentation.present(p, access.workspace().name());
        return Map.of(
                "project",
                preview.project(),
                "sections",
                safe,
                "progress",
                structures.progress(p.workspaceId(), List.of(project)).get(project),
                "capabilities",
                Map.of("canRespond", writable, "canUpload", canUpload),
                "collection",
                true);
    }
}

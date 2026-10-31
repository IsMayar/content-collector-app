package com.ayaantrix.collector.attachment.service;

import com.ayaantrix.collector.attachment.dto.AttachmentDtos.*;
import com.ayaantrix.collector.attachment.entity.Attachment;
import com.ayaantrix.collector.attachment.repository.AttachmentRepository;
import com.ayaantrix.collector.attachment.security.AttachmentAuthorization;
import com.ayaantrix.collector.attachment.storage.*;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.repository.*;
import com.ayaantrix.collector.project.security.ProjectAuthorization;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.*;
import java.util.*;

@Service
public class AttachmentService {
    private final AttachmentAuthorization auth;
    private final AttachmentRepository assets;
    private final AttachmentValidationService validation;
    private final PrivateObjectStorage storage;
    private final SandboxedImageProcessor images;
    private final AuditRepository audit;
    private final IdempotencyRepository requests;
    private final Clock clock;
    private final JsonMapper json;
    private final TransactionTemplate tx;

    public AttachmentService(
            AttachmentAuthorization auth,
            AttachmentRepository assets,
            AttachmentValidationService validation,
            PrivateObjectStorage storage,
            SandboxedImageProcessor images,
            AuditRepository audit,
            IdempotencyRepository requests,
            Clock clock,
            JsonMapper json,
            PlatformTransactionManager manager) {
        this.auth = auth;
        this.assets = assets;
        this.validation = validation;
        this.storage = storage;
        this.images = images;
        this.audit = audit;
        this.requests = requests;
        this.clock = clock;
        this.json = json;
        tx = new TransactionTemplate(manager);
    }

    public Reservation reserve(String cookie, UUID project, Reserve input, String key) {
        return tx.execute(
                status -> {
                    var a = auth.client(cookie, project, true);
                    var field = auth.item(a.grant().workspace(), project, input.itemId(), true);
                    if (!storage.enabled()) throw unavailable();
                    long reservation = validation.validate(input, field);
                    if (validation.image(input.contentType()) && !images.enabled())
                        throw new ApiException(
                                HttpStatus.SERVICE_UNAVAILABLE,
                                "IMAGE_DECODER_UNAVAILABLE",
                                "Image uploads require the verified private image worker.");
                    String route = "/api/v1/client/projects/" + project + "/uploads",
                            hash = IdempotencyRepository.hash(json.writeValueAsString(input));
                    var replay =
                            requests.replay(
                                    a.grant().workspace(),
                                    a.grant().contact(),
                                    route,
                                    key,
                                    hash,
                                    clock.instant());
                    Attachment asset;
                    if (replay.isPresent()) {
                        UUID id =
                                UUID.fromString(
                                        json.readTree(replay.get()).path("assetId").asText());
                        asset =
                                assets.find(a.grant().workspace(), project, id)
                                        .orElseThrow(ProjectAuthorization::missing);
                        if (!asset.state().equals("RESERVED")
                                || !clock.instant().isBefore(asset.expires()))
                            throw new ApiException(
                                    HttpStatus.CONFLICT,
                                    "UPLOAD_EXPIRED",
                                    "This upload attempt is no longer available. Start a new"
                                            + " attempt.");
                    } else {
                        long count =
                                assets.item(a.grant().workspace(), project, input.itemId()).stream()
                                        .filter(
                                                x ->
                                                        Set.of(
                                                                        "RESERVED",
                                                                        "UPLOADED",
                                                                        "PROCESSING",
                                                                        "READY")
                                                                .contains(x.state()))
                                        .count();
                        int limit = field.path("validation").path("maxFiles").asInt(0);
                        if (limit > 0 && count >= limit)
                            throw new ApiException(
                                    HttpStatus.CONFLICT,
                                    "ATTACHMENT_LIMIT",
                                    "This question has reached its attachment limit. Remove an"
                                            + " unused file first.");
                        UUID id = UUID.randomUUID(), upload = UUID.randomUUID();
                        String path =
                                "staging/"
                                        + a.grant().workspace()
                                        + "/"
                                        + project
                                        + "/"
                                        + UUID.randomUUID();
                        assets.reserve(
                                a.grant().workspace(),
                                project,
                                input.itemId(),
                                a.grant().contact(),
                                id,
                                upload,
                                input.originalName(),
                                input.contentType(),
                                input.bytes(),
                                input.keepOriginal(),
                                reservation,
                                path,
                                clock.instant());
                        audit.writeClient(
                                a.grant().workspace(),
                                project,
                                a.grant().contact(),
                                "CLIENT_UPLOAD_RESERVED",
                                id,
                                clock.instant());
                        requests.remember(
                                a.grant().workspace(),
                                a.grant().contact(),
                                route,
                                key,
                                hash,
                                json.writeValueAsString(Map.of("assetId", id)),
                                201,
                                clock.instant());
                        asset = assets.find(a.grant().workspace(), project, id).orElseThrow();
                    }
                    var signed =
                            storage.upload(
                                    asset.staging(),
                                    asset.bytes(),
                                    asset.declaredType(),
                                    asset.id(),
                                    Duration.between(clock.instant(), asset.expires()));
                    return new Reservation(
                            asset.id(),
                            asset.upload(),
                            signed.url(),
                            signed.headers(),
                            asset.expires());
                });
    }

    public Map<String, Object> finalizeUpload(
            String cookie, UUID project, UUID upload, String key) {
        IdempotencyRepository.validKey(key);
        var original =
                tx.execute(
                        s -> {
                            var a = auth.client(cookie, project, true);
                            var asset =
                                    assets.upload(a.grant().workspace(), project, upload)
                                            .orElseThrow(ProjectAuthorization::missing);
                            auth.item(asset.workspace(), project, asset.item(), true);
                            return asset;
                        });
        if (Set.of("PROCESSING", "READY").contains(original.state()))
            return Map.of("assetId", original.id(), "state", original.state());
        if (!original.state().equals("RESERVED") || !clock.instant().isBefore(original.expires()))
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "UPLOAD_EXPIRED",
                    "This upload attempt has expired or was cancelled.");
        PrivateObjectStorage.Head head;
        try {
            head = storage.head(original.staging());
        } catch (RuntimeException e) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "UPLOAD_NOT_AVAILABLE",
                    "The file has not finished transferring. Retry finalization when it is"
                            + " uploaded.");
        }
        if (head.bytes() != original.bytes())
            throw new ApiException(
                    HttpStatus.UNPROCESSABLE_CONTENT,
                    "FILE_SIZE_MISMATCH",
                    "The stored size does not match the reserved upload.");
        return tx.execute(
                s -> {
                    var a = auth.client(cookie, project, true);
                    var asset =
                            assets.upload(a.grant().workspace(), project, upload)
                                    .orElseThrow(ProjectAuthorization::missing);
                    auth.item(asset.workspace(), project, asset.item(), true);
                    if (Set.of("PROCESSING", "READY").contains(asset.state()))
                        return Map.of("assetId", asset.id(), "state", asset.state());
                    if (!asset.state().equals("RESERVED")
                            || !clock.instant().isBefore(asset.expires()))
                        throw new ApiException(
                                HttpStatus.CONFLICT,
                                "UPLOAD_EXPIRED",
                                "This upload attempt is no longer available.");
                    assets.finalizeUpload(asset, clock.instant());
                    audit.writeClient(
                            asset.workspace(),
                            project,
                            a.grant().contact(),
                            "CLIENT_UPLOAD_FINALIZED",
                            asset.id(),
                            clock.instant());
                    return Map.of("assetId", asset.id(), "state", "PROCESSING");
                });
    }

    public Summary read(String cookie, UUID project, UUID id) {
        return tx.execute(
                s -> {
                    var a = auth.client(cookie, project, false);
                    var asset =
                            assets.find(a.grant().workspace(), project, id)
                                    .orElseThrow(ProjectAuthorization::missing);
                    auth.item(asset.workspace(), project, asset.item(), false);
                    return assets.summary(asset);
                });
    }

    public void remove(String cookie, UUID project, UUID id, boolean upload) {
        tx.executeWithoutResult(
                s -> {
                    var a = auth.client(cookie, project, true);
                    var asset =
                            (upload
                                            ? assets.upload(a.grant().workspace(), project, id)
                                            : assets.find(a.grant().workspace(), project, id))
                                    .orElseThrow(ProjectAuthorization::missing);
                    auth.item(asset.workspace(), project, asset.item(), true);
                    if (asset.state().equals("DELETED")) return;
                    if (assets.referenced(asset))
                        throw new ApiException(
                                HttpStatus.CONFLICT,
                                "ASSET_IN_USE",
                                "Unselect this file and save its answer before deleting it.");
                    assets.release(asset, "DELETED", null, clock.instant());
                    audit.writeClient(
                            asset.workspace(),
                            project,
                            a.grant().contact(),
                            "CLIENT_ASSET_REMOVED",
                            asset.id(),
                            clock.instant());
                });
    }

    public Map<String, String> clientDownload(
            String cookie, UUID project, UUID id, String variant) {
        return tx.execute(
                s -> {
                    var a = auth.client(cookie, project, false);
                    return download(a.grant().workspace(), project, id, variant);
                });
    }

    public Map<String, String> agencyDownload(
            UUID workspace, UUID project, UUID id, String variant) {
        return tx.execute(
                s -> {
                    auth.agency(workspace, project);
                    return download(workspace, project, id, variant);
                });
    }

    private Map<String, String> download(UUID workspace, UUID project, UUID id, String variant) {
        var asset = assets.find(workspace, project, id).orElseThrow(ProjectAuthorization::missing);
        if (!assets.retained(asset)) auth.item(workspace, project, asset.item(), false);
        if (!asset.state().equals("READY"))
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "ASSET_NOT_READY",
                    "This file is not available for download.");
        String path = asset.variants().path(variant).asText();
        if (path.isBlank()) throw ProjectAuthorization.missing();
        try {
            return Map.of(
                    "url",
                    storage.download(
                            path, asset.name(), asset.detectedType(), Duration.ofSeconds(60)));
        } catch (RuntimeException e) {
            throw unavailable();
        }
    }

    public void validateReferences(UUID workspace, UUID project, UUID item, JsonNode value) {
        var ids = new ArrayList<String>();
        if (value.has("assetIds")) for (var id : value.path("assetIds")) ids.add(id.asText());
        if (value.has("rows"))
            for (var row : value.path("rows"))
                for (var cell : row.path("values"))
                    if (cell.isArray()) for (var id : cell) ids.add(id.asText());
        for (String raw : ids) {
            UUID id;
            try {
                id = UUID.fromString(raw);
            } catch (IllegalArgumentException e) {
                throw new ApiException(
                        HttpStatus.UNPROCESSABLE_CONTENT,
                        "INVALID_ASSET_REFERENCE",
                        "Use a valid uploaded file identifier.");
            }
            var asset =
                    assets.find(workspace, project, id)
                            .orElseThrow(
                                    () ->
                                            new ApiException(
                                                    HttpStatus.UNPROCESSABLE_CONTENT,
                                                    "INVALID_ASSET_REFERENCE",
                                                    "The referenced file is unavailable in this"
                                                            + " project."));
            if (!asset.item().equals(item) || !asset.state().equals("READY"))
                throw new ApiException(
                        HttpStatus.UNPROCESSABLE_CONTENT,
                        "INVALID_ASSET_REFERENCE",
                        "Only verified files for this question can be saved.");
        }
    }

    /**
     * Called under the existing project lock: READY bytes must still exist before linking history.
     */
    public void validateSubmissionObjects(
            UUID workspace, UUID project, UUID item, JsonNode field, JsonNode value) {
        validateReferences(workspace, project, item, value);
        var ids = new HashSet<String>();
        if (value.has("assetIds")) for (var id : value.path("assetIds")) ids.add(id.asText());
        if (value.has("rows"))
            for (var row : value.path("rows"))
                for (var cell : row.path("values"))
                    if (cell.isArray()) for (var id : cell) ids.add(id.asText());
        for (var id : ids) {
            var asset =
                    assets.find(workspace, project, UUID.fromString(id))
                            .orElseThrow(ProjectAuthorization::missing);
            if (Set.of("IMAGE", "REPEATER").contains(field.path("type").asText())
                    && !Set.of("image/png", "image/jpeg").contains(asset.detectedType()))
                throw new ApiException(
                        HttpStatus.UNPROCESSABLE_CONTENT,
                        "INVALID_ASSET_REFERENCE",
                        "Choose a verified image for this field.");
            try {
                for (var path : asset.variants())
                    if (storage.headPrivate(path.asText()).bytes() <= 0) throw unavailable();
            } catch (RuntimeException e) {
                throw unavailable();
            }
        }
    }

    private static ApiException unavailable() {
        return new ApiException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "STORAGE_UNAVAILABLE",
                "Private storage is currently unavailable. Your saved answers have been kept.");
    }
}

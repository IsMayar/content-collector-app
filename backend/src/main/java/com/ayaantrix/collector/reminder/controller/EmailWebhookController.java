package com.ayaantrix.collector.reminder.controller;

import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.repository.IdempotencyRepository;
import com.ayaantrix.collector.reminder.repository.ReminderRepository;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;

@RestController
public class EmailWebhookController {
    private final com.ayaantrix.collector.visibility.service.DigestService digests;
    private final byte[] key;
    private final String canonical;
    private final ReminderRepository repo;
    private final JsonMapper json;
    private final Clock clock;
    private final com.ayaantrix.collector.reminder.service.DeliveryReconciliationService
            reconciliation;
    private final com.ayaantrix.collector.workspace.repository.WorkspaceRepository workspaces;
    private final com.ayaantrix.collector.project.repository.ProjectRepository projects;

    public EmailWebhookController(
            @Value("${collector.reminders.webhook-secret:}") String secret,
            @Value("${collector.reminders.webhook-url:}") String canonical,
            ReminderRepository repo,
            com.ayaantrix.collector.visibility.service.DigestService digests,
            JsonMapper json,
            Clock clock,
            com.ayaantrix.collector.reminder.service.DeliveryReconciliationService reconciliation,
            com.ayaantrix.collector.workspace.repository.WorkspaceRepository workspaces,
            com.ayaantrix.collector.project.repository.ProjectRepository projects) {
        this.digests = digests;
        this.workspaces = workspaces;
        this.reconciliation = reconciliation;
        this.projects = projects;
        this.repo = repo;
        this.json = json;
        this.clock = clock;
        this.canonical = canonical;
        try {
            key =
                    secret.isBlank()
                            ? null
                            : Base64.getDecoder().decode(secret.replaceFirst("^whsec_", ""));
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("Invalid email webhook secret.");
        }
    }

    @PostMapping("/api/v1/webhooks/email")
    @Transactional
    public Map<String, Boolean> event(HttpServletRequest request) throws java.io.IOException {
        byte[] raw = request.getInputStream().readNBytes(65537);
        if (raw.length > 65536)
            throw new ApiException(
                    HttpStatus.PAYLOAD_TOO_LARGE, "PAYLOAD_TOO_LARGE", "Webhook too large.");
        String body = new String(raw, StandardCharsets.UTF_8),
                id = request.getHeader("svix-id"),
                time = request.getHeader("svix-timestamp"),
                signature = request.getHeader("svix-signature");
        boolean valid = false;
        try {
            if (key == null
                    || canonical.isBlank()
                    || !canonical.equals(request.getRequestURL().toString())
                    || id == null
                    || !id.matches("[A-Za-z0-9_-]{1,200}")
                    || signature == null
                    || signature.length() > 4096
                    || Instant.ofEpochSecond(Long.parseLong(time))
                            .isBefore(clock.instant().minusSeconds(300))
                    || Instant.ofEpochSecond(Long.parseLong(time))
                            .isAfter(clock.instant().plusSeconds(300))
                    || request.getQueryString() != null) throw new IllegalArgumentException();
            var mac = javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(new javax.crypto.spec.SecretKeySpec(key, "HmacSHA256"));
            byte[] expected =
                    mac.doFinal((id + "." + time + "." + body).getBytes(StandardCharsets.UTF_8));
            for (String part : signature.split(" ")) {
                if (part.startsWith("v1,"))
                    try {
                        valid |=
                                java.security.MessageDigest.isEqual(
                                        expected, Base64.getDecoder().decode(part.substring(3)));
                    } catch (IllegalArgumentException ignored) {
                    }
            }
        } catch (Exception ignored) {
        }
        if (!valid)
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "INVALID_WEBHOOK_SIGNATURE",
                    "Webhook verification failed.");
        try {
            var payload = json.readTree(body);
            String provider = payload.path("data").path("email_id").asString(),
                    type = payload.path("type").asString();
            Instant occurred = Instant.parse(payload.path("created_at").asString());
            if (provider.isBlank() || provider.length() > 200 || type.length() > 80)
                throw new IllegalArgumentException();
            var data = payload.path("data");
            String tagged = tag(data.path("tags"), "collector_delivery_id");
            String digest = tag(data.path("tags"), "collector_digest_id");
            if (tagged != null && digest != null) throw new IllegalArgumentException();
            UUID attempt = tagged == null ? null : UUID.fromString(tagged);
            String recipient =
                    data.path("to").isArray() && data.path("to").size() == 1
                            ? data.path("to").get(0).asString()
                            : null;
            String state =
                    com.ayaantrix.collector.reminder.service.DeliveryReconciliationService
                            .normalized("EMAIL", type);
            if (digest != null)
                digests.receipt(UUID.fromString(digest), provider, recipient, state);
            else reconciliation.evidence(attempt, "EMAIL", provider, recipient, state);
            repo.provider(provider)
                    .ifPresent(
                            d -> {
                                workspaces.lockInvitationWorkspace(d.workspace());
                                projects.lockForStructure(d.workspace(), d.project());
                            });
            repo.event(
                    id,
                    IdempotencyRepository.hash(body),
                    provider,
                    type,
                    occurred,
                    clock.instant());
            if (digest != null) digests.reconcile(UUID.fromString(digest));
            return Map.of("accepted", true);
        } catch (IllegalArgumentException e) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Invalid webhook event.");
        }
    }

    private static String tag(tools.jackson.databind.JsonNode tags, String name) {
        String result = null;
        if (tags.isObject()) return tags.path(name).asString(null);
        if (tags.isArray())
            for (var tag : tags)
                if (tag.path("name").asString().equals(name)) {
                    if (result != null) throw new IllegalArgumentException();
                    result = tag.path("value").asString();
                }
        return result;
    }
}

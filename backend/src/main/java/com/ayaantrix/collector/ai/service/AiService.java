package com.ayaantrix.collector.ai.service;

import com.ayaantrix.collector.ai.config.AiSettings;
import com.ayaantrix.collector.ai.dto.AiDtos.*;
import com.ayaantrix.collector.ai.provider.AiDraftProvider;
import com.ayaantrix.collector.ai.repository.AiRepository;
import com.ayaantrix.collector.ai.security.AiAuthorization;
import com.ayaantrix.collector.clientaccess.security.ClientAccessAuthorization;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.repository.*;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.util.*;

@Service
@Transactional
public class AiService {
    private final ClientAccessAuthorization auth;
    private final AiAuthorization policy;
    private final AiRepository jobs;
    private final AiDraftProvider provider;
    private final AiSettings settings;
    private final IdempotencyRepository requests;
    private final AuditRepository audit;
    private final JsonMapper json;
    private final Clock clock;

    public AiService(
            ClientAccessAuthorization auth,
            AiAuthorization policy,
            AiRepository jobs,
            AiDraftProvider provider,
            AiSettings settings,
            IdempotencyRepository requests,
            AuditRepository audit,
            JsonMapper json,
            Clock clock) {
        this.auth = auth;
        this.policy = policy;
        this.jobs = jobs;
        this.provider = provider;
        this.settings = settings;
        this.requests = requests;
        this.audit = audit;
        this.json = json;
        this.clock = clock;
    }

    public Map<String, Object> create(String cookie, UUID p, UUID i, Create input, String key) {
        var a = auth.require(cookie, p);
        var field = policy.field(a, i, true);
        var w = a.grant().workspace();
        var contact = a.grant().contact();
        var now = clock.instant();
        String route = "client/projects/" + p + "/items/" + i + "/ai-drafts",
                hash = IdempotencyRepository.hash(json.writeValueAsString(input));
        var replay = requests.replay(w, contact, route, key, hash, now);
        if (replay.isPresent())
            return json.readValue(
                    replay.get(),
                    new tools.jackson.core.type.TypeReference<Map<String, Object>>() {});
        if (!input.consent()
                || input.facts() == null
                || input.facts().isEmpty()
                || input.facts().size() > 10
                || input.facts().stream()
                        .anyMatch(f -> f == null || f.isBlank() || f.length() > 1000)
                || input.facts().stream().mapToInt(String::length).sum() > 5000
                || !Set.of("Clear and friendly", "Professional", "Concise").contains(input.tone())
                || input.targetWords() < 30
                || input.targetWords() > 500
                || input.baseAnswerVersion() < 0)
            throw new ApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "VALIDATION_FAILED",
                    "Provide up to 5000 characters of facts, consent, tone and a 30–500 word"
                            + " target.");
        if (policy.version(a, i) != input.baseAnswerVersion())
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "ANSWER_VERSION_CONFLICT",
                    "Your answer changed. Save and reload before generating a suggestion.",
                    policy.version(a, i));
        if (!provider.available()
                || settings.inputRate <= 0
                || settings.outputRate <= 0
                || settings.budget <= 0
                || settings.model.isBlank())
            throw new ApiException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "AI_UNAVAILABLE",
                    "AI assistance is unavailable. You can keep writing manually.");
        var request =
                new AiDraftProvider.Input(
                        settings.model,
                        a.project().projectType().name(),
                        field.path("label").asText(),
                        field.path("instructions").asText(),
                        List.copyOf(input.facts()),
                        input.tone(),
                        input.targetWords(),
                        settings.outputTokens);
        var snapshot = json.valueToTree(request);
        long bound = json.writeValueAsBytes(snapshot).length + 16384L;
        long cost =
                Math.multiplyExact(
                        2,
                        Math.addExact(
                                Math.multiplyExact(bound, settings.inputRate),
                                Math.multiplyExact(settings.outputTokens, settings.outputRate)));
        var period =
                jobs.reserve(w, policy.allowance(a), settings.budget, cost, now)
                        .orElseThrow(
                                () ->
                                        new ApiException(
                                                HttpStatus.TOO_MANY_REQUESTS,
                                                "AI_ALLOWANCE_EXHAUSTED",
                                                "AI allowance or safety budget is exhausted. You"
                                                        + " can keep writing manually."));
        UUID id = UUID.randomUUID();
        jobs.insert(
                id,
                w,
                p,
                i,
                contact,
                period,
                input.baseAnswerVersion(),
                snapshot,
                settings.model,
                settings.inputRate,
                settings.outputRate,
                bound,
                settings.outputTokens,
                cost,
                now);
        audit.writeClient(w, p, contact, "AI_DRAFT_REQUESTED", i, now);
        var result = Map.<String, Object>of("jobId", id, "state", "QUEUED");
        requests.remember(w, contact, route, key, hash, json.writeValueAsString(result), 202, now);
        return result;
    }

    public Map<String, Object> get(String cookie, UUID p, UUID id) {
        var a = auth.require(cookie, p);
        var j =
                jobs.find(a.grant().workspace(), p, id)
                        .filter(job -> job.contact().equals(a.grant().contact()))
                        .orElseThrow(
                                () ->
                                        new ApiException(
                                                HttpStatus.NOT_FOUND,
                                                "NOT_FOUND",
                                                "This suggestion is unavailable."));
        policy.field(a, j.item(), false);
        boolean expired = !clock.instant().isBefore(j.expires());
        return Map.of(
                "job",
                new Job(
                        j.id(),
                        j.item(),
                        expired ? "EXPIRED" : j.state(),
                        j.version(),
                        expired || j.result() == null
                                ? null
                                : json.treeToValue(j.result(), Result.class),
                        expired ? "AI_EXPIRED" : j.failure()));
    }
}

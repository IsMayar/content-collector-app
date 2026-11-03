package com.ayaantrix.collector.analytics.service;

import com.ayaantrix.collector.analytics.repository.InteractionRepository;
import com.ayaantrix.collector.auth.security.SecureAccountTokens;
import com.ayaantrix.collector.clientaccess.security.ClientAccessAuthorization;
import com.ayaantrix.collector.collection.repository.ClientAnswerRepository;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.project.repository.ProjectStructureRepository;
import com.ayaantrix.collector.project.service.ProjectDraftVisibility;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.JsonNode;

import java.time.*;
import java.util.*;

@Service
@Transactional
public class InteractionService {
    private final com.ayaantrix.collector.clientaccess.repository.ClientSessionRepository sessions;
    private final ClientAccessAuthorization auth;
    private final InteractionRepository repo;
    private final SecureAccountTokens tokens;
    private final ProjectStructureRepository structures;
    private final ClientAnswerRepository answers;
    private final Clock clock;

    public InteractionService(
            com.ayaantrix.collector.clientaccess.repository.ClientSessionRepository sessions,
            ClientAccessAuthorization auth,
            InteractionRepository repo,
            SecureAccountTokens tokens,
            ProjectStructureRepository structures,
            ClientAnswerRepository answers,
            Clock clock) {
        this.sessions = sessions;
        this.auth = auth;
        this.repo = repo;
        this.tokens = tokens;
        this.structures = structures;
        this.answers = answers;
        this.clock = clock;
    }

    private record Event(UUID id, String type, UUID item, Instant reported) {}

    public Map<String, Integer> record(String cookie, UUID project, JsonNode body) {
        var a = auth.require(cookie, project);
        UUID w = a.project().workspaceId();
        // Validate the complete allowlisted payload before writing any row. No arbitrary metadata
        // accepted.
        keys(body, Set.of("events"));
        var list = body.path("events");
        if (!list.isArray() || list.size() < 1 || list.size() > 20) throw invalid();
        var events = new ArrayList<Event>();
        var source = structures.structure(w, project);
        var drafts = answers.drafts(w, project);
        var values =
                drafts.entrySet().stream()
                        .collect(
                                java.util.stream.Collectors.toMap(
                                        Map.Entry::getKey, e -> e.getValue().answer().value()));
        for (var e : list) {
            keys(e, Set.of("clientEventId", "type", "itemId", "occurredAt"));
            UUID id = uuid(e.path("clientEventId"));
            String type = e.path("type").asText();
            if (!Set.of("project_opened", "item_started").contains(type)) throw invalid();
            UUID item = null;
            if (type.equals("item_started")) {
                item = uuid(e.path("itemId"));
                boolean visible = false;
                for (var s : source)
                    for (var i : s.path("items"))
                        if (i.path("id").asText().equals(item.toString())
                                && ProjectDraftVisibility.visible(s, i, source, values))
                            visible = true;
                if (!visible)
                    throw new ApiException(
                            HttpStatus.NOT_FOUND, "NOT_FOUND", "This question is unavailable.");
            } else if (e.has("itemId")) throw invalid();
            Instant reported = null;
            if (e.has("occurredAt")) {
                if (!e.path("occurredAt").isTextual()) throw invalid();
                try {
                    reported = Instant.parse(e.path("occurredAt").asText());
                    if (reported.isBefore(Instant.parse("2000-01-01T00:00:00Z"))
                            || reported.isAfter(clock.instant().plus(Duration.ofDays(1))))
                        throw invalid();
                } catch (java.time.format.DateTimeParseException ex) {
                    throw invalid();
                }
            }
            events.add(new Event(id, type, item, reported));
        }
        if (repo.excluded(w, project)) return Map.of("accepted", 0);
        // Domain-separated session UUID hash, never the cookie or its authentication lookup digest.
        String pseudonym =
                com.ayaantrix.collector.common.repository.IdempotencyRepository.hash(
                        "analytics-session:"
                                + sessions.findByTokenHash(tokens.digest(cookie))
                                        .orElseThrow(ClientAccessAuthorization::unavailable)
                                        .id());
        int accepted = 0;
        var received = clock.instant();
        for (var e : events)
            accepted +=
                    repo.insert(
                            w,
                            project,
                            a.project().sourceTemplateVersionId(),
                            pseudonym,
                            e.id(),
                            e.type(),
                            e.item(),
                            received,
                            e.reported());
        return Map.of("accepted", accepted);
    }

    private static UUID uuid(JsonNode n) {
        if (!n.isTextual() || n.asText().length() != 36) throw invalid();
        try {
            return UUID.fromString(n.asText());
        } catch (IllegalArgumentException ex) {
            throw invalid();
        }
    }

    private static void keys(JsonNode n, Set<String> allowed) {
        if (!n.isObject() || n.properties().stream().anyMatch(e -> !allowed.contains(e.getKey())))
            throw invalid();
    }

    private static ApiException invalid() {
        return new ApiException(
                HttpStatus.BAD_REQUEST,
                "INVALID_INTERACTION_EVENT",
                "Use only the documented minimal interaction event fields.");
    }
}

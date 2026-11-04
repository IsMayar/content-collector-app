package com.ayaantrix.collector.visibility.service;

import com.ayaantrix.collector.auth.security.*;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.repository.*;
import com.ayaantrix.collector.project.repository.*;
import com.ayaantrix.collector.project.security.ProjectAuthorization;
import com.ayaantrix.collector.visibility.dto.VisibilityDtos.*;
import com.ayaantrix.collector.visibility.repository.ShareRepository;
import com.ayaantrix.collector.visibility.repository.ShareRepository.Share;
import com.ayaantrix.collector.visibility.security.ShareOrigins;
import com.ayaantrix.collector.workspace.repository.WorkspaceRepository;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;

@Service
@Transactional
public class ShareService {
    private final ProjectAuthorization auth;
    private final ProjectRepository projects;
    private final WorkspaceRepository workspaces;
    private final ProjectStructureRepository structures;
    private final ShareRepository repo;
    private final SecureAccountTokens secrets;
    private final AccessTokens jwt;
    private final IdempotencyRepository requests;
    private final AuditRepository audit;
    private final Clock clock;

    public ShareService(
            ProjectAuthorization auth,
            ProjectRepository projects,
            WorkspaceRepository workspaces,
            ProjectStructureRepository structures,
            ShareRepository repo,
            SecureAccountTokens secrets,
            AccessTokens jwt,
            IdempotencyRepository requests,
            AuditRepository audit,
            Clock clock) {
        this.auth = auth;
        this.projects = projects;
        this.workspaces = workspaces;
        this.structures = structures;
        this.repo = repo;
        this.secrets = secrets;
        this.jwt = jwt;
        this.requests = requests;
        this.audit = audit;
        this.clock = clock;
    }

    public CreatedShare create(UUID w, UUID p, CreateShare input, String key) {
        var a = auth.access(w, true);
        auth.writable(a);
        projects.lockForStructure(w, p)
                .filter(x -> !x.state().name().equals("DELETION_PENDING"))
                .orElseThrow(ProjectAuthorization::missing);
        var now = clock.instant();
        if (input.expiresAt() == null
                || !input.expiresAt().isAfter(now)
                || input.expiresAt().isAfter(now.plus(Duration.ofDays(30)))
                || input.alias() == null
                || input.alias().isBlank()
                || input.alias().length() > 80
                || input.alias().chars().anyMatch(Character::isISOControl))
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_STATUS_SHARE",
                    "Choose a neutral alias and expiry within thirty days.");
        var origins = ShareOrigins.validate(input.allowedOrigins());
        String route = "status-share:" + p,
                hash =
                        IdempotencyRepository.hash(
                                input.alias() + ":" + input.expiresAt() + ":" + origins);
        var old = requests.replay(w, a.member().userId(), route, key, hash, now);
        if (old.isPresent()) {
            UUID id = UUID.fromString(old.get().substring(1, old.get().length() - 1));
            return new CreatedShare(id, null, "/status/" + id);
        }
        UUID id = UUID.randomUUID();
        String raw = secrets.generate();
        repo.create(
                id,
                w,
                p,
                input.alias().strip(),
                secrets.digest(raw),
                origins,
                input.expiresAt(),
                now);
        audit.write(
                w,
                p,
                a.member().userId(),
                "STATUS_SHARE_CREATED",
                "STATUS_SHARE",
                id,
                Map.of(),
                now);
        requests.remember(
                w,
                a.member().userId(),
                route,
                key,
                hash,
                Character.toString(34) + id + Character.toString(34),
                201,
                now);
        return new CreatedShare(id, raw, "/status/" + id + "#token=" + raw);
    }

    public void revoke(UUID w, UUID p, UUID id) {
        var a = auth.access(w, true);
        projects.lockForStructure(w, p).orElseThrow(ProjectAuthorization::missing);
        if (!repo.revoke(w, p, id, clock.instant())) throw ProjectAuthorization.missing();
        audit.write(
                w,
                p,
                a.member().userId(),
                "STATUS_SHARE_REVOKED",
                "STATUS_SHARE",
                id,
                Map.of(),
                clock.instant());
    }

    private Share live(UUID id) {
        var candidate = repo.find(id).orElseThrow(ShareService::unavailable);
        var w =
                workspaces
                        .lockInvitationWorkspace(candidate.workspace())
                        .filter(x -> Set.of("ACTIVE", "READ_ONLY").contains(x.state().name()))
                        .orElseThrow(ShareService::unavailable);
        projects.lockForStructure(w.id(), candidate.project())
                .filter(x -> !x.state().name().equals("DELETION_PENDING"))
                .orElseThrow(ShareService::unavailable);
        var s = repo.find(id).orElseThrow(ShareService::unavailable);
        if (s.revoked() != null || !clock.instant().isBefore(s.expires())) throw unavailable();
        return s;
    }

    public ReadToken exchange(Exchange input) {
        var s = live(input.shareId());
        String hash;
        try {
            hash = secrets.digest(input.token());
        } catch (IllegalArgumentException e) {
            throw unavailable();
        }
        if (!java.security.MessageDigest.isEqual(
                hash.getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                s.hash().getBytes(java.nio.charset.StandardCharsets.US_ASCII))) throw unavailable();
        return new ReadToken(jwt.issueStatus(s.id()));
    }

    public Counts counts(UUID id, String token) {
        try {
            if (!id.equals(jwt.statusShare(token))) throw unavailable();
        } catch (org.springframework.security.oauth2.jwt.JwtException ex) {
            throw unavailable();
        }
        var s = live(id);
        var p = structures.progress(s.workspace(), List.of(s.project())).get(s.project());
        return new Counts(
                s.alias(),
                p.approvedRequired(),
                p.submittedRequired(),
                p.requiredTotal(),
                repo.updatedAt(s.workspace(), s.project()));
    }

    public List<String> origins(UUID id) {
        return live(id).origins();
    }

    public static ApiException unavailable() {
        return new ApiException(
                HttpStatus.NOT_FOUND,
                "STATUS_SHARE_UNAVAILABLE",
                "This status link is unavailable, revoked or expired.");
    }
}

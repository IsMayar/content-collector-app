package com.ayaantrix.collector.visibility.service;

import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.project.repository.ProjectStructureRepository;
import com.ayaantrix.collector.project.security.ProjectAuthorization;
import com.ayaantrix.collector.visibility.dto.VisibilityDtos.*;
import com.ayaantrix.collector.visibility.repository.DigestRepository;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;

@Service
@Transactional
public class DigestService {
    private final com.ayaantrix.collector.workspace.repository.WorkspaceRepository workspaces;
    private final com.ayaantrix.collector.submission.repository.SubmissionRepository revisions;
    private final ProjectAuthorization auth;
    private final DigestRepository repo;
    private final ProjectStructureRepository structures;
    private final Clock clock;
    private final String base;

    public DigestService(
            com.ayaantrix.collector.workspace.repository.WorkspaceRepository workspaces,
            com.ayaantrix.collector.submission.repository.SubmissionRepository revisions,
            ProjectAuthorization auth,
            DigestRepository repo,
            ProjectStructureRepository structures,
            Clock clock,
            @Value("${collector.delivery.app-base-url:http://localhost:5173}") String base) {
        this.workspaces = workspaces;
        this.revisions = revisions;
        this.auth = auth;
        this.repo = repo;
        this.structures = structures;
        this.clock = clock;
        var u = java.net.URI.create(base);
        if (!"https".equals(u.getScheme())
                        && !("http".equals(u.getScheme())
                                && Set.of("localhost", "127.0.0.1").contains(u.getHost()))
                || u.getRawQuery() != null
                || u.getRawFragment() != null
                || u.getUserInfo() != null)
            throw new IllegalStateException("Invalid private application URL.");
        this.base = base.replaceAll("/+$", "");
    }

    public Preference preference(UUID w) {
        var a = auth.access(w, false);
        return new Preference(
                repo.enabled(w, a.member().id()),
                repo.version(w, a.member().id()),
                a.workspace().timezone(),
                "09:00");
    }

    public Preference save(UUID w, SavePreference input) {
        var a = auth.access(w, false);
        if (input.expectedVersion() != repo.version(w, a.member().id()))
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "DIGEST_VERSION_CONFLICT",
                    "Digest preferences changed. Reload before saving.");
        repo.preference(w, a.member().id(), input.enabled(), clock.instant());
        return preference(w);
    }

    public DigestPreview preview(UUID w) {
        var a = auth.access(w, false);
        var r = repo.recipient(w, a.member().id()).orElseThrow(ProjectAuthorization::missing);
        return new DigestPreview(r.timezone(), "09:00", projects(r));
    }

    public List<ProjectDigest> projects(DigestRepository.Recipient r) {
        var rows = repo.projects(r, clock.instant());
        var counts =
                structures.progress(
                        r.workspace(), rows.stream().map(DigestRepository.ProjectRow::id).toList());
        return rows.stream()
                .map(
                        p -> {
                            var c = counts.get(p.id());
                            return new ProjectDigest(
                                    p.alias(),
                                    revisions.queueCount(r.workspace(), p.id()),
                                    c.clientActionRequired(),
                                    base + "/app/w/" + r.workspace() + "/projects/" + p.id());
                        })
                .toList();
    }

    /** Only call after the existing email webhook signature/canonical URL verification. */
    public void receipt(UUID id, String provider, String email, String state) {
        var candidate = repo.receiptJob(id).orElseThrow(DigestService::mismatch);
        workspaces.lockInvitationWorkspace(candidate.workspace());
        var r = repo.receiptJob(id).orElseThrow(DigestService::mismatch);
        if (!r.prepared()
                || email == null
                || !r.email().equalsIgnoreCase(email.strip())
                || r.provider() != null && !r.provider().equals(provider)) throw mismatch();
        repo.bind(id, provider, clock.instant());
        if (!r.state().equals("SENDING")) apply(id, r, state);
    }

    public void reconcile(UUID id) {
        var candidate = repo.receiptJob(id);
        if (candidate.isEmpty()) return;
        workspaces.lockInvitationWorkspace(candidate.get().workspace());
        var r = repo.receiptJob(id).orElseThrow();
        if (r.provider() != null)
            for (String event : repo.events(r.provider()))
                apply(
                        id,
                        r,
                        com.ayaantrix.collector.reminder.service.DeliveryReconciliationService
                                .normalized("EMAIL", event));
    }

    private void apply(UUID id, DigestRepository.ReceiptJob r, String state) {
        if (state == null) return;
        if (java.util.Set.of("BOUNCED", "SUPPRESSED").contains(state)
                && repo.enabled(r.workspace(), r.member()))
            repo.preference(r.workspace(), r.member(), false, clock.instant());
        String target =
                java.util.Set.of("ACCEPTED", "DELIVERED").contains(state) ? "ACCEPTED" : "FAILED";
        repo.resolve(id, target, clock.instant());
    }

    private static ApiException mismatch() {
        return new ApiException(
                HttpStatus.BAD_REQUEST,
                "PROVIDER_EVIDENCE_MISMATCH",
                "Provider evidence does not match the digest.");
    }
}

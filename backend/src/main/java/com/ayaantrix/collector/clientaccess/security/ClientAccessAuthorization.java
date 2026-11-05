package com.ayaantrix.collector.clientaccess.security;

import com.ayaantrix.collector.auth.security.SecureAccountTokens;
import com.ayaantrix.collector.clientaccess.entity.ClientSession;
import com.ayaantrix.collector.clientaccess.repository.*;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.project.entity.Project;
import com.ayaantrix.collector.project.repository.ProjectRepository;
import com.ayaantrix.collector.workspace.entity.Workspace;
import com.ayaantrix.collector.workspace.repository.WorkspaceRepository;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

import java.time.Clock;
import java.util.*;

@Component
@Transactional(propagation = Propagation.MANDATORY)
public class ClientAccessAuthorization {
    public record Access(
            ClientAccessRepository.Grant grant, Project project, Workspace workspace) {}

    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager entities;
    private final ClientAccessRepository grants;
    private final ClientSessionRepository sessions;
    private final WorkspaceRepository workspaces;
    private final ProjectRepository projects;
    private final SecureAccountTokens tokens;
    private final Clock clock;
    private final com.ayaantrix.collector.workspace.repository.WorkspaceSubscriptionRepository
            plans;

    public ClientAccessAuthorization(
            ClientAccessRepository grants,
            ClientSessionRepository sessions,
            WorkspaceRepository workspaces,
            ProjectRepository projects,
            SecureAccountTokens tokens,
            Clock clock,
            com.ayaantrix.collector.workspace.repository.WorkspaceSubscriptionRepository plans) {
        this.plans = plans;
        this.grants = grants;
        this.sessions = sessions;
        this.workspaces = workspaces;
        this.projects = projects;
        this.tokens = tokens;
        this.clock = clock;
    }

    public Access grant(UUID workspace, UUID project, UUID contact, boolean delivery) {
        return available(workspace, project, contact, delivery)
                .orElseThrow(ClientAccessAuthorization::unavailable);
    }

    public Optional<Access> available(
            UUID workspace, UUID project, UUID contact, boolean delivery) {
        var w =
                workspaces
                        .lockInvitationWorkspace(workspace)
                        .orElseThrow(ClientAccessAuthorization::unavailable);
        var p =
                projects.lockForStructure(workspace, project)
                        .orElseThrow(ClientAccessAuthorization::unavailable);
        var g =
                grants.contact(workspace, project, contact)
                        .orElseThrow(ClientAccessAuthorization::unavailable);
        var now = clock.instant();
        if (!Set.of("ACTIVE", "READ_ONLY").contains(w.state().name())
                || !Set.of("ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED").contains(p.state().name())
                || (delivery && p.state().name().equals("ARCHIVED"))
                || !g.state().equals("ACTIVE")
                || g.initialized() == null
                || !now.isBefore(g.expires())) return Optional.empty();
        if (delivery
                && plans.lockedForWorkspace(workspace).filter(plan -> plan.readable(now)).isEmpty())
            return Optional.empty();
        return Optional.of(new Access(g, p, w));
    }

    public Access require(String raw, UUID project) {
        var access = notificationSession(raw, project);
        if (plans.lockedForWorkspace(access.workspace().id())
                .filter(plan -> plan.readable(clock.instant()))
                .isEmpty()) throw unavailable();
        return access;
    }

    /** Live identity only, exclusively for own notification preferences/consent withdrawal. */
    public Access notificationSession(String raw, UUID project) {
        var s = session(raw);
        if (!s.projectId().equals(project))
            throw new ApiException(
                    HttpStatus.NOT_FOUND, "NOT_FOUND", "The requested project is unavailable.");
        var access = grant(s.workspaceId(), project, s.contactId(), false);
        // Workspace/project lock serializes access against grant revocation. Reload after acquiring
        // it.
        entities.refresh(s, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        if (!s.usable(clock.instant())) throw unavailable();
        s.seen(clock.instant());
        sessions.saveAndFlush(s);
        return access;
    }

    private ClientSession session(String raw) {
        try {
            return sessions.findByTokenHash(tokens.digest(raw))
                    .filter(s -> s.usable(clock.instant()))
                    .orElseThrow(ClientAccessAuthorization::unavailable);
        } catch (IllegalArgumentException e) {
            throw unavailable();
        }
    }

    public boolean canWrite(Access access) {
        return access.workspace().state() == Workspace.State.ACTIVE
                && access.project().state().name().equals("ACTIVE")
                && plans.lockedForWorkspace(access.workspace().id())
                        .filter(plan -> plan.writable(clock.instant()))
                        .isPresent();
    }

    public void writable(Access access) {
        if (!canWrite(access))
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "WORKSPACE_READ_ONLY",
                    "This project is read-only. You can still view content during the read-only"
                            + " access period.");
    }

    public static ApiException unavailable() {
        return new ApiException(
                HttpStatus.UNAUTHORIZED,
                "CLIENT_ACCESS_UNAVAILABLE",
                "This project link or session has expired, was revoked, or is unavailable. Request"
                        + " a fresh link from your agency.");
    }
}

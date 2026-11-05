package com.ayaantrix.collector.project.security;

import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.workspace.entity.*;
import com.ayaantrix.collector.workspace.repository.WorkspaceSubscriptionRepository;
import com.ayaantrix.collector.workspace.security.WorkspaceAuthorization;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

import java.time.Clock;
import java.util.UUID;

@Component
@Transactional(propagation = Propagation.MANDATORY)
public class ProjectAuthorization {
    private final com.ayaantrix.collector.project.repository.ProjectAssignmentRepository
            assignments;
    private final WorkspaceAuthorization workspaces;
    private final WorkspaceSubscriptionRepository plans;
    private final Clock clock;

    ProjectAuthorization(
            WorkspaceAuthorization workspaces,
            WorkspaceSubscriptionRepository plans,
            Clock clock,
            com.ayaantrix.collector.project.repository.ProjectAssignmentRepository assignments) {
        this.workspaces = workspaces;
        this.plans = plans;
        this.clock = clock;
        this.assignments = assignments;
    }

    public WorkspaceAuthorization.Access access(UUID workspace, boolean owner) {
        return workspaces.require(workspace, workspaces.actor(), owner);
    }

    public boolean owner(WorkspaceAuthorization.Access access) {
        return access.member().role() == WorkspaceRole.OWNER;
    }

    public void writable(WorkspaceAuthorization.Access access) {
        if (!canWrite(access))
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "WORKSPACE_READ_ONLY",
                    "Workspace changes are unavailable.");
    }

    public boolean canWrite(WorkspaceAuthorization.Access access) {
        return access.workspace().state() == Workspace.State.ACTIVE
                && plans.lockedForWorkspace(access.workspace().id())
                        .filter(s -> s.writable(clock.instant()))
                        .isPresent();
    }

    public void readableProject(WorkspaceAuthorization.Access access) {
        readableUntil(access);
        // Customer management and owner preview remain owner-only even with a project assignment.
        if (!owner(access)) throw missing();
    }

    public void readableProject(WorkspaceAuthorization.Access access, UUID project) {
        readableUntil(access);
        if (!owner(access)
                && assignments
                        .findByWorkspaceIdAndProjectIdAndWorkspaceMemberId(
                                access.workspace().id(), project, access.member().id())
                        .isEmpty()) throw missing();
    }

    public java.time.Instant readableUntil(WorkspaceAuthorization.Access access) {
        return plans.lockedForWorkspace(access.workspace().id())
                .filter(s -> s.readable(clock.instant()))
                .map(WorkspaceSubscription::readOnlyDeadline)
                .orElseThrow(
                        () ->
                                new ApiException(
                                        HttpStatus.FORBIDDEN,
                                        "WORKSPACE_ACCESS_EXPIRED",
                                        "The read-only access period has ended. Your workspace"
                                            + " owner can manage the subscription in billing."));
    }

    public com.ayaantrix.collector.project.dto.ProjectDtos.Permissions permissions(
            WorkspaceAuthorization.Access access, UUID project, boolean editable) {
        boolean owner = owner(access),
                write = canWrite(access),
                read =
                        plans.lockedForWorkspace(access.workspace().id())
                                .filter(s -> s.readable(clock.instant()))
                                .isPresent();
        var a =
                assignments.findByWorkspaceIdAndProjectIdAndWorkspaceMemberId(
                        access.workspace().id(), project, access.member().id());
        return new com.ayaantrix.collector.project.dto.ProjectDtos.Permissions(
                owner && write && editable,
                write && (owner || a.filter(x -> x.canReview()).isPresent()),
                read && (owner || a.filter(x -> x.canExport()).isPresent()),
                owner && write);
    }

    public static ApiException missing() {
        return new ApiException(
                HttpStatus.NOT_FOUND, "NOT_FOUND", "The requested resource is unavailable.");
    }
}

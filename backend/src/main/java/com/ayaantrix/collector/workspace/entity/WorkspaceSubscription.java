package com.ayaantrix.collector.workspace.entity;

import jakarta.persistence.*;

import java.time.*;
import java.util.UUID;

/** Authoritative entitlement periods, populated by local trials and reconciled billing. */
@Entity
@Table(name = "subscriptions", schema = "collector")
public class WorkspaceSubscription {
    public enum State {
        FREE,
        TRIALING,
        ACTIVE,
        PAST_DUE,
        READ_ONLY,
        SUSPENDED
    }

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "workspace_id", nullable = false, updatable = false)
    private UUID workspaceId;

    @Enumerated(EnumType.STRING)
    @Column(name = "plan_key", nullable = false, columnDefinition = "text")
    private PlanKey planKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "text")
    private State state;

    @Column(name = "current_period_start", nullable = false)
    private Instant currentPeriodStart;

    @Column(name = "current_period_end", nullable = false)
    private Instant currentPeriodEnd;

    @Column(name = "grace_ends_at")
    private Instant graceEndsAt;

    @Column(name = "read_only_ends_at")
    private Instant readOnlyEndsAt;

    @Column(name = "cancel_at_period_end", nullable = false)
    private boolean cancelAtPeriodEnd;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected WorkspaceSubscription() {}

    public WorkspaceSubscription(UUID workspaceId, PlanKey planKey, Instant now) {
        id = UUID.randomUUID();
        this.workspaceId = workspaceId;
        this.planKey = planKey;
        state = planKey == PlanKey.FREE ? State.FREE : State.TRIALING;
        currentPeriodStart = now;
        // Free dates are accounting windows, never access-expiry dates.
        currentPeriodEnd = planKey == PlanKey.FREE
                ? now.atZone(ZoneOffset.UTC).withDayOfMonth(1).toLocalDate()
                        .plusMonths(1).atStartOfDay(ZoneOffset.UTC).toInstant()
                : now.plus(Duration.ofDays(14));
        createdAt = now;
        updatedAt = now;
    }

    public PlanKey plan() {
        return planKey;
    }

    public PlanKey effectivePlan(Instant now) {
        return freeAt(now)
                ? PlanKey.FREE : planKey;
    }

    private boolean freeAt(Instant now) {
        return state == State.FREE || (!now.isBefore(currentPeriodEnd)
                && (state == State.TRIALING || ((state == State.ACTIVE || state == State.PAST_DUE) && cancelAtPeriodEnd)));
    }

    public boolean trial(Instant now) {
        return state == State.TRIALING && now.isBefore(currentPeriodEnd);
    }

    public boolean writable(Instant now) {
        if (now.isBefore(currentPeriodStart)) return false;
        if (freeAt(now)) return true;
        return switch (state) {
            case FREE, TRIALING -> true;
            case ACTIVE -> now.isBefore(currentPeriodEnd);
            case PAST_DUE ->
                    cancelAtPeriodEnd
                            ? now.isBefore(currentPeriodEnd)
                            : graceEndsAt != null && now.isBefore(graceEndsAt);
            default -> false;
        };
    }

    public boolean trial() {
        return state == State.TRIALING;
    }

    public State effectiveState(Instant now) {
        if (freeAt(now)) return State.FREE;
        return (state == State.TRIALING || state == State.ACTIVE || state == State.PAST_DUE)
                        && !writable(now)
                ? State.READ_ONLY
                : state;
    }

    public Instant readOnlyDeadline() {
        // A legacy trial falls back to Free; no content-access deadline is imposed.
        if (state == State.FREE || state == State.TRIALING || ((state == State.ACTIVE || state == State.PAST_DUE) && cancelAtPeriodEnd)) return Instant.MAX;
        Instant end =
                state == State.PAST_DUE && !cancelAtPeriodEnd && graceEndsAt != null
                        ? graceEndsAt
                        : currentPeriodEnd;
        Instant cutoff = end.plus(Duration.ofDays(30));
        return readOnlyEndsAt != null && (!cancelAtPeriodEnd || readOnlyEndsAt.isBefore(cutoff))
                ? readOnlyEndsAt
                : cutoff;
    }

    public boolean readable(Instant now) {
        return state != State.SUSPENDED
                && !now.isBefore(currentPeriodStart)
                && (writable(now) || now.isBefore(readOnlyDeadline()));
    }
}

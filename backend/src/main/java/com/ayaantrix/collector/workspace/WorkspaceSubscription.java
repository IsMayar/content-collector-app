package com.ayaantrix.collector.workspace;

import jakarta.persistence.*;
import java.time.*;
import java.util.UUID;

/** Local entitlement record using the reference subscriptions table; no billing adapter. */
@Entity @Table(name="subscriptions",schema="collector")
public class WorkspaceSubscription {
    public enum State { TRIALING, ACTIVE, PAST_DUE, READ_ONLY, SUSPENDED }
    @Id @Column(nullable=false,updatable=false) private UUID id;
    @Column(name="workspace_id",nullable=false,updatable=false) private UUID workspaceId;
    @Enumerated(EnumType.STRING) @Column(name="plan_key",nullable=false,columnDefinition="text") private PlanKey planKey;
    @Enumerated(EnumType.STRING) @Column(nullable=false,columnDefinition="text") private State state;
    @Column(name="current_period_start",nullable=false) private Instant currentPeriodStart;
    @Column(name="current_period_end",nullable=false) private Instant currentPeriodEnd;
    @Column(name="grace_ends_at") private Instant graceEndsAt;
    @Column(name="read_only_ends_at") private Instant readOnlyEndsAt;
    @Column(name="cancel_at_period_end",nullable=false) private boolean cancelAtPeriodEnd;
    @Column(name="created_at",nullable=false,updatable=false) private Instant createdAt;
    @Column(name="updated_at",nullable=false) private Instant updatedAt;
    protected WorkspaceSubscription(){}
    WorkspaceSubscription(UUID workspaceId,PlanKey planKey,Instant now){
        id=UUID.randomUUID();this.workspaceId=workspaceId;this.planKey=planKey;state=State.TRIALING;
        currentPeriodStart=now;currentPeriodEnd=now.plus(Duration.ofDays(14));createdAt=now;updatedAt=now;
    }
    PlanKey plan(){return planKey;}
    boolean writable(Instant now){
        if(now.isBefore(currentPeriodStart))return false;
        return switch(state){
            case TRIALING,ACTIVE -> now.isBefore(currentPeriodEnd);
            case PAST_DUE -> graceEndsAt!=null && now.isBefore(graceEndsAt) && !cancelAtPeriodEnd;
            default -> false;
        };
    }
    boolean trial(){return state==State.TRIALING;}
}

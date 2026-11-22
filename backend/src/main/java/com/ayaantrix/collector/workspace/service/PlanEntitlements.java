package com.ayaantrix.collector.workspace.service;

import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.workspace.entity.PlanKey;
import com.ayaantrix.collector.workspace.repository.WorkspaceSubscriptionRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.sql.Timestamp;
import java.util.UUID;

/** Commercial admission policy. Call after live authorization, under the workspace write lock. */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class PlanEntitlements {
    private final WorkspaceSubscriptionRepository plans;
    private final JdbcTemplate jdbc;
    private final Clock clock;
    public PlanEntitlements(WorkspaceSubscriptionRepository plans, JdbcTemplate jdbc, Clock clock) {
        this.plans = plans; this.jdbc = jdbc; this.clock = clock;
    }
    public PlanKey current(UUID workspace) {
        return plans.lockedForWorkspace(workspace)
                .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN,"WORKSPACE_READ_ONLY","Workspace subscription is unavailable."))
                .effectivePlan(clock.instant());
    }
    public void project(UUID workspace) {
        Integer max = admissionPlan(workspace).activeProjects();
        if (max != null && projects(workspace) >= max) throw limit("PROJECT_LIMIT",max);
    }
    public long projects(UUID workspace) {
        return jdbc.queryForObject("select count(*) from collector.projects where workspace_id=? and state in ('DRAFT','ACTIVE','PAUSED')",Long.class,workspace);
    }
    public void contact(UUID workspace, String normalizedEmail) {
        Integer max = admissionPlan(workspace).contacts();
        if (max == null) return;
        Long exists = jdbc.queryForObject("select count(*) from collector.project_contacts where workspace_id=? and email_normalized=? and state='ACTIVE' and revoked_at is null and access_expires_at>?",Long.class,workspace,normalizedEmail,Timestamp.from(clock.instant()));
        if (exists == 0 && contacts(workspace) >= max) throw limit("CLIENT_CONTACT_LIMIT",max);
    }
    public long contacts(UUID workspace) {
        return jdbc.queryForObject("select count(distinct email_normalized) from collector.project_contacts where workspace_id=? and state='ACTIVE' and revoked_at is null and access_expires_at>?",Long.class,workspace,Timestamp.from(clock.instant()));
    }
    public void require(boolean allowed, String feature) {
        if (!allowed) throw new ApiException(HttpStatus.FORBIDDEN,"PLAN_FEATURE_UNAVAILABLE","Your plan does not include " + feature + ".");
    }
    /** A pending downgrade reserves its lower limits; existing paid capabilities stay intact. */
    public PlanKey admissionPlan(UUID workspace) {
        var current=current(workspace);
        var pending=jdbc.queryForList("select target_plan from collector.billing_plan_changes where workspace_id=? and state in ('REQUESTED','SCHEDULED')",String.class,workspace);
        if(!pending.isEmpty()) {
            var target=PlanKey.valueOf(pending.getFirst());
            if(target.storageBytes()<current.storageBytes())return target;
        }
        return current;
    }
    public void validateTarget(UUID workspace, PlanKey target) {
        if (!target.teamAssignments() && jdbc.queryForObject("select count(*) from collector.project_members where workspace_id=?",Long.class,workspace)>0)
            throw new ApiException(HttpStatus.CONFLICT,"PLAN_ASSIGNMENT_CONFLICT","Remove project assignments before changing to this plan.");
        if (target.reminders()==PlanKey.ReminderTier.BASIC && jdbc.queryForObject("""
            select count(*) from collector.reminder_policies r join collector.projects p on p.workspace_id=r.workspace_id and p.id=r.project_id
            where r.workspace_id=? and r.enabled and not r.paused and
            (r.timezone<>p.timezone or jsonb_array_length(r.rules_json)<>3 or
             (select count(distinct x->>'daysRelativeToDueDate') from jsonb_array_elements(r.rules_json) x where x->>'daysRelativeToDueDate' in ('-3','0','3'))<>3 or
             exists(select 1 from jsonb_array_elements(r.rules_json) x where x->>'channel'<>'EMAIL' or x->>'localTime'<>'10:00' or x->>'weekdaysOnly'<>'true'))
            """,Long.class,workspace)>0)
            throw new ApiException(HttpStatus.CONFLICT,"PLAN_REMINDER_CONFLICT","Pause advanced reminder schedules or use the basic cadence before changing to this plan.");
        if (target.activeProjects()!=null && projects(workspace)>target.activeProjects())
            throw limit("PLAN_PROJECT_CONFLICT",target.activeProjects());
        if (target.contacts()!=null && contacts(workspace)>target.contacts())
            throw limit("PLAN_CONTACT_CONFLICT",target.contacts());
        Long bytes=jdbc.queryForObject("select storage_used_bytes+storage_reserved_bytes from collector.workspaces where id=?",Long.class,workspace);
        if(bytes!=null && bytes>target.storageBytes())
            throw new ApiException(HttpStatus.CONFLICT,"PLAN_STORAGE_CONFLICT","Reduce stored and reserved files before changing to this plan.");
    }
    private ApiException limit(String code, int max) {
        return new ApiException(HttpStatus.CONFLICT,code,"Your plan limit of " + max + " has been reached. Reduce usage or upgrade your plan.");
    }
}

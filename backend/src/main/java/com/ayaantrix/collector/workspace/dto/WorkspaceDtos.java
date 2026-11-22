package com.ayaantrix.collector.workspace.dto;
import com.ayaantrix.collector.workspace.entity.PlanKey;
import com.ayaantrix.collector.workspace.entity.Workspace;
import com.ayaantrix.collector.workspace.entity.WorkspaceRole;

import jakarta.validation.constraints.*;
import java.util.UUID;

public final class WorkspaceDtos {
    private WorkspaceDtos(){}
    public record Create(@NotBlank @Size(max=150) String name,@Size(max=80) String timezone,PlanKey planKey){}
    public record Update(@Size(max=150) String name,@Size(max=80) String timezone,@NotNull @PositiveOrZero Long expectedVersion){}
    public record View(UUID id,String name,String timezone,Workspace.State state,long version){
        public static View from(Workspace w){return new View(w.id(),w.name(),w.timezone(),w.state(),w.version());}
    }
    public record Membership(UUID memberId,UUID workspaceId,String workspaceName,WorkspaceRole role){}
    public record Entitlements(PlanKey planKey,int seats,long storageLimitBytes,boolean unlimitedActiveProjects,
            int aiDraftAllowance,int smsSegmentAllowance,boolean canWrite,boolean aiEnabled,boolean smsEnabled){
        @com.fasterxml.jackson.annotation.JsonProperty public Integer activeProjectLimit(){return planKey.activeProjects();}
        @com.fasterxml.jackson.annotation.JsonProperty public Integer clientContactLimit(){return planKey.contacts();}
        @com.fasterxml.jackson.annotation.JsonProperty public PlanKey.ReminderTier reminderTier(){return planKey.reminders();}
        @com.fasterxml.jackson.annotation.JsonProperty public PlanKey.AnalyticsTier analyticsTier(){return planKey.analytics();}
        @com.fasterxml.jackson.annotation.JsonProperty public boolean customTemplates(){return planKey.customTemplates();}
        @com.fasterxml.jackson.annotation.JsonProperty public boolean sharedTemplates(){return planKey.sharedTemplates();}
        @com.fasterxml.jackson.annotation.JsonProperty public boolean teamAssignments(){return planKey.teamAssignments();}
        @com.fasterxml.jackson.annotation.JsonProperty public boolean delegatedReview(){return planKey.delegatedReview();}
        @com.fasterxml.jackson.annotation.JsonProperty public boolean zipExport(){return planKey.zipExport();}
        @com.fasterxml.jackson.annotation.JsonProperty public boolean branding(){return planKey.branding();}
    }
    public record Details(View workspace,Entitlements entitlements){}
}

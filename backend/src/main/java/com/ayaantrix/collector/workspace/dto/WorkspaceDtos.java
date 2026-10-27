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
            int aiDraftAllowance,int smsSegmentAllowance,boolean canWrite,boolean aiEnabled,boolean smsEnabled){}
    public record Details(View workspace,Entitlements entitlements){}
}

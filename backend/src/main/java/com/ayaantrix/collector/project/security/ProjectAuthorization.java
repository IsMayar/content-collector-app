package com.ayaantrix.collector.project.security;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.workspace.security.WorkspaceAuthorization;
import com.ayaantrix.collector.workspace.repository.WorkspaceSubscriptionRepository;
import com.ayaantrix.collector.workspace.entity.*;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.*;
import java.time.Clock;
import java.util.UUID;
@Component @Transactional(propagation=Propagation.MANDATORY)
public class ProjectAuthorization {
    private final WorkspaceAuthorization workspaces;private final WorkspaceSubscriptionRepository plans;private final Clock clock;
    ProjectAuthorization(WorkspaceAuthorization workspaces,WorkspaceSubscriptionRepository plans,Clock clock){this.workspaces=workspaces;this.plans=plans;this.clock=clock;}
    public WorkspaceAuthorization.Access access(UUID workspace,boolean owner){return workspaces.require(workspace,workspaces.actor(),owner);}
    public boolean owner(WorkspaceAuthorization.Access access){return access.member().role()==WorkspaceRole.OWNER;}
    public void writable(WorkspaceAuthorization.Access access){
        if(!canWrite(access))
            throw new ApiException(HttpStatus.FORBIDDEN,"WORKSPACE_READ_ONLY","Workspace changes are unavailable.");
    }
    public boolean canWrite(WorkspaceAuthorization.Access access){
        return access.workspace().state()==Workspace.State.ACTIVE && plans.lockedForWorkspace(access.workspace().id()).filter(s->s.writable(clock.instant())).isPresent();
    }
    public void readableProject(WorkspaceAuthorization.Access access){
        // No T13 assignment records or endpoints yet: membership alone never grants project access.
        if(!owner(access))throw missing();
    }
    public static ApiException missing(){return new ApiException(HttpStatus.NOT_FOUND,"NOT_FOUND","The requested resource is unavailable.");}
}

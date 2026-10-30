package com.ayaantrix.collector.workspace.security;
import com.ayaantrix.collector.workspace.entity.Workspace;
import com.ayaantrix.collector.workspace.entity.WorkspaceMember;
import com.ayaantrix.collector.workspace.entity.WorkspaceRole;
import com.ayaantrix.collector.workspace.repository.WorkspaceMemberRepository;
import com.ayaantrix.collector.workspace.repository.WorkspaceRepository;

import com.ayaantrix.collector.auth.repository.UserAccountRepository;
import com.ayaantrix.collector.auth.service.AgencySessions;
import com.ayaantrix.collector.common.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
import java.util.UUID;

/** Call within the command transaction; identity never comes from a request body or tenant header. */
@Component
@Transactional(propagation=Propagation.MANDATORY)
public class WorkspaceAuthorization {
    private final AgencySessions sessions;private final UserAccountRepository users;
    private final WorkspaceRepository workspaces;private final WorkspaceMemberRepository members;
    WorkspaceAuthorization(AgencySessions sessions,UserAccountRepository users,WorkspaceRepository workspaces,WorkspaceMemberRepository members){
        this.sessions=sessions;this.users=users;this.workspaces=workspaces;this.members=members;
    }
    public UUID identity(){
        var authentication=SecurityContextHolder.getContext().getAuthentication();
        if(!(authentication instanceof JwtAuthenticationToken token) || !token.isAuthenticated())throw unauthenticated();
        final UUID user;try{user=UUID.fromString(token.getToken().getSubject());}catch(RuntimeException invalid){throw unauthenticated();}
        sessions.validateAccess(token.getToken());return user;
    }
    public UUID actor(){UUID user=identity();users.findLockedById(user).orElseThrow(WorkspaceAuthorization::unauthenticated);identity();return user;}
    public record Access(Workspace workspace,WorkspaceMember member){}
    public Access require(UUID workspace,UUID user,boolean owner){
        var w=workspaces.lockAccessible(workspace,user).orElseThrow(WorkspaceAuthorization::notFound);
        var m=members.lockMembership(workspace,user).filter(member->member.state()==WorkspaceMember.State.ACTIVE).orElseThrow(WorkspaceAuthorization::notFound);
        if(owner && m.role()!=WorkspaceRole.OWNER)throw new ApiException(HttpStatus.FORBIDDEN,"ACCESS_DENIED","This action is not permitted.");
        return new Access(w,m);
    }
    static ApiException unauthenticated(){return new ApiException(HttpStatus.UNAUTHORIZED,"INVALID_CREDENTIALS","Sign in to continue.");}
    static ApiException notFound(){return new ApiException(HttpStatus.NOT_FOUND,"NOT_FOUND","The requested resource is unavailable.");}
}

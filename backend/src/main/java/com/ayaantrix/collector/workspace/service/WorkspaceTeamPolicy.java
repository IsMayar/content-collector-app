package com.ayaantrix.collector.workspace.service;
import com.ayaantrix.collector.auth.entity.*;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.workspace.entity.*;
import com.ayaantrix.collector.workspace.repository.*;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import java.time.Clock;
@Component
public class WorkspaceTeamPolicy {
 private final WorkspaceSubscriptionRepository plans;private final WorkspaceMemberRepository members;private final WorkspaceInvitationRepository invitations;private final Clock clock;
 WorkspaceTeamPolicy(WorkspaceSubscriptionRepository plans,WorkspaceMemberRepository members,WorkspaceInvitationRepository invitations,Clock clock){this.plans=plans;this.members=members;this.invitations=invitations;this.clock=clock;}
 public WorkspaceSubscription writable(Workspace workspace){return plans.lockedForWorkspace(workspace.id()).filter(s->workspace.state()==Workspace.State.ACTIVE && s.writable(clock.instant())).orElseThrow(()->new ApiException(HttpStatus.FORBIDDEN,"WORKSPACE_READ_ONLY","Workspace changes are unavailable."));}
 public void capacity(Workspace workspace,int additional){var plan=writable(workspace);long seats=members.countByWorkspaceIdAndState(workspace.id(),WorkspaceMember.State.ACTIVE)+invitations.reserved(workspace.id(),clock.instant())+additional;if(seats>plan.plan().seats())throw new ApiException(HttpStatus.CONFLICT,"SEAT_LIMIT","No team seat is available. Revoke an invitation or update your plan.");}
 public boolean canDeliver(AccountToken token){return token.getPurpose()==TokenPurpose.TEAM_INVITE && token.isUsableFor(TokenPurpose.TEAM_INVITE,clock.instant()) && invitations.deliveryAuthorized(token.getWorkspaceId(),token.getId()) && plans.findByWorkspaceId(token.getWorkspaceId()).filter(s->s.writable(clock.instant())).isPresent();}
}

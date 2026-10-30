package com.ayaantrix.collector.workspace.service;
import com.ayaantrix.collector.auth.entity.*;
import com.ayaantrix.collector.auth.repository.*;
import com.ayaantrix.collector.auth.security.*;
import com.ayaantrix.collector.auth.delivery.VerificationOutbox;
import com.ayaantrix.collector.auth.dto.SessionResponses;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.repository.*;
import com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.*;
import com.ayaantrix.collector.workspace.entity.*;
import com.ayaantrix.collector.workspace.repository.*;
import com.ayaantrix.collector.workspace.security.WorkspaceAuthorization;
import com.ayaantrix.collector.project.repository.ProjectAssignmentRepository;
import jakarta.validation.Validator;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
@Service @Transactional
public class WorkspaceInvitationService {
 private final WorkspaceAuthorization auth;private final WorkspaceRepository workspaces;private final WorkspaceMemberRepository members;
 private final WorkspaceInvitationRepository invitations;private final AccountTokenRepository tokens;private final UserAccountRepository users;
 private final SecureAccountTokens secrets;private final VerificationOutbox outbox;private final WorkspaceTeamPolicy policy;
 private final IdempotencyRepository requests;private final AuditRepository audit;private final ProjectAssignmentRepository assignments;
 private final Clock clock;private final Validator validator;private final JsonMapper json;
 WorkspaceInvitationService(WorkspaceAuthorization auth,WorkspaceRepository workspaces,WorkspaceMemberRepository members,WorkspaceInvitationRepository invitations,
 AccountTokenRepository tokens,UserAccountRepository users,SecureAccountTokens secrets,VerificationOutbox outbox,WorkspaceTeamPolicy policy,IdempotencyRepository requests,
 AuditRepository audit,ProjectAssignmentRepository assignments,Clock clock,Validator validator,JsonMapper json){this.auth=auth;this.workspaces=workspaces;this.members=members;this.invitations=invitations;this.tokens=tokens;this.users=users;this.secrets=secrets;this.outbox=outbox;this.policy=policy;this.requests=requests;this.audit=audit;this.assignments=assignments;this.clock=clock;this.validator=validator;this.json=json;}
 public Invitation invite(UUID workspace,Invite input,String key,String trace){
  var access=auth.require(workspace,auth.actor(),true);valid(input);policy.writable(access.workspace());String email=EmailAddresses.normalize(input.email());
  var now=clock.instant();String route="/api/v1/workspaces/"+workspace+"/members",hash=IdempotencyRepository.hash(email);
  var replay=requests.replay(workspace,access.member().userId(),route,key,hash,now);if(replay.isPresent())return json.readValue(replay.get(),Invitation.class);
  invitations.expire(workspace,now);
  if(users.findByEmailNormalized(email).flatMap(u->members.findByWorkspaceIdAndUserId(workspace,u.getId())).filter(m->m.state()==WorkspaceMember.State.ACTIVE).isPresent())throw conflict("MEMBER_EXISTS","This workspace already has that member.");
  if(invitations.existsByWorkspaceIdAndEmailAndState(workspace,email,"PENDING"))throw conflict("INVITATION_PENDING","A pending invitation already reserves this seat. Revoke it before issuing a replacement.");
  policy.capacity(access.workspace(),1);String raw=secrets.generate();var token=tokens.saveAndFlush(new AccountToken(workspace,email,secrets.digest(raw),now));
  var invitation=invitations.saveAndFlush(new WorkspaceInvitation(token.getId(),workspace,email,access.member().userId(),now));
  outbox.enqueue(token,raw,trace);audit.write(workspace,null,access.member().userId(),"TEAM_INVITATION_CREATED","INVITATION",invitation.id(),Map.of(),now);
  var result=summary(invitation,token,now);requests.remember(workspace,access.member().userId(),route,key,hash,json.writeValueAsString(result),202,now);return result;
 }
 public SessionResponses.Membership accept(Accept input,String key){
  UUID actor=auth.actor();valid(input);String digest;try{digest=secrets.digest(input.token());}catch(IllegalArgumentException e){throw invalidToken();}
  var candidate=tokens.findByTokenHashAndPurpose(digest,TokenPurpose.TEAM_INVITE).orElseThrow(WorkspaceInvitationService::invalidToken);
  var workspace=workspaces.lockInvitationWorkspace(candidate.getWorkspaceId()).orElseThrow(WorkspaceInvitationService::invalidToken);
  var invitation=invitations.findByWorkspaceIdAndId(workspace.id(),candidate.getId()).orElseThrow(WorkspaceInvitationService::invalidToken);
  var user=users.findById(actor).orElseThrow(WorkspaceInvitationService::invalidToken);
  if(!candidate.getEmailNormalized().equals(user.getEmailNormalized()))throw new ApiException(HttpStatus.FORBIDDEN,"INVITATION_EMAIL_MISMATCH","Sign in with the verified account invited to this workspace.");
  var now=clock.instant();String route="/api/v1/workspaces/"+workspace.id()+"/team-invitations/accept",hash=IdempotencyRepository.hash(digest);
  var replay=requests.replay(workspace.id(),actor,route,key,hash,now);
  if(replay.isPresent()){
   var current=members.findByWorkspaceIdAndUserId(workspace.id(),actor).filter(m->m.state()==WorkspaceMember.State.ACTIVE).orElseThrow(WorkspaceInvitationService::invalidToken);
   if(!actor.equals(invitation.acceptedBy()))throw invalidToken();return membership(workspace,current);
  }
  if(candidate.getRevokedAt()!=null || invitation.state().equals("REVOKED"))throw new ApiException(HttpStatus.GONE,"TOKEN_REVOKED","This team invitation was revoked.");
  if(candidate.getConsumedAt()!=null)throw new ApiException(HttpStatus.GONE,"TOKEN_CONSUMED","This team invitation was already accepted.");
  if(!candidate.isUsableFor(TokenPurpose.TEAM_INVITE,now))throw new ApiException(HttpStatus.GONE,"TOKEN_EXPIRED","This team invitation has expired.");
  if(!policy.canDeliver(candidate))throw invalidToken();policy.capacity(workspace,0);
  var existing=members.findByWorkspaceIdAndUserId(workspace.id(),actor);
  if(existing.filter(m->m.state()==WorkspaceMember.State.ACTIVE).isPresent())throw conflict("MEMBER_EXISTS","This workspace already has that member.");
  if(tokens.consume(candidate.getId(),TokenPurpose.TEAM_INVITE,now)!=1)throw invalidToken();
  var member=members.findByWorkspaceIdAndUserId(workspace.id(),actor).orElseGet(()->new WorkspaceMember(workspace.id(),actor,WorkspaceRole.MEMBER,now));
  assignments.revokeMembership(workspace.id(),member.id());member.state(WorkspaceMember.State.ACTIVE,now);member=members.saveAndFlush(member);
  invitation=invitations.findByWorkspaceIdAndId(workspace.id(),candidate.getId()).orElseThrow(WorkspaceInvitationService::invalidToken);invitation.consume(actor,now);invitations.saveAndFlush(invitation);
  outbox.discardTeamInvitationJob(candidate.getId(),now);audit.write(workspace.id(),null,actor,"TEAM_INVITATION_ACCEPTED","MEMBER",member.id(),Map.of(),now);
  var result=membership(workspace,member);requests.remember(workspace.id(),actor,route,key,hash,json.writeValueAsString(result),200,now);return result;
 }
 public void revoke(UUID workspace,UUID id){var access=auth.require(workspace,auth.actor(),true);revoke(workspace,id,access.member().userId());}
 void revoke(UUID workspace,UUID id,UUID actor){var invite=invitations.findByWorkspaceIdAndId(workspace,id).orElseThrow(WorkspaceInvitationService::missing);
  if(invite.state().equals("CONSUMED"))throw conflict("INVITATION_CONSUMED","The invitation has already been accepted. Manage the member instead.");
  if(invite.state().equals("REVOKED"))return;var now=clock.instant();tokens.revoke(invite.id(),TokenPurpose.TEAM_INVITE,now);
  invite=invitations.findByWorkspaceIdAndId(workspace,id).orElseThrow(WorkspaceInvitationService::missing);invite.revoke(now);invitations.saveAndFlush(invite);outbox.discardTeamInvitationJob(id,now);audit.write(workspace,null,actor,"TEAM_INVITATION_REVOKED","INVITATION",id,Map.of(),now);
 }
 void cancelForEmail(UUID workspace,String email,UUID actor){for(var invite:invitations.findByWorkspaceIdOrderByCreatedAtDescIdDesc(workspace))if(invite.state().equals("PENDING")&&invite.email().equals(email))revoke(workspace,invite.id(),actor);}
 void cancelPending(UUID workspace,UUID actor){for(var invite:invitations.findByWorkspaceIdOrderByCreatedAtDescIdDesc(workspace))if(invite.state().equals("PENDING"))revoke(workspace,invite.id(),actor);}
 List<Invitation> summaries(UUID workspace){return invitations.findByWorkspaceIdOrderByCreatedAtDescIdDesc(workspace).stream().limit(100).map(i->summary(i,tokens.findById(i.id()).orElseThrow(WorkspaceInvitationService::invalidToken),clock.instant())).toList();}
 private static Invitation summary(WorkspaceInvitation i,AccountToken t,Instant now){String state=i.state();if(state.equals("PENDING") && !now.isBefore(t.getExpiresAt()))state="EXPIRED";return new Invitation(i.id(),i.email(),t.getExpiresAt(),state);}
 private static SessionResponses.Membership membership(Workspace w,WorkspaceMember m){return new SessionResponses.Membership(m.id(),w.id(),w.name(),m.role().name());}
 private void valid(Object input){if(input==null || !validator.validate(input).isEmpty())throw new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_FAILED","Team request fields are invalid.");}
 static ApiException missing(){return new ApiException(HttpStatus.NOT_FOUND,"NOT_FOUND","The requested resource is unavailable.");}
 static ApiException invalidToken(){return new ApiException(HttpStatus.BAD_REQUEST,"TOKEN_INVALID","This team invitation is unavailable.");}
 static ApiException conflict(String code,String detail){return new ApiException(HttpStatus.CONFLICT,code,detail);}
}

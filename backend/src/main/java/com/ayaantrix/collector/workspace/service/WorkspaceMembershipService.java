package com.ayaantrix.collector.workspace.service;
import com.ayaantrix.collector.auth.repository.UserAccountRepository;
import com.ayaantrix.collector.auth.dto.SessionResponses;
import com.ayaantrix.collector.auth.entity.AccountState;
import com.ayaantrix.collector.common.repository.*;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.*;
import com.ayaantrix.collector.workspace.dto.WorkspaceDtos;
import com.ayaantrix.collector.workspace.entity.*;
import com.ayaantrix.collector.workspace.repository.*;
import com.ayaantrix.collector.workspace.security.WorkspaceAuthorization;
import com.ayaantrix.collector.project.repository.ProjectAssignmentRepository;
import jakarta.validation.Validator;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.json.JsonMapper;
import java.time.Clock;
import java.util.*;
@Service @Transactional
public class WorkspaceMembershipService {
 private final WorkspaceAuthorization auth;private final WorkspaceMemberRepository members;private final UserAccountRepository users;
 private final WorkspaceTeamPolicy policy;private final WorkspaceInvitationService invitations;private final ProjectAssignmentRepository assignments;
 private final AuditRepository audit;private final IdempotencyRepository requests;private final PasswordEncoder passwords;private final Clock clock;private final Validator validator;private final JsonMapper json;
 WorkspaceMembershipService(WorkspaceAuthorization auth,WorkspaceMemberRepository members,UserAccountRepository users,WorkspaceTeamPolicy policy,WorkspaceInvitationService invitations,
 ProjectAssignmentRepository assignments,AuditRepository audit,IdempotencyRepository requests,PasswordEncoder passwords,Clock clock,Validator validator,JsonMapper json){this.auth=auth;this.members=members;this.users=users;this.policy=policy;this.invitations=invitations;this.assignments=assignments;this.audit=audit;this.requests=requests;this.passwords=passwords;this.clock=clock;this.validator=validator;this.json=json;}
 public Team list(UUID workspace){auth.require(workspace,auth.actor(),true);return new Team(members.findByWorkspaceIdOrderByCreatedAtAscIdAsc(workspace).stream().map(this::view).toList(),invitations.summaries(workspace));}
 public Member state(UUID workspace,UUID id,StateChange input){
  valid(input);var access=auth.require(workspace,auth.actor(),true);var member=members.findByWorkspaceIdAndId(workspace,id).orElseThrow(WorkspaceInvitationService::missing);
  if(input.role()!=null)throw new ApiException(HttpStatus.BAD_REQUEST,"ROLE_CHANGE_REQUIRES_TRANSFER","Use reauthenticated ownership transfer to change ownership.");
  if(member.role()==WorkspaceRole.OWNER)throw WorkspaceInvitationService.conflict("OWNER_REQUIRED","The owner cannot be removed or disabled. Transfer ownership first.");
  if(member.state()==input.state())return view(member);
  if(input.state()==WorkspaceMember.State.ACTIVE){policy.writable(access.workspace());var recipient=users.findById(member.userId()).orElseThrow(WorkspaceInvitationService::missing);if(recipient.getState()!=AccountState.ACTIVE||recipient.getVerifiedAt()==null)throw WorkspaceInvitationService.missing();invitations.cancelForEmail(workspace,recipient.getEmailNormalized(),access.member().userId());policy.capacity(access.workspace(),1);}
  assignments.revokeMembership(workspace,id);member=members.findByWorkspaceIdAndId(workspace,id).orElseThrow(WorkspaceInvitationService::missing);member.state(input.state(),clock.instant());members.saveAndFlush(member);
  audit.write(workspace,null,access.member().userId(),"WORKSPACE_MEMBER_STATE_CHANGED","MEMBER",id,Map.of("state",input.state().name()),clock.instant());return view(member);
 }
 public WorkspaceDtos.View transfer(UUID workspace,Transfer input,String key){
  valid(input);UUID actor=auth.identity();var target=members.ownershipTarget(workspace,input.targetMemberId(),actor).orElseThrow(WorkspaceInvitationService::missing);
  var ids=new ArrayList<>(List.of(actor,target.userId()));ids.sort(Comparator.naturalOrder());for(UUID id:ids)users.findLockedById(id).orElseThrow(WorkspaceInvitationService::missing);
  var access=auth.require(workspace,auth.identity(),false);var user=users.findById(actor).orElseThrow(WorkspaceInvitationService::missing);
  if(!passwords.matches(input.currentPassword(),user.getPasswordHash()))throw new ApiException(HttpStatus.FORBIDDEN,"REAUTHENTICATION_FAILED","The current password is incorrect.");
  String route="/api/v1/workspaces/"+workspace+"/ownership-transfer",hash=IdempotencyRepository.hash(input.targetMemberId().toString());var now=clock.instant();
  var replay=requests.replay(workspace,actor,route,key,hash,now);target=members.findByWorkspaceIdAndId(workspace,input.targetMemberId()).orElseThrow(WorkspaceInvitationService::missing);
  if(replay.isPresent()){if(target.role()!=WorkspaceRole.OWNER || target.state()!=WorkspaceMember.State.ACTIVE)throw WorkspaceInvitationService.conflict("OWNERSHIP_CHANGED","Workspace ownership changed again.");return WorkspaceDtos.View.from(access.workspace());}
  if(access.member().role()!=WorkspaceRole.OWNER)throw new ApiException(HttpStatus.FORBIDDEN,"ACCESS_DENIED","Only the current owner can transfer ownership.");
  policy.writable(access.workspace());var recipient=users.findById(target.userId()).orElseThrow(WorkspaceInvitationService::missing);
  if(target.userId().equals(actor)||target.state()!=WorkspaceMember.State.ACTIVE||recipient.getState()!=AccountState.ACTIVE||recipient.getVerifiedAt()==null)throw WorkspaceInvitationService.missing();
  if(members.existsByUserIdAndRoleAndState(target.userId(),WorkspaceRole.OWNER,WorkspaceMember.State.ACTIVE))throw WorkspaceInvitationService.conflict("WORKSPACE_ALREADY_OWNED","The target already owns a workspace.");
  invitations.cancelPending(workspace,actor);var previous=members.findByWorkspaceIdAndUserId(workspace,actor).orElseThrow(WorkspaceInvitationService::missing);
  previous.role(WorkspaceRole.MEMBER,now);members.saveAndFlush(previous);target=members.findByWorkspaceIdAndId(workspace,input.targetMemberId()).orElseThrow(WorkspaceInvitationService::missing);target.role(WorkspaceRole.OWNER,now);members.saveAndFlush(target);
  assignments.revokeMembership(workspace,target.id());audit.write(workspace,null,actor,"WORKSPACE_OWNERSHIP_TRANSFERRED","MEMBER",target.id(),Map.of(),now);
  var result=WorkspaceDtos.View.from(access.workspace());requests.remember(workspace,actor,route,key,hash,json.writeValueAsString(result),200,now);return result;
 }
 private Member view(WorkspaceMember m){return new Member(m.id(),SessionResponses.User.from(users.findById(m.userId()).orElseThrow(WorkspaceInvitationService::missing)),m.role(),m.state());}
 private void valid(Object input){if(input==null||!validator.validate(input).isEmpty())throw new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_FAILED","Team request fields are invalid.");}
}

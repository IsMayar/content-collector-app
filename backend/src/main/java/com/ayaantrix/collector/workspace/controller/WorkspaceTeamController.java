package com.ayaantrix.collector.workspace.controller;
import com.ayaantrix.collector.workspace.service.*;
import com.ayaantrix.collector.workspace.dto.WorkspaceTeamDtos.*;
import com.ayaantrix.collector.workspace.dto.WorkspaceDtos;
import com.ayaantrix.collector.auth.dto.SessionResponses;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import java.util.*;
@RestController @RequestMapping(value="/api/v1",produces=MediaType.APPLICATION_JSON_VALUE)
public class WorkspaceTeamController {
 private final WorkspaceInvitationService invitations;private final WorkspaceMembershipService members;private final com.ayaantrix.collector.common.web.RequestTrace trace;
 WorkspaceTeamController(WorkspaceInvitationService invitations,WorkspaceMembershipService members,com.ayaantrix.collector.common.web.RequestTrace trace){this.invitations=invitations;this.members=members;this.trace=trace;}
 @GetMapping("/workspaces/{workspaceId}/members") ResponseEntity<Team> list(@PathVariable UUID workspaceId){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(members.list(workspaceId));}
 @PostMapping(value="/workspaces/{workspaceId}/members",consumes=MediaType.APPLICATION_JSON_VALUE)
 ResponseEntity<Map<String,Invitation>> invite(@PathVariable UUID workspaceId,@Valid @RequestBody Invite body,@RequestHeader("Idempotency-Key") String key,jakarta.servlet.http.HttpServletRequest request){return ResponseEntity.status(202).cacheControl(CacheControl.noStore()).body(Map.of("invitation",invitations.invite(workspaceId,body,key,trace.getTraceId(request))));}
 @PostMapping(value="/team-invitations/accept",consumes=MediaType.APPLICATION_JSON_VALUE)
 ResponseEntity<Map<String,SessionResponses.Membership>> accept(@Valid @RequestBody Accept body,@RequestHeader("Idempotency-Key") String key){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("membership",invitations.accept(body,key)));}
 @PatchMapping(value="/workspaces/{workspaceId}/members/{memberId}",consumes=MediaType.APPLICATION_JSON_VALUE)
 ResponseEntity<Map<String,Member>> state(@PathVariable UUID workspaceId,@PathVariable UUID memberId,@Valid @RequestBody StateChange body){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("member",members.state(workspaceId,memberId,body)));}
 @DeleteMapping("/workspaces/{workspaceId}/members/{memberId}") ResponseEntity<Void> remove(@PathVariable UUID workspaceId,@PathVariable UUID memberId){members.state(workspaceId,memberId,new StateChange(com.ayaantrix.collector.workspace.entity.WorkspaceMember.State.DISABLED,null));return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();}
 @DeleteMapping("/workspaces/{workspaceId}/member-invitations/{invitationId}") ResponseEntity<Void> revoke(@PathVariable UUID workspaceId,@PathVariable UUID invitationId){invitations.revoke(workspaceId,invitationId);return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();}
 @PostMapping(value="/workspaces/{workspaceId}/ownership-transfer",consumes=MediaType.APPLICATION_JSON_VALUE)
 ResponseEntity<Map<String,WorkspaceDtos.View>> transfer(@PathVariable UUID workspaceId,@Valid @RequestBody Transfer body,@RequestHeader("Idempotency-Key") String key){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("workspace",members.transfer(workspaceId,body,key)));}
}

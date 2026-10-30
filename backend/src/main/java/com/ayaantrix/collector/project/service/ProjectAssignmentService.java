package com.ayaantrix.collector.project.service;
import com.ayaantrix.collector.project.dto.ProjectAssignmentDtos.*;
import com.ayaantrix.collector.project.entity.ProjectAssignment;
import com.ayaantrix.collector.project.repository.*;
import com.ayaantrix.collector.project.security.ProjectAuthorization;
import com.ayaantrix.collector.workspace.repository.WorkspaceMemberRepository;
import com.ayaantrix.collector.workspace.entity.*;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.repository.AuditRepository;
import jakarta.validation.Validator;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.util.*;
@Service @Transactional
public class ProjectAssignmentService {
 private final ProjectAuthorization auth;private final ProjectRepository projects;private final ProjectAssignmentRepository assignments;
 private final WorkspaceMemberRepository members;private final AuditRepository audit;private final Clock clock;private final Validator validator;
 ProjectAssignmentService(ProjectAuthorization auth,ProjectRepository projects,ProjectAssignmentRepository assignments,WorkspaceMemberRepository members,AuditRepository audit,Clock clock,Validator validator){this.auth=auth;this.projects=projects;this.assignments=assignments;this.members=members;this.audit=audit;this.clock=clock;this.validator=validator;}
 public List<Assignment> list(UUID workspace,UUID project){auth.access(workspace,true);projects.findByWorkspaceIdAndId(workspace,project).orElseThrow(ProjectAuthorization::missing);return assignments.findByWorkspaceIdAndProjectId(workspace,project).stream().map(ProjectAssignmentService::view).toList();}
 public Assignment put(UUID workspace,UUID project,UUID member,Change input){
  var access=auth.access(workspace,true);auth.writable(access);if(input==null||!validator.validate(input).isEmpty())throw new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_FAILED","Assignment fields are invalid.");
  var p=projects.lockForStructure(workspace,project).orElseThrow(ProjectAuthorization::missing);if(!p.structureEditable())throw new ApiException(HttpStatus.CONFLICT,"READ_ONLY","This project cannot change assignments in its current state.");
  members.eligibleAssignee(workspace,member).orElseThrow(ProjectAuthorization::missing);
  var before=assignments.findByWorkspaceIdAndProjectIdAndWorkspaceMemberId(workspace,project,member);
  if(before.filter(a->a.canReview()==input.canReview()&&a.canExport()==input.canExport()).isPresent())return view(before.get());
  var a=before.orElseGet(()->new ProjectAssignment(workspace,project,member,input.canReview(),input.canExport(),clock.instant()));a.update(input.canReview(),input.canExport(),clock.instant());assignments.saveAndFlush(a);
  audit.write(workspace,project,access.member().userId(),"PROJECT_ASSIGNMENT_CHANGED","MEMBER",member,Map.of("canReview",input.canReview(),"canExport",input.canExport()),clock.instant());return view(a);
 }
 public void revoke(UUID workspace,UUID project,UUID member){var access=auth.access(workspace,true);projects.lockForStructure(workspace,project).orElseThrow(ProjectAuthorization::missing);members.findByWorkspaceIdAndId(workspace,member).orElseThrow(ProjectAuthorization::missing);if(assignments.revoke(workspace,project,member)>0)audit.write(workspace,project,access.member().userId(),"PROJECT_ASSIGNMENT_REVOKED","MEMBER",member,Map.of(),clock.instant());}
 private static Assignment view(ProjectAssignment a){return new Assignment(a.memberId(),a.canReview(),a.canExport());}
}

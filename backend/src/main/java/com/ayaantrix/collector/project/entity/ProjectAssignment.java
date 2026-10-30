package com.ayaantrix.collector.project.entity;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
@Entity @Table(name="project_members",schema="collector")
public class ProjectAssignment {
 @Id private UUID id;
 @Column(name="workspace_id",nullable=false,updatable=false) private UUID workspaceId;
 @Column(name="project_id",nullable=false,updatable=false) private UUID projectId;
 @Column(name="workspace_member_id",nullable=false,updatable=false) private UUID workspaceMemberId;
 @Column(name="can_review",nullable=false) private boolean canReview;
 @Column(name="can_export",nullable=false) private boolean canExport;
 @Column(name="created_at",nullable=false,updatable=false) private Instant createdAt;
 @Column(name="updated_at",nullable=false) private Instant updatedAt;
 protected ProjectAssignment(){}
 public ProjectAssignment(UUID workspace,UUID project,UUID member,boolean review,boolean export,Instant now){id=UUID.randomUUID();workspaceId=workspace;projectId=project;workspaceMemberId=member;createdAt=now;update(review,export,now);}
 public UUID memberId(){return workspaceMemberId;} public boolean canReview(){return canReview;} public boolean canExport(){return canExport;}
 public void update(boolean review,boolean export,Instant now){canReview=review;canExport=export;updatedAt=now;}
}

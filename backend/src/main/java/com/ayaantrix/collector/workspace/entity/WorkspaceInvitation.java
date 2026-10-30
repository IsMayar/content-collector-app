package com.ayaantrix.collector.workspace.entity;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
@Entity @Table(name="workspace_invitations",schema="collector")
public class WorkspaceInvitation {
 @Id private UUID id;
 @Column(name="workspace_id",nullable=false,updatable=false) private UUID workspaceId;
 @Column(name="email_normalized",nullable=false,updatable=false,columnDefinition="text") private String email;
 @Column(name="invited_by_user_id",nullable=false,updatable=false) private UUID invitedBy;
 @Column(nullable=false,columnDefinition="text") private String role;
 @Column(nullable=false,columnDefinition="text") private String state;
 @Column(name="accepted_by_user_id") private UUID acceptedBy;
 @Column(name="created_at",nullable=false,updatable=false) private Instant createdAt;
 @Column(name="updated_at",nullable=false) private Instant updatedAt;
 protected WorkspaceInvitation(){}
 public WorkspaceInvitation(UUID token,UUID workspace,String email,UUID inviter,Instant now){id=token;workspaceId=workspace;this.email=email;invitedBy=inviter;role="MEMBER";state="PENDING";createdAt=now;updatedAt=now;}
 public UUID id(){return id;} public UUID workspaceId(){return workspaceId;} public String email(){return email;} public String state(){return state;} public UUID acceptedBy(){return acceptedBy;}
 public void consume(UUID actor,Instant now){state="CONSUMED";acceptedBy=actor;updatedAt=now;}
 public void revoke(Instant now){state="REVOKED";updatedAt=now;}
}

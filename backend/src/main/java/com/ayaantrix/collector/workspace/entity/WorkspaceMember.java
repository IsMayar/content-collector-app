package com.ayaantrix.collector.workspace.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="workspace_members",schema="collector")
public class WorkspaceMember {
    public enum State { ACTIVE, DISABLED }
    @Id @Column(nullable=false,updatable=false) private UUID id;
    @Column(name="workspace_id",nullable=false,updatable=false) private UUID workspaceId;
    @Column(name="user_id",nullable=false,updatable=false) private UUID userId;
    @Enumerated(EnumType.STRING) @Column(nullable=false,columnDefinition="text") private WorkspaceRole role;
    @Enumerated(EnumType.STRING) @Column(nullable=false,columnDefinition="text") private State state;
    @Column(name="created_at",nullable=false,updatable=false) private Instant createdAt;
    @Column(name="updated_at",nullable=false) private Instant updatedAt;
    protected WorkspaceMember(){}
    public WorkspaceMember(UUID workspaceId,UUID userId,WorkspaceRole role,Instant now){
        id=UUID.randomUUID();this.workspaceId=workspaceId;this.userId=userId;this.role=role;state=State.ACTIVE;createdAt=now;updatedAt=now;
    }
    UUID id(){return id;} public WorkspaceRole role(){return role;} public State state(){return state;}
}

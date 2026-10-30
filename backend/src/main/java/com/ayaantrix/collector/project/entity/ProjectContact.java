package com.ayaantrix.collector.project.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/** Contact metadata is not an invitation, authenticated account or client session. */
@Entity @Table(name="project_contacts",schema="collector")
public class ProjectContact {
    @Id private UUID id;
    @Column(name="workspace_id",nullable=false,updatable=false) private UUID workspaceId;
    @Column(name="project_id",nullable=false,updatable=false) private UUID projectId;
    @Column(name="client_id",nullable=false,updatable=false) private UUID clientId;
    @Column(nullable=false,length=150) private String name;
    @Column(name="email_normalized",nullable=false,columnDefinition="text") private String email;
    @Column(nullable=false,columnDefinition="text") private String state;
    @Column(name="email_reminders_enabled",nullable=false) private boolean emailRemindersEnabled;
    @Column(length=80) private String timezone;
    @Column(name="access_expires_at",nullable=false) private Instant accessExpiresAt;
    @Column(name="revoked_at") private Instant revokedAt;
    @Column(name="created_at",nullable=false,updatable=false) private Instant createdAt;
    @Column(name="updated_at",nullable=false) private Instant updatedAt;
    @Column(name="access_initialized_at") private Instant accessInitializedAt;
    protected ProjectContact() {}
    public ProjectContact(UUID workspace,UUID project,UUID client,String name,String email,Instant expires,Instant now) {
        this.id=UUID.randomUUID();workspaceId=workspace;projectId=project;clientId=client;this.name=name;this.email=email;
        accessExpiresAt=expires;state="ACTIVE";emailRemindersEnabled=true;createdAt=now;updatedAt=now;
    }
    public Instant accessInitializedAt(){return accessInitializedAt;}
    public UUID id(){return id;} public String name(){return name;} public String email(){return email;}
    public String state(){return state;} public String timezone(){return timezone;}
    public Instant accessExpiresAt(){return accessExpiresAt;} public boolean emailRemindersEnabled(){return emailRemindersEnabled;}
}

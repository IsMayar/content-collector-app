package com.ayaantrix.collector.clientaccess.entity;
import jakarta.persistence.*;
import java.time.*;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
@Entity @Table(name="client_sessions",schema="collector")
public class ClientSession {
 @Id private UUID id;
 @Column(name="workspace_id",nullable=false,updatable=false) private UUID workspaceId;
 @Column(name="project_id",nullable=false,updatable=false) private UUID projectId;
 @Column(name="contact_id",nullable=false,updatable=false) private UUID contactId;
 @JdbcTypeCode(SqlTypes.CHAR) @Column(name="token_hash",nullable=false,length=64,columnDefinition="char(64)",updatable=false) private String tokenHash;
 @Column(name="created_at",nullable=false,updatable=false) private Instant createdAt;
 @Column(name="last_seen_at",nullable=false) private Instant lastSeenAt;
 @Column(name="expires_at",nullable=false,updatable=false) private Instant expiresAt;
 @Column(name="revoked_at") private Instant revokedAt;
 protected ClientSession(){}
 public ClientSession(UUID workspace,UUID project,UUID contact,String hash,Instant now,Instant expires){id=UUID.randomUUID();workspaceId=workspace;projectId=project;contactId=contact;tokenHash=hash;createdAt=now;lastSeenAt=now;expiresAt=expires;}
 public boolean usable(Instant now){return revokedAt==null&&!now.isBefore(createdAt)&&now.isBefore(expiresAt)&&now.isBefore(lastSeenAt.plus(Duration.ofHours(24)));}
 public void seen(Instant now){lastSeenAt=now;}
 public UUID id(){return id;}public UUID workspaceId(){return workspaceId;}public UUID projectId(){return projectId;}public UUID contactId(){return contactId;}public Instant expiresAt(){return expiresAt;}
}

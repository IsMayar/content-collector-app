package com.ayaantrix.collector.auth.entity;
import jakarta.persistence.*;
import java.time.*;
import java.util.UUID;
@Entity @Table(name="auth_sessions",schema="collector")
public class AuthSession {
    @Id private UUID id;
    @Column(name="principal_kind",nullable=false,columnDefinition="text") private String principalKind;
    @Column(name="user_id",nullable=false) private UUID userId;
    @Column(name="family_id",nullable=false) private UUID familyId;
    @Column(name="expires_at",nullable=false) private Instant expiresAt;
    @Column(name="idle_expires_at",nullable=false) private Instant idleExpiresAt;
    @Column(name="last_seen_at",nullable=false) private Instant lastSeenAt;
    @Column(name="revoked_at") private Instant revokedAt;
    @Column(name="created_at",nullable=false) private Instant createdAt;
    @Column(name="updated_at",nullable=false) private Instant updatedAt;
    protected AuthSession(){}
    public AuthSession(UUID userId,Instant now){
        id=UUID.randomUUID();familyId=UUID.randomUUID();principalKind="USER";this.userId=userId;
        expiresAt=now.plus(Duration.ofDays(14));createdAt=now;touch(now);
    }
    public void touch(Instant now){lastSeenAt=now;updatedAt=now;idleExpiresAt=now.plus(Duration.ofDays(7));if(idleExpiresAt.isAfter(expiresAt))idleExpiresAt=expiresAt;}
    public void revoke(Instant now){if(revokedAt==null)revokedAt=now;updatedAt=now;}
    public boolean usable(Instant now){return revokedAt==null && !now.isBefore(createdAt) && now.isBefore(expiresAt) && now.isBefore(idleExpiresAt);}
    public UUID getId(){return id;} public UUID getUserId(){return userId;} public UUID getFamilyId(){return familyId;}
    public Instant getExpiresAt(){return expiresAt;} public Instant getIdleExpiresAt(){return idleExpiresAt;}
    public Instant getCreatedAt(){return createdAt;} public Instant getLastSeenAt(){return lastSeenAt;} public Instant getRevokedAt(){return revokedAt;}
    @Override public String toString(){return "AuthSession[redacted]";}
}

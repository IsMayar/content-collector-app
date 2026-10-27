package com.ayaantrix.collector.auth.entity;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
@Entity @Table(name="session_tokens",schema="collector")
public class SessionToken {
    @Id private UUID id;
    @Column(name="session_id",nullable=false) private UUID sessionId;
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.CHAR)
    @Column(name="token_hash",nullable=false,length=64,columnDefinition="char(64)") private String tokenHash;
    @Column(name="expires_at",nullable=false) private Instant expiresAt;
    @Column(name="rotated_at") private Instant rotatedAt;
    @Column(name="replacement_id") private UUID replacementId;
    @Column(name="created_at",nullable=false) private Instant createdAt;
    @Column(name="updated_at",nullable=false) private Instant updatedAt;
    protected SessionToken(){}
    public SessionToken(AuthSession session,String digest,Instant now){id=UUID.randomUUID();sessionId=session.getId();tokenHash=digest;expiresAt=session.getExpiresAt();createdAt=now;updatedAt=now;}
    public void rotate(UUID replacement,Instant now){rotatedAt=now;replacementId=replacement;updatedAt=now;}
    public UUID getId(){return id;} public UUID getSessionId(){return sessionId;} public Instant getRotatedAt(){return rotatedAt;}
    public Instant getExpiresAt(){return expiresAt;} public UUID getReplacementId(){return replacementId;}
    @Override public String toString(){return "SessionToken[redacted]";}
}

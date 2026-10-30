package com.ayaantrix.collector.auth.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "access_tokens", schema = "collector",
        uniqueConstraints = @UniqueConstraint(name = "access_tokens_hash_key", columnNames = "token_hash"),
        indexes = @Index(name = "access_tokens_user_purpose_idx", columnList = "user_id,purpose"))
public class AccountToken {
    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;
    @Column(name = "user_id", updatable = false)
    private UUID userId;
    @Column(name="workspace_id",updatable=false) private UUID workspaceId;
    @Column(name = "email_normalized", nullable = false, updatable = false, columnDefinition = "text")
    private String emailNormalized;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false, columnDefinition = "text")
    private TokenPurpose purpose;
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "token_hash", nullable = false, updatable = false, length = 64, columnDefinition = "char(64)")
    private String tokenHash;
    @Column(name = "expires_at", nullable = false, updatable = false)
    private Instant expiresAt;
    @Column(name = "consumed_at", nullable = true)
    private Instant consumedAt;
    @Column(name = "revoked_at", nullable = true)
    private Instant revokedAt;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected AccountToken() {}

    public AccountToken(UserAccount user, String digest, TokenPurpose purpose, Instant now) {
        if (digest == null || !digest.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException("A SHA-256 token digest is required.");
        }
        this.id = UUID.randomUUID();
        this.userId = Objects.requireNonNull(user).getId();
        this.emailNormalized = user.getEmailNormalized();
        this.purpose = Objects.requireNonNull(purpose);
        this.tokenHash = digest;
        this.createdAt = Objects.requireNonNull(now);
        this.updatedAt = now;
        this.expiresAt = now.plus(purpose.lifetime());
    }

    public AccountToken(UUID workspace,String email,String digest,Instant now){
        if(digest==null || !digest.matches("[0-9a-f]{64}"))throw new IllegalArgumentException("A SHA-256 digest is required.");
        id=UUID.randomUUID();workspaceId=Objects.requireNonNull(workspace);emailNormalized=Objects.requireNonNull(email);tokenHash=digest;purpose=TokenPurpose.TEAM_INVITE;createdAt=now;updatedAt=now;expiresAt=now.plus(purpose.lifetime());
    }
    public UUID getWorkspaceId(){return workspaceId;}
    // Informational only: authoritative consumption must use the conditional repository update.
    public boolean isUsableFor(TokenPurpose expected, Instant now) {
        Objects.requireNonNull(now);
        return purpose == expected && !now.isBefore(createdAt) && now.isBefore(expiresAt)
                && consumedAt == null && revokedAt == null;
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getEmailNormalized() { return emailNormalized; }
    public TokenPurpose getPurpose() { return purpose; }
    public String getTokenHash() { return tokenHash; }
    public Instant getExpiresAt() { return expiresAt; }
    public Instant getConsumedAt() { return consumedAt; }
    public Instant getRevokedAt() { return revokedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}

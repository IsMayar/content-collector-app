package com.ayaantrix.collector.auth.entity;

import com.ayaantrix.collector.auth.security.EmailAddresses;
import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "users", schema = "collector",
        uniqueConstraints = @UniqueConstraint(name = "users_email_normalized_key", columnNames = "email_normalized"))
public class UserAccount {
    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;
    @NotBlank @Email @Size(max = 254)
    @Column(name = "email_normalized", nullable = false, columnDefinition = "text")
    private String emailNormalized;
    @NotBlank @Size(max = 150)
    @Column(name = "display_name", nullable = false, length = 150)
    private String displayName;
    @Column(name = "password_hash", nullable = false, columnDefinition = "text")
    private String passwordHash;
    @Column(name = "verified_at", nullable = true)
    private Instant verifiedAt;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "text")
    private AccountState state;
    @Version
    @Column(nullable = false)
    private Long version;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserAccount() {}

    public UserAccount(String email, String displayName, String passwordHash, Instant now) {
        this.id = UUID.randomUUID();
        this.emailNormalized = EmailAddresses.normalize(email);
        this.displayName = Objects.requireNonNull(displayName).strip();
        this.passwordHash = encodedHash(passwordHash);
        this.state = AccountState.UNVERIFIED;
        this.createdAt = Objects.requireNonNull(now);
        this.updatedAt = now;
    }

    public void markVerified(Instant now) {
        if (state == AccountState.DISABLED) throw new IllegalStateException("Account is disabled.");
        touch(now);
        if (verifiedAt == null) verifiedAt = now;
        state = AccountState.ACTIVE;
    }

    public void changePasswordHash(String passwordHash, Instant now) {
        String encoded = encodedHash(passwordHash);
        touch(now);
        this.passwordHash = encoded;
    }

    public void disable(Instant now) { touch(now); state = AccountState.DISABLED; }

    private void touch(Instant now) {
        if (Objects.requireNonNull(now).isBefore(updatedAt)) {
            throw new IllegalArgumentException("Account update time is invalid.");
        }
        updatedAt = now;
    }

    private static String encodedHash(String hash) {
        if (hash == null || !hash.startsWith("{argon2}$argon2id$")) {
            throw new IllegalArgumentException("An encoded Argon2id password is required.");
        }
        return hash;
    }

    public UUID getId() { return id; }
    public String getEmailNormalized() { return emailNormalized; }
    public String getDisplayName() { return displayName; }
    public String getPasswordHash() { return passwordHash; }
    public Instant getVerifiedAt() { return verifiedAt; }
    public AccountState getState() { return state; }
    public Long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    // No secret-bearing toString and no entity serialization through HTTP.
}

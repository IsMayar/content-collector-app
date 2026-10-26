package com.ayaantrix.collector.auth.entity;

import org.junit.jupiter.api.Test;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.*;

class AccountTokenTests {
    private final Instant now = Instant.parse("2026-10-26T00:00:00Z");
    private UserAccount user() {
        // Entity unit fixture only; real encoder/persistence are tested separately.
        return new UserAccount("alex@example.test", "Alex", "{argon2}$argon2id$fixture", now);
    }

    @Test
    void bindsPurposeAndUsesSpecifiedLifetime() {
        var verify = new AccountToken(user(), "a".repeat(64), TokenPurpose.VERIFY_EMAIL, now);
        assertEquals(now.plusSeconds(86400), verify.getExpiresAt());
        assertTrue(verify.isUsableFor(TokenPurpose.VERIFY_EMAIL, now));
        assertFalse(verify.isUsableFor(TokenPurpose.RESET_PASSWORD, now));
        var reset = new AccountToken(user(), "b".repeat(64), TokenPurpose.RESET_PASSWORD, now);
        assertEquals(now.plusSeconds(1800), reset.getExpiresAt());
    }

    @Test
    void excludesExpiredAndNotYetIssuedTokens() {
        var token = new AccountToken(user(), "a".repeat(64), TokenPurpose.RESET_PASSWORD, now);
        assertFalse(token.isUsableFor(TokenPurpose.RESET_PASSWORD, now.minusSeconds(1)));
        assertTrue(token.isUsableFor(TokenPurpose.RESET_PASSWORD, token.getExpiresAt().minusNanos(1)));
        assertFalse(token.isUsableFor(TokenPurpose.RESET_PASSWORD, token.getExpiresAt()));
    }

    @Test
    void rejectsRawTokenAndPlaintextPasswordAsStoredSecrets() {
        assertThrows(IllegalArgumentException.class,
                () -> new AccountToken(user(), "raw-token", TokenPurpose.VERIFY_EMAIL, now));
        assertThrows(IllegalArgumentException.class,
                () -> new UserAccount("alex@example.test", "Alex", "plaintext", now));
    }
}

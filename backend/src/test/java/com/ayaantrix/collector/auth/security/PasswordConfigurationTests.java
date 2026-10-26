package com.ayaantrix.collector.auth.security;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;
import static org.junit.jupiter.api.Assertions.*;

class PasswordConfigurationTests {
    private final PasswordEncoder encoder = new PasswordConfiguration().passwordEncoder();

    @Test
    void hashesWithPrefixedArgon2idAndSpecificationParameters() {
        String raw = "synthetic password for encoding";
        String hash = encoder.encode(raw);
        assertNotEquals(raw, hash);
        assertTrue(hash.startsWith("{argon2}$argon2id$v=19$m=19456,t=2,p=1$"));
        assertFalse(hash.contains(raw));
    }

    @Test
    void verifiesCorrectPasswordAndRejectsIncorrectPassword() {
        String hash = encoder.encode("synthetic correct password");
        assertTrue(encoder.matches("synthetic correct password", hash));
        assertFalse(encoder.matches("synthetic incorrect password", hash));
    }

    @Test
    void usesFreshSaltForRepeatedPassword() {
        assertNotEquals(encoder.encode("same synthetic password"), encoder.encode("same synthetic password"));
    }

    @Test
    void doesNotSilentlyTruncateBeyondBcryptByteLimit() {
        String longPassword = "x".repeat(100);
        String hash = encoder.encode(longPassword);
        assertTrue(encoder.matches(longPassword, hash));
        assertFalse(encoder.matches("x".repeat(72), hash));
    }
}

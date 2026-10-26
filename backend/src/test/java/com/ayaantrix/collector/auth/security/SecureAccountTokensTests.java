package com.ayaantrix.collector.auth.security;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import java.util.Base64;
import java.util.HashSet;
import static org.junit.jupiter.api.Assertions.*;

class SecureAccountTokensTests {
    private final SecureAccountTokens tokens = new SecureAccountTokens();

    @Test
    void generatesUrlSafeUnpadded256BitTokensAndDistinctDigests() {
        var rawValues = new HashSet<String>();
        var digests = new HashSet<String>();
        for (int i = 0; i < 100; i++) {
            String raw = tokens.generate();
            assertTrue(raw.matches("[A-Za-z0-9_-]{43}"));
            assertEquals(32, Base64.getUrlDecoder().decode(raw).length);
            assertTrue(rawValues.add(raw));
            String digest = tokens.digest(raw);
            assertTrue(digest.matches("[0-9a-f]{64}"));
            assertNotEquals(raw, digest);
            assertTrue(digests.add(digest));
        }
    }

    @Test
    void hasDeterministicKnownSha256Representation() {
        assertEquals("0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a", tokens.digest("A".repeat(43)));
        assertEquals(tokens.digest("A".repeat(43)), tokens.digest("A".repeat(43)));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"short", "invalid token should never appear in an error", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa="})
    void rejectsInvalidInputWithGenericError(String raw) {
        var error = assertThrows(IllegalArgumentException.class, () -> tokens.digest(raw));
        assertEquals("Invalid account token format.", error.getMessage());
    }
}

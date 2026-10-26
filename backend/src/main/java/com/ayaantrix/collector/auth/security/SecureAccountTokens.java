package com.ayaantrix.collector.auth.security;

import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

@Component
public class SecureAccountTokens {
    private final SecureRandom random = new SecureRandom();

    // Return only to trusted application services. Persist digest(raw), never raw.
    public String generate() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public String digest(String raw) {
        if (raw == null || !raw.matches("[A-Za-z0-9_-]{43}")) {
            throw new IllegalArgumentException("Invalid account token format.");
        }
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.");
        }
    }
}

package com.ayaantrix.collector.auth.security;

import java.util.Locale;

public final class EmailAddresses {
    private EmailAddresses() {}

    // Format validation belongs to DTO/entity Bean Validation, not case folding.
    public static String normalize(String email) {
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException("Email address is required.");
        }
        return email.strip().toLowerCase(Locale.ROOT);
    }
}

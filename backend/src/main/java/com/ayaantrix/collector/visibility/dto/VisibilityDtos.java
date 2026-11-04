package com.ayaantrix.collector.visibility.dto;

import jakarta.validation.constraints.*;

import java.time.*;
import java.util.*;

public final class VisibilityDtos {
    private VisibilityDtos() {}

    public record CreateShare(
            @NotBlank @Size(max = 80) String alias,
            @NotNull Instant expiresAt,
            @NotNull @Size(max = 10) List<@NotBlank String> allowedOrigins) {}

    public record CreatedShare(UUID shareId, String fragmentToken, String url) {
        @Override
        public String toString() {
            return "CreatedShare[redacted]";
        }
    }

    public record Exchange(@NotNull UUID shareId, @NotBlank @Size(max = 43) String token) {
        @Override
        public String toString() {
            return "StatusExchange[redacted]";
        }
    }

    public record ReadToken(String readToken) {
        @Override
        public String toString() {
            return "StatusReadToken[redacted]";
        }
    }

    public record Counts(
            String alias, long approved, long submitted, long requiredTotal, Instant updatedAt) {}

    public record Preference(boolean enabled, long version, String timezone, String sendTime) {}

    public record SavePreference(boolean enabled, @PositiveOrZero long expectedVersion) {}

    public record ProjectDigest(String alias, long awaitingReview, long clientAction, String url) {}

    public record DigestPreview(String timezone, String sendTime, List<ProjectDigest> projects) {}
}

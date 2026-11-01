package com.ayaantrix.collector.review.dto;

import jakarta.validation.constraints.*;

import java.util.UUID;

public final class ReviewDtos {
    private ReviewDtos() {}

    public enum Decision {
        APPROVE,
        REQUEST_CHANGES
    }

    public enum Visibility {
        CLIENT,
        INTERNAL
    }

    public record Decide(
            @NotNull UUID revisionId,
            @NotNull @Min(1) Long expectedItemVersion,
            @NotNull Decision decision,
            @Size(max = 5000) String reason) {
        @Override
        public String toString() {
            return "ReviewDecision[redacted]";
        }
    }

    public record AgencyComment(
            @NotBlank @Size(max = 5000) String body, @NotNull Visibility visibility) {
        @Override
        public String toString() {
            return "Comment[redacted]";
        }
    }

    public record ClientComment(@NotBlank @Size(max = 5000) String body) {
        @Override
        public String toString() {
            return "Comment[redacted]";
        }
    }
}

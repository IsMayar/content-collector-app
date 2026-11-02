package com.ayaantrix.collector.project.dto;

import jakarta.validation.constraints.*;

public final class ProjectLifecycleDtos {
    private ProjectLifecycleDtos() {}

    public record Command(@Min(1) long expectedVersion, @Size(max = 5000) String reason) {
        @Override
        public String toString() {
            return "ProjectLifecycle[redacted]";
        }
    }

    public record Reopen(
            @Min(1) long expectedItemVersion, @NotBlank @Size(max = 5000) String reason) {
        @Override
        public String toString() {
            return "ItemReopen[redacted]";
        }
    }
}

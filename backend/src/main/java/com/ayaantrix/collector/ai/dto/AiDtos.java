package com.ayaantrix.collector.ai.dto;

import jakarta.validation.constraints.*;

import java.util.*;

public final class AiDtos {
    private AiDtos() {}

    public record Create(
            @NotNull @Size(min = 1, max = 10) List<@NotBlank @Size(max = 1000) String> facts,
            @NotBlank @Size(max = 80) String tone,
            @Min(30) @Max(500) int targetWords,
            @Min(0) long baseAnswerVersion,
            @AssertTrue boolean consent) {
        @Override
        public String toString() {
            return "AiDraftCommand[redacted]";
        }
    }

    public record Accept(@NotNull @Min(0) Long expectedAnswerVersion) {}

    public record Result(
            String draft,
            List<String> factsUsed,
            List<String> missingFacts,
            List<String> warnings) {
        @Override
        public String toString() {
            return "AiDraftResult[redacted]";
        }
    }

    public record Job(
            UUID id,
            UUID itemId,
            String state,
            long baseAnswerVersion,
            Result result,
            String failureCode) {}
}

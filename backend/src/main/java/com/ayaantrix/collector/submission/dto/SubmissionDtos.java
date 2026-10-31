package com.ayaantrix.collector.submission.dto;

import jakarta.validation.constraints.*;

import java.util.UUID;

public final class SubmissionDtos {
    private SubmissionDtos() {}

    public record Submit(
            @Min(0) long expectedAnswerVersion, @Min(1) long expectedStructureVersion) {}

    public record Withdraw(@Min(1) long expectedItemVersion) {}

    public record Submitted(UUID revisionId, int revisionNo, long itemVersion, String state) {}

    public record Withdrawn(String state, long itemVersion) {}
}

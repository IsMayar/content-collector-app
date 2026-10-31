package com.ayaantrix.collector.attachment.dto;

import jakarta.validation.constraints.*;

import java.time.Instant;
import java.util.*;

public final class AttachmentDtos {
    private AttachmentDtos() {}

    public record Reserve(
            @NotNull UUID itemId,
            @NotBlank @Size(max = 250) String originalName,
            @NotBlank @Size(max = 150) String contentType,
            @NotNull @Positive Long bytes,
            @NotNull Boolean keepOriginal) {}

    public record Reservation(
            UUID assetId,
            UUID uploadId,
            String putUrl,
            Map<String, String> requiredHeaders,
            Instant expiresAt) {
        @Override
        public String toString() {
            return "PrivateUpload[redacted]";
        }
    }

    public record Summary(
            UUID id,
            UUID itemId,
            String originalName,
            String contentType,
            String state,
            long sourceBytes,
            long retainedBytes,
            boolean keepOriginal,
            List<String> availableVariants,
            String rejectionCode) {}

    public record Download(
            @NotBlank @Pattern(regexp = "ORIGINAL|WORKING|THUMBNAIL") String variant) {}
}

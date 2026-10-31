package com.ayaantrix.collector.attachment.entity;

import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.UUID;

/** Internal JDBC projection; never serialized as an API response. */
public record Attachment(
        UUID id,
        UUID workspace,
        UUID project,
        UUID item,
        UUID contact,
        String state,
        String name,
        String declaredType,
        String detectedType,
        long bytes,
        long retained,
        boolean keep,
        String staging,
        String canonical,
        JsonNode variants,
        JsonNode objectKeys,
        String rejection,
        UUID lease,
        Instant leaseUntil,
        int attempts,
        Instant created,
        Instant cleanup,
        UUID upload,
        String reservationState,
        long reserved,
        Instant expires) {
    @Override
    public String toString() {
        return "PrivateAttachment[" + id + "," + state + "]";
    }
}

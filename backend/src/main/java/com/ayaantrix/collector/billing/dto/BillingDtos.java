package com.ayaantrix.collector.billing.dto;

import com.ayaantrix.collector.workspace.entity.PlanKey;

import jakarta.validation.constraints.NotNull;

import java.time.Instant;

public final class BillingDtos {
    private BillingDtos() {}

    public record Checkout(@NotNull PlanKey planKey) {}

    public record Usage(
            Instant periodStart,
            Instant periodEnd,
            long storageUsedBytes,
            long storageReservedBytes,
            long storageLimitBytes,
            long aiDraftsUsed,
            int aiDraftAllowance,
            long smsSegmentsUsed,
            int smsSegmentAllowance,
            long seatsUsed,
            long seatsReserved,
            int seatsLimit,
            long aiDraftsReserved,
            long smsSegmentsReserved,
            Instant aiPeriodStart,
            Instant aiPeriodEnd) {}
}

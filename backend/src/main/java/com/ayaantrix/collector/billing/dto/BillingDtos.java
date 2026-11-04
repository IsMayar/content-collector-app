package com.ayaantrix.collector.billing.dto;

import com.ayaantrix.collector.workspace.entity.PlanKey;

import jakarta.validation.constraints.NotNull;

public final class BillingDtos {
    private BillingDtos() {}

    public record Checkout(@NotNull PlanKey planKey) {}
}

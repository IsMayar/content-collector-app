package com.ayaantrix.collector.billing.service;

import com.ayaantrix.collector.workspace.entity.PlanKey;

import java.time.Instant;
import java.util.UUID;

/**
 * Hosted capabilities and read-only reconciliation; implementations must never grant entitlements.
 */
public interface BillingProvider {
    String customer(UUID workspace);

    String checkout(UUID workspace, UUID operation, String customer, PlanKey plan);

    String portal(UUID workspace, UUID operation, String customer);

    Snapshot current(String customer);

    record Snapshot(
            String id,
            UUID workspace,
            UUID checkout,
            PlanKey plan,
            String state,
            Instant start,
            Instant end,
            boolean cancelAtPeriodEnd,
            boolean paid) {}
}

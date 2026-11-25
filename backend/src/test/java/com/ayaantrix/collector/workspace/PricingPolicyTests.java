package com.ayaantrix.collector.workspace;

import com.ayaantrix.collector.workspace.entity.*;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

class PricingPolicyTests {
    private static final Instant NOW=Instant.parse("2026-11-20T00:00:00Z");
    @Test void freeHasNoExpirationAndNoPaidCapabilities() {
        var subscription=new WorkspaceSubscription(UUID.randomUUID(),PlanKey.FREE,NOW);
        var later=NOW.plus(Duration.ofDays(3650));
        assertThat(subscription.writable(later)).isTrue();
        assertThat(subscription.readable(later)).isTrue();
        assertThat(subscription.effectiveState(later)).isEqualTo(WorkspaceSubscription.State.FREE);
        assertThat(PlanKey.FREE.activeProjects()).isEqualTo(2);
        assertThat(PlanKey.FREE.contacts()).isEqualTo(5);
        assertThat(PlanKey.FREE.storageBytes()).isEqualTo(500_000_000L);
        assertThat(PlanKey.FREE.aiDrafts()+PlanKey.FREE.smsSegments()).isZero();
        assertThat(PlanKey.FREE.zipExport()).isFalse();
        assertThat(PlanKey.FREE.delegatedReview()).isFalse();
    }
    @Test void legacyTrialFallsBackToFreeAtExactBoundaryWithoutExtendingPaidBenefits() {
        var subscription=new WorkspaceSubscription(UUID.randomUUID(),PlanKey.AGENCY,NOW);
        var end=NOW.plus(Duration.ofDays(14));
        assertThat(subscription.effectivePlan(end.minusNanos(1))).isEqualTo(PlanKey.AGENCY);
        assertThat(subscription.effectivePlan(end)).isEqualTo(PlanKey.FREE);
        assertThat(subscription.writable(end)).isTrue();
        assertThat(subscription.trial(end)).isFalse();
        assertThat(subscription.plan()).isEqualTo(PlanKey.AGENCY);
    }
    @Test void paidPlansHaveExactApprovedLimitsAndIndependentCapabilities() {
        assertThat(PlanKey.SOLO.monthlyCents()).isEqualTo(700);
        assertThat(PlanKey.SOLO.activeProjects()).isEqualTo(10);
        assertThat(PlanKey.SOLO.contacts()).isEqualTo(50);
        assertThat(PlanKey.SOLO.storageBytes()).isEqualTo(5_000_000_000L);
        assertThat(PlanKey.SOLO.smsSegments()).isZero();
        assertThat(PlanKey.SOLO.delegatedReview()).isFalse();
        assertThat(PlanKey.AGENCY.monthlyCents()).isEqualTo(1900);
        assertThat(PlanKey.AGENCY.activeProjects()).isNull();
        assertThat(PlanKey.AGENCY.contacts()).isNull();
        assertThat(PlanKey.AGENCY.storageBytes()).isEqualTo(25_000_000_000L);
        assertThat(PlanKey.AGENCY.aiDrafts()).isEqualTo(200);
        assertThat(PlanKey.AGENCY.smsSegments()).isEqualTo(50);
    }
    @Test void futureDatedActiveSubscriptionDeniesAccessUntilItsPeriodBegins() {
        var subscription=new WorkspaceSubscription(UUID.randomUUID(),PlanKey.SOLO,NOW);
        var futureStart=NOW.plus(Duration.ofDays(30));
        var futureEnd=futureStart.plus(Duration.ofDays(30));
        org.springframework.test.util.ReflectionTestUtils.setField(subscription,"state",WorkspaceSubscription.State.ACTIVE);
        org.springframework.test.util.ReflectionTestUtils.setField(subscription,"currentPeriodStart",futureStart);
        org.springframework.test.util.ReflectionTestUtils.setField(subscription,"currentPeriodEnd",futureEnd);

        // Stripe test clocks can make an ACTIVE paid period start after server time.
        // Never grant access solely based on the stored ACTIVE state.
        assertThat(subscription.effectiveState(NOW)).isEqualTo(WorkspaceSubscription.State.READ_ONLY);
        assertThat(subscription.writable(NOW)).isFalse();
        assertThat(subscription.readable(NOW)).isFalse();
        assertThat(subscription.readOnlyDeadline()).isEqualTo(futureEnd.plus(Duration.ofDays(30)));
        assertThat(subscription.writable(futureStart)).isTrue();
        assertThat(subscription.readable(futureStart)).isTrue();
    }
    @Test void verifiedPeriodEndCancellationFallsBackToFreeWithoutWaitingForWorker() {
        var s=new WorkspaceSubscription(UUID.randomUUID(),PlanKey.AGENCY,NOW);
        org.springframework.test.util.ReflectionTestUtils.setField(s,"state",WorkspaceSubscription.State.ACTIVE);
        org.springframework.test.util.ReflectionTestUtils.setField(s,"cancelAtPeriodEnd",true);
        var end=NOW.plus(Duration.ofDays(14));
        assertThat(s.effectivePlan(end.minusNanos(1))).isEqualTo(PlanKey.AGENCY);
        assertThat(s.effectivePlan(end)).isEqualTo(PlanKey.FREE);
        assertThat(s.writable(end)).isTrue();
        org.springframework.test.util.ReflectionTestUtils.setField(s,"state",WorkspaceSubscription.State.SUSPENDED);
        assertThat(s.writable(end)).isFalse();
        assertThat(s.readable(end)).isFalse();
    }
    @Test void pastDueGraceAndReadOnlyWindowHaveExactBoundaries() {
        var subscription = new WorkspaceSubscription(UUID.randomUUID(), PlanKey.SOLO, NOW);
        var grace = NOW.plus(Duration.ofDays(7));
        var deadline = grace.plus(Duration.ofDays(30));
        org.springframework.test.util.ReflectionTestUtils.setField(
                subscription, "state", WorkspaceSubscription.State.PAST_DUE);
        org.springframework.test.util.ReflectionTestUtils.setField(
                subscription, "currentPeriodStart", NOW.minus(Duration.ofDays(30)));
        org.springframework.test.util.ReflectionTestUtils.setField(
                subscription, "currentPeriodEnd", NOW.plus(Duration.ofDays(2)));
        org.springframework.test.util.ReflectionTestUtils.setField(subscription, "graceEndsAt", grace);
        org.springframework.test.util.ReflectionTestUtils.setField(
                subscription, "readOnlyEndsAt", deadline);

        assertThat(subscription.writable(grace.minusNanos(1))).isTrue();
        assertThat(subscription.effectiveState(grace.minusNanos(1)))
                .isEqualTo(WorkspaceSubscription.State.PAST_DUE);
        assertThat(subscription.writable(grace)).isFalse();
        assertThat(subscription.effectiveState(grace))
                .isEqualTo(WorkspaceSubscription.State.READ_ONLY);
        assertThat(subscription.readOnlyDeadline()).isEqualTo(deadline);
        assertThat(subscription.readable(deadline.minusNanos(1))).isTrue();
        assertThat(subscription.readable(deadline)).isFalse();
    }

    @Test void scheduledCancellationReturnsPaidPlansToPermanentFreeAtPeriodEnd() {
        for (var plan : java.util.List.of(PlanKey.SOLO, PlanKey.AGENCY)) {
            var subscription = new WorkspaceSubscription(UUID.randomUUID(), plan, NOW);
            var end = NOW.plus(Duration.ofDays(1));
            org.springframework.test.util.ReflectionTestUtils.setField(
                    subscription, "state", WorkspaceSubscription.State.ACTIVE);
            org.springframework.test.util.ReflectionTestUtils.setField(
                    subscription, "currentPeriodEnd", end);
            org.springframework.test.util.ReflectionTestUtils.setField(
                    subscription, "cancelAtPeriodEnd", true);

            assertThat(subscription.effectiveState(end.minusNanos(1)))
                    .isEqualTo(WorkspaceSubscription.State.ACTIVE);
            assertThat(subscription.effectivePlan(end.minusNanos(1))).isEqualTo(plan);
            assertThat(subscription.effectiveState(end))
                    .isEqualTo(WorkspaceSubscription.State.FREE);
            assertThat(subscription.effectivePlan(end)).isEqualTo(PlanKey.FREE);
            assertThat(subscription.writable(end.plus(Duration.ofDays(365)))).isTrue();
            assertThat(subscription.readable(end.plus(Duration.ofDays(365)))).isTrue();
        }
    }

}

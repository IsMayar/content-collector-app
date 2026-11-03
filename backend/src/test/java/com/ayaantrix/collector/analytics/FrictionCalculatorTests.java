package com.ayaantrix.collector.analytics;

import static org.assertj.core.api.Assertions.*;

import com.ayaantrix.collector.analytics.repository.AnalyticsRepository.Observation;
import com.ayaantrix.collector.analytics.service.FrictionCalculator;

import org.junit.jupiter.api.Test;

import java.time.*;
import java.util.*;

class FrictionCalculatorTests {
    static final Instant NOW = Instant.parse("2026-11-03T00:00:00Z");
    static final UUID TEMPLATE = UUID.randomUUID();

    Observation row(Instant start, Instant submit) {
        return new Observation(
                UUID.randomUUID(),
                UUID.randomUUID(),
                TEMPLATE,
                "intro",
                "WEBSITE",
                "Template",
                start,
                submit);
    }

    @Test
    void openWindowsNeverBecomeFrictionAndSmallClosedSamplesSuppressPercentages() {
        var rows = new ArrayList<Observation>();
        for (int i = 0; i < 9; i++) rows.add(row(NOW.minus(Duration.ofDays(8)), null));
        for (int i = 0; i < 20; i++) rows.add(row(NOW.minus(Duration.ofDays(1)), null));
        var m = FrictionCalculator.calculate(rows, NOW).values().iterator().next();
        assertThat(m.eligibleStarts()).isEqualTo(29);
        assertThat(m.completedObservationWindows()).isEqualTo(9);
        assertThat(m.startsWithoutSubmission()).isEqualTo(9);
        assertThat(m.rate()).isNull();
        assertThat(m.insufficientData()).isTrue();
        assertThat(m.completedSubmissions()).isZero();
        assertThat(m.medianFirstSubmissionSeconds()).isNull();
    }

    @Test
    void percentageUsesClosedDenominatorAndLateSubmissionRemainsSevenDaySignal() {
        var rows = new ArrayList<Observation>();
        var start = NOW.minus(Duration.ofDays(10));
        for (int i = 0; i < 4; i++) rows.add(row(start, start.plus(Duration.ofDays(2))));
        rows.add(row(start, start.plus(Duration.ofDays(8))));
        for (int i = 0; i < 5; i++) rows.add(row(start, null));
        rows.add(row(NOW.minusSeconds(1), null));
        var m = FrictionCalculator.calculate(rows, NOW).values().iterator().next();
        assertThat(m.eligibleStarts()).isEqualTo(11);
        assertThat(m.completedObservationWindows()).isEqualTo(10);
        assertThat(m.startsWithoutSubmission()).isEqualTo(6);
        assertThat(m.rate()).isEqualTo(.6);
        assertThat(m.insufficientData()).isFalse();
        assertThat(m.completedSubmissions()).isEqualTo(5);
        assertThat(m.medianFirstSubmissionSeconds()).isEqualTo(172800.0);
    }

    @Test
    void exactSevenDayBoundaryCountsButAlreadySubmittedFutureAndExpiredStartsDoNot() {
        var start = NOW.minus(Duration.ofDays(7));
        var rows =
                List.of(
                        row(start, NOW),
                        row(start.minusSeconds(1), null),
                        row(start, start.minusSeconds(1)),
                        row(NOW.plusSeconds(1), null),
                        row(NOW.minus(Duration.ofDays(91)), null));
        var m = FrictionCalculator.calculate(rows, NOW).values().iterator().next();
        assertThat(m.eligibleStarts()).isEqualTo(2);
        assertThat(m.completedObservationWindows()).isEqualTo(2);
        assertThat(m.startsWithoutSubmission()).isEqualTo(1);
    }

    @Test
    void templateVersionsStableKeysAndProjectTypesNeverCombine() {
        var start = NOW.minus(Duration.ofDays(8));
        var a = row(start, null);
        var rows =
                List.of(
                        a,
                        new Observation(
                                a.project(),
                                a.item(),
                                UUID.randomUUID(),
                                a.key(),
                                a.type(),
                                a.title(),
                                start,
                                null),
                        new Observation(
                                a.project(),
                                a.item(),
                                a.template(),
                                "other",
                                a.type(),
                                a.title(),
                                start,
                                null),
                        new Observation(
                                a.project(),
                                a.item(),
                                a.template(),
                                a.key(),
                                "WEB_APP",
                                a.title(),
                                start,
                                null));
        assertThat(FrictionCalculator.calculate(rows, NOW)).hasSize(4);
    }

    @Test
    void repeatedSessionsDoNotDuplicateDurationSamplesOrAttributeReviewDelay() {
        var start = NOW.minus(Duration.ofDays(5));
        var submitted = start.plusSeconds(100);
        var a = row(start, submitted);
        var b =
                new Observation(
                        a.project(),
                        a.item(),
                        a.template(),
                        a.key(),
                        a.type(),
                        a.title(),
                        start.plusSeconds(20),
                        submitted);
        var m = FrictionCalculator.calculate(List.of(a, b), NOW).values().iterator().next();
        assertThat(m.eligibleStarts()).isEqualTo(2);
        assertThat(m.completedSubmissions()).isEqualTo(1);
        assertThat(m.medianFirstSubmissionSeconds()).isEqualTo(100.0);
        assertThat(m.completedObservationWindows()).isZero();
        assertThat(FrictionCalculator.calculate(List.of(), NOW)).isEmpty();
    }
}

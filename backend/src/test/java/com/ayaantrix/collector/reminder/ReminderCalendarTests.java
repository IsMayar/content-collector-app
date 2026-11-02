package com.ayaantrix.collector.reminder;

import static org.assertj.core.api.Assertions.*;

import com.ayaantrix.collector.reminder.dto.ReminderDtos.*;
import com.ayaantrix.collector.reminder.service.ReminderCalendar;

import org.junit.jupiter.api.Test;

import java.time.*;
import java.util.*;

class ReminderCalendarTests {
    Policy policy(String time, boolean weekdays) {
        return new Policy(
                1,
                true,
                false,
                "America/New_York",
                List.of(-3, 0, 3).stream()
                        .map(d -> new Rule(UUID.randomUUID(), "EMAIL", d, time, weekdays))
                        .toList());
    }

    @Test
    void downtimeKeepsOneUsefulCatchupAndFuture() {
        var list =
                ReminderCalendar.plan(
                        LocalDate.of(2026, 11, 3),
                        policy("10:00", false),
                        null,
                        Instant.parse("2026-11-04T12:00:00Z"));
        assertThat(list).hasSize(2);
        assertThat(list.getFirst().date()).isEqualTo(LocalDate.of(2026, 11, 3));
        assertThat(list.get(1).date()).isEqualTo(LocalDate.of(2026, 11, 6));
    }

    @Test
    void skipsWeekendsAndHonorsRecipientZone() {
        var list =
                ReminderCalendar.plan(
                        LocalDate.of(2026, 11, 2),
                        policy("10:00", true),
                        "Asia/Kabul",
                        Instant.parse("2026-10-29T00:00:00Z"));
        assertThat(list).hasSize(3);
        assertThat(list.getFirst().due()).isEqualTo(Instant.parse("2026-10-30T05:30:00Z"));
        assertThat(list)
                .allSatisfy(x -> assertThat(x.date().getDayOfWeek().getValue()).isLessThan(6));
    }

    @Test
    void daylightSavingsGapAndOverlapAreDeterministic() {
        var gap =
                ReminderCalendar.plan(
                        LocalDate.of(2026, 3, 8),
                        policy("02:30", false),
                        null,
                        Instant.parse("2026-03-08T00:00:00Z"));
        assertThat(
                        gap.stream()
                                .filter(x -> x.date().equals(LocalDate.of(2026, 3, 8)))
                                .findFirst()
                                .orElseThrow()
                                .due())
                .isEqualTo(Instant.parse("2026-03-08T07:30:00Z"));
        var overlap =
                ReminderCalendar.plan(
                        LocalDate.of(2026, 11, 1),
                        policy("01:30", false),
                        null,
                        Instant.parse("2026-11-01T00:00:00Z"));
        assertThat(
                        overlap.stream()
                                .filter(x -> x.date().equals(LocalDate.of(2026, 11, 1)))
                                .findFirst()
                                .orElseThrow()
                                .due())
                .isEqualTo(Instant.parse("2026-11-01T05:30:00Z"));
    }
}

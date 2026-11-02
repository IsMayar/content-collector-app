package com.ayaantrix.collector.reminder.service;

import com.ayaantrix.collector.reminder.dto.ReminderDtos.*;

import java.time.*;
import java.util.*;

/**
 * Local calendar dates are authoritative; gaps shift forward and overlaps choose the earlier
 * offset.
 */
public final class ReminderCalendar {
    private ReminderCalendar() {}

    public record Occurrence(UUID rule, LocalDate date, Instant due, String timezone) {}

    public static List<Occurrence> plan(
            LocalDate deadline, Policy policy, String recipientZone, Instant now) {
        var zone = ZoneId.of(recipientZone == null ? policy.timezone() : recipientZone);
        var today = now.atZone(zone).toLocalDate();
        var future = new ArrayList<Occurrence>();
        var past = new ArrayList<Occurrence>();
        for (var rule : policy.rules()) {
            var date = deadline.plusDays(rule.daysRelativeToDueDate());
            if (rule.weekdaysOnly() && date.getDayOfWeek().getValue() > 5) continue;
            var due = date.atTime(LocalTime.parse(rule.localTime())).atZone(zone).toInstant();
            var occurrence = new Occurrence(rule.id(), date, due, zone.getId());
            if (due.isAfter(now)) future.add(occurrence);
            else if (!due.isBefore(now.minus(Duration.ofDays(7)))) past.add(occurrence);
        }
        future.sort(Comparator.comparing(Occurrence::due));
        past.sort(Comparator.comparing(Occurrence::due).reversed());
        var result = new ArrayList<Occurrence>();
        if (!past.isEmpty() && future.stream().noneMatch(o -> o.date().equals(today)))
            result.add(past.getFirst());
        result.addAll(future);
        return result;
    }
}

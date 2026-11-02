package com.ayaantrix.collector.reminder.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.util.*;

public final class ReminderDtos {
    private ReminderDtos() {}

    public record Rule(
            @NotNull UUID id,
            @NotNull String channel,
            @Min(-30) @Max(90) int daysRelativeToDueDate,
            @NotNull @Pattern(regexp = "[0-2][0-9]:[0-5][0-9]") String localTime,
            boolean weekdaysOnly) {}

    public record Policy(
            long version, boolean enabled, boolean paused, String timezone, List<Rule> rules) {}

    public record Update(
            @NotNull @Size(max = 5) List<@Valid Rule> rules,
            @NotNull String timezone,
            boolean paused,
            @NotNull @Min(1) Long expectedVersion,
            Boolean enabled) {}

    public record Send(@NotNull UUID contactId, @NotNull String channel) {}

    public record Preview(
            String channel,
            String subject,
            String body,
            boolean eligible,
            List<String> reasons,
            Integer estimatedSegments) {}

    public record Preferences(
            boolean emailEnabled,
            String timezone,
            String smsStatus,
            String emailSuppressionReason) {}

    public record ChangePreferences(@NotNull Boolean emailEnabled, String timezone) {}
}

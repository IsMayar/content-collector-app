package com.ayaantrix.collector.analytics.dto;

import com.ayaantrix.collector.project.dto.ProjectDtos.Progress;

import java.time.Instant;
import java.util.*;

public final class AnalyticsDtos {
    private AnalyticsDtos() {}

    public record FrictionMetric(
            String itemKey,
            UUID templateVersionId,
            long eligibleStarts,
            long completedObservationWindows,
            long startsWithoutSubmission,
            Double rate,
            boolean insufficientData,
            Double medianFirstSubmissionSeconds,
            long completedSubmissions) {}

    public record ProjectAnalytics(
            Progress progress, List<FrictionMetric> friction, Instant generatedAt) {}

    public record TemplateMetric(
            String itemKey,
            UUID templateVersionId,
            long eligibleStarts,
            long completedObservationWindows,
            long startsWithoutSubmission,
            Double rate,
            boolean insufficientData,
            Double medianFirstSubmissionSeconds,
            long completedSubmissions,
            String projectType,
            String templateTitle) {
        public static TemplateMetric of(FrictionMetric m, String type, String title) {
            return new TemplateMetric(
                    m.itemKey(),
                    m.templateVersionId(),
                    m.eligibleStarts(),
                    m.completedObservationWindows(),
                    m.startsWithoutSubmission(),
                    m.rate(),
                    m.insufficientData(),
                    m.medianFirstSubmissionSeconds(),
                    m.completedSubmissions(),
                    type,
                    title);
        }
    }
}

package com.ayaantrix.collector.analytics.service;

import com.ayaantrix.collector.analytics.dto.AnalyticsDtos.*;
import com.ayaantrix.collector.analytics.repository.AnalyticsRepository.Observation;

import java.time.*;
import java.util.*;

public final class FrictionCalculator {
    private FrictionCalculator() {}

    public record Group(UUID template, String key, String type, String title) {}

    public static Map<Group, FrictionMetric> calculate(List<Observation> rows, Instant now) {
        var groups = new LinkedHashMap<Group, List<Observation>>();
        for (var o : rows) {
            if (o.start().isAfter(now)
                    || o.start().isBefore(now.minus(Duration.ofDays(90)))
                    || o.firstSubmission() != null && o.firstSubmission().isBefore(o.start()))
                continue;
            groups.computeIfAbsent(
                            new Group(o.template(), o.key(), o.type(), o.title()),
                            k -> new ArrayList<>())
                    .add(o);
        }
        var result = new LinkedHashMap<Group, FrictionMetric>();
        groups.forEach(
                (g, observations) -> {
                    long closed = 0, without = 0;
                    var firstStarts = new HashMap<String, Observation>();
                    for (var o : observations) {
                        var end = o.start().plus(Duration.ofDays(7));
                        if (!now.isBefore(end)) {
                            closed++;
                            if (o.firstSubmission() == null || o.firstSubmission().isAfter(end))
                                without++;
                        }
                        // Duration is the first immutable submission minus the earliest observed
                        // item start,
                        // once per project/item; approvals and later revisions never become client
                        // delay.
                        firstStarts.merge(
                                o.project() + "/" + o.item(),
                                o,
                                (a, b) -> a.start().isBefore(b.start()) ? a : b);
                    }
                    var durations = new ArrayList<Double>();
                    for (var o : firstStarts.values())
                        if (o.firstSubmission() != null && !o.firstSubmission().isAfter(now))
                            durations.add(
                                    Duration.between(o.start(), o.firstSubmission()).toMillis()
                                            / 1000.0);
                    Collections.sort(durations);
                    Double median = null;
                    if (!durations.isEmpty()) {
                        int mid = durations.size() / 2;
                        median =
                                durations.size() % 2 == 1
                                        ? durations.get(mid)
                                        : (durations.get(mid - 1) + durations.get(mid)) / 2;
                    }
                    boolean insufficient = observations.size() < 10 || closed < 10;
                    result.put(
                            g,
                            new FrictionMetric(
                                    g.key(),
                                    g.template(),
                                    observations.size(),
                                    closed,
                                    without,
                                    insufficient ? null : (double) without / closed,
                                    insufficient,
                                    median,
                                    durations.size()));
                });
        return result;
    }
}

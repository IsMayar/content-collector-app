package com.ayaantrix.collector.analytics.service;

import com.ayaantrix.collector.analytics.dto.AnalyticsDtos.*;
import com.ayaantrix.collector.analytics.repository.AnalyticsRepository;
import com.ayaantrix.collector.project.repository.*;
import com.ayaantrix.collector.project.security.ProjectAuthorization;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.*;

@Service
@Transactional
public class AnalyticsService {
    private final ProjectAuthorization auth;
    private final ProjectRepository projects;
    private final ProjectStructureRepository structures;
    private final AnalyticsRepository repo;
    private final Clock clock;

    public AnalyticsService(
            ProjectAuthorization auth,
            ProjectRepository projects,
            ProjectStructureRepository structures,
            AnalyticsRepository repo,
            Clock clock) {
        this.auth = auth;
        this.projects = projects;
        this.structures = structures;
        this.repo = repo;
        this.clock = clock;
    }

    public ProjectAnalytics project(UUID w, UUID p) {
        var a = auth.access(w, false);
        auth.readableProject(a, p);
        projects.findByWorkspaceIdAndId(w, p).orElseThrow(ProjectAuthorization::missing);
        var now = clock.instant();
        return new ProjectAnalytics(
                structures.progress(w, List.of(p)).get(p),
                List.copyOf(
                        FrictionCalculator.calculate(repo.observations(w, p, now), now).values()),
                now);
    }

    public List<TemplateMetric> templates(UUID w) {
        auth.access(w, true);
        var now = clock.instant();
        return FrictionCalculator.calculate(repo.observations(w, null, now), now)
                .entrySet()
                .stream()
                .map(e -> TemplateMetric.of(e.getValue(), e.getKey().type(), e.getKey().title()))
                .toList();
    }
}

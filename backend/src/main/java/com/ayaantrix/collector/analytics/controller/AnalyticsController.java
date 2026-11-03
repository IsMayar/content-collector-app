package com.ayaantrix.collector.analytics.controller;

import com.ayaantrix.collector.analytics.dto.AnalyticsDtos.*;
import com.ayaantrix.collector.analytics.service.AnalyticsService;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/workspaces/{workspace}")
public class AnalyticsController {
    private final AnalyticsService service;

    public AnalyticsController(AnalyticsService service) {
        this.service = service;
    }

    @GetMapping("/projects/{project}/analytics")
    ResponseEntity<Map<String, ProjectAnalytics>> project(
            @PathVariable UUID workspace, @PathVariable UUID project) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(Map.of("metrics", service.project(workspace, project)));
    }

    @GetMapping("/analytics/templates")
    ResponseEntity<Map<String, List<TemplateMetric>>> templates(@PathVariable UUID workspace) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(Map.of("data", service.templates(workspace)));
    }
}

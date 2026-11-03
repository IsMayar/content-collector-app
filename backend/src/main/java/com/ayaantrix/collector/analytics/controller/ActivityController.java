package com.ayaantrix.collector.analytics.controller;

import com.ayaantrix.collector.analytics.dto.ActivityDtos.Activity;
import com.ayaantrix.collector.analytics.service.ActivityService;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces/{workspace}/projects/{project}/activity")
public class ActivityController {
    private final ActivityService service;

    public ActivityController(ActivityService service) {
        this.service = service;
    }

    @GetMapping
    ResponseEntity<Activity> read(
            @PathVariable UUID workspace,
            @PathVariable UUID project,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.read(workspace, project, page, size));
    }
}

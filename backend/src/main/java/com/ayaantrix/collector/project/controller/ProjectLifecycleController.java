package com.ayaantrix.collector.project.controller;

import com.ayaantrix.collector.project.dto.ProjectLifecycleDtos.*;
import com.ayaantrix.collector.project.service.*;

import jakarta.validation.Valid;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/workspaces/{workspace}/projects/{project}")
public class ProjectLifecycleController {
    private final ProjectLifecycleService projects;
    private final ProjectReopeningService items;

    public ProjectLifecycleController(
            ProjectLifecycleService projects, ProjectReopeningService items) {
        this.projects = projects;
        this.items = items;
    }

    @PostMapping("/{action:publish|pause|resume|complete|reopen|archive|restore}")
    ResponseEntity<Map<String, Object>> action(
            @PathVariable UUID workspace,
            @PathVariable UUID project,
            @PathVariable String action,
            @Valid @RequestBody Command input,
            @RequestHeader("Idempotency-Key") String key) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(projects.transition(workspace, project, action, input, key));
    }

    @PostMapping("/items/{item}/reopen")
    ResponseEntity<Map<String, Object>> reopen(
            @PathVariable UUID workspace,
            @PathVariable UUID project,
            @PathVariable UUID item,
            @Valid @RequestBody Reopen input,
            @RequestHeader("Idempotency-Key") String key) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(items.reopen(workspace, project, item, input, key));
    }
}

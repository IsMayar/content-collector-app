package com.ayaantrix.collector.submission.controller;

import com.ayaantrix.collector.submission.service.SubmissionService;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/workspaces/{workspace}/projects/{project}")
public class AgencySubmissionController {
    private final SubmissionService service;

    public AgencySubmissionController(SubmissionService service) {
        this.service = service;
    }

    @GetMapping("/review-queue")
    ResponseEntity<Map<String, Object>> queue(
            @PathVariable UUID workspace,
            @PathVariable UUID project,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {
        return ok(service.queue(workspace, project, page, size));
    }

    @GetMapping("/items/{item}/revisions")
    ResponseEntity<Map<String, Object>> history(
            @PathVariable UUID workspace, @PathVariable UUID project, @PathVariable UUID item) {
        return ok(service.history(workspace, project, item));
    }

    @GetMapping("/items/{item}/revisions/{revision}")
    ResponseEntity<Map<String, Object>> detail(
            @PathVariable UUID workspace,
            @PathVariable UUID project,
            @PathVariable UUID item,
            @PathVariable UUID revision) {
        return ok(service.detail(workspace, project, item, revision));
    }

    private ResponseEntity<Map<String, Object>> ok(Map<String, Object> body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}

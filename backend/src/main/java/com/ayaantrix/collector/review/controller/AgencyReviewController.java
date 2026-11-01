package com.ayaantrix.collector.review.controller;

import com.ayaantrix.collector.review.dto.ReviewDtos.*;
import com.ayaantrix.collector.review.service.ReviewService;

import jakarta.validation.Valid;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/workspaces/{workspace}/projects/{project}/items/{item}")
public class AgencyReviewController {
    private final ReviewService service;

    public AgencyReviewController(ReviewService service) {
        this.service = service;
    }

    @PostMapping("/review-decisions")
    ResponseEntity<Map<String, Object>> decide(
            @PathVariable UUID workspace,
            @PathVariable UUID project,
            @PathVariable UUID item,
            @Valid @RequestBody Decide input,
            @RequestHeader("Idempotency-Key") String key) {
        return created(service.decide(workspace, project, item, input, key));
    }

    @GetMapping("/comments")
    ResponseEntity<Map<String, Object>> comments(
            @PathVariable UUID workspace, @PathVariable UUID project, @PathVariable UUID item) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.agencyComments(workspace, project, item));
    }

    @PostMapping("/comments")
    ResponseEntity<Map<String, Object>> add(
            @PathVariable UUID workspace,
            @PathVariable UUID project,
            @PathVariable UUID item,
            @Valid @RequestBody AgencyComment input) {
        return created(service.addAgencyComment(workspace, project, item, input));
    }

    private ResponseEntity<Map<String, Object>> created(Map<String, Object> body) {
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(body);
    }
}

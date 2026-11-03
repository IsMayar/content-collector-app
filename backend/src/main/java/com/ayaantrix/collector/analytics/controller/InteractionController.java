package com.ayaantrix.collector.analytics.controller;

import com.ayaantrix.collector.analytics.service.InteractionService;
import com.ayaantrix.collector.clientaccess.security.ClientSessionCookies;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import tools.jackson.databind.JsonNode;

import java.util.*;

@RestController
@RequestMapping("/api/v1/client/projects/{project}/events")
public class InteractionController {
    private final InteractionService service;
    private final ClientSessionCookies cookies;

    public InteractionController(InteractionService service, ClientSessionCookies cookies) {
        this.service = service;
        this.cookies = cookies;
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Map<String, Integer>> record(
            @PathVariable UUID project, @RequestBody JsonNode body, HttpServletRequest request) {
        return ResponseEntity.accepted()
                .cacheControl(CacheControl.noStore())
                .body(service.record(cookies.read(request), project, body));
    }
}

package com.ayaantrix.collector.ai.controller;

import com.ayaantrix.collector.ai.dto.AiDtos.Create;
import com.ayaantrix.collector.ai.service.AiService;
import com.ayaantrix.collector.clientaccess.security.ClientSessionCookies;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/client/projects/{p}")
public class AiController {
    private final AiService service;
    private final ClientSessionCookies cookies;

    public AiController(AiService service, ClientSessionCookies cookies) {
        this.service = service;
        this.cookies = cookies;
    }

    @PostMapping("/items/{i}/ai-drafts")
    public ResponseEntity<Map<String, Object>> create(
            @PathVariable UUID p,
            @PathVariable UUID i,
            @Valid @RequestBody Create input,
            @RequestHeader(value = "Idempotency-Key", required = false) String key,
            HttpServletRequest request) {
        return ResponseEntity.status(202)
                .cacheControl(CacheControl.noStore())
                .body(service.create(cookies.read(request), p, i, input, key));
    }

    @GetMapping("/ai-drafts/{id}")
    public ResponseEntity<Map<String, Object>> get(
            @PathVariable UUID p, @PathVariable UUID id, HttpServletRequest request) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.get(cookies.read(request), p, id));
    }
}

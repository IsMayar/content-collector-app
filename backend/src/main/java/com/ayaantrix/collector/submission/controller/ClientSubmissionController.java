package com.ayaantrix.collector.submission.controller;

import com.ayaantrix.collector.clientaccess.security.ClientSessionCookies;
import com.ayaantrix.collector.submission.dto.SubmissionDtos.*;
import com.ayaantrix.collector.submission.service.SubmissionService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/client/projects/{project}/items/{item}")
public class ClientSubmissionController {
    private final SubmissionService service;
    private final ClientSessionCookies cookies;

    public ClientSubmissionController(SubmissionService service, ClientSessionCookies cookies) {
        this.service = service;
        this.cookies = cookies;
    }

    @PostMapping(value = "/submit", consumes = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Submitted> submit(
            @PathVariable UUID project,
            @PathVariable UUID item,
            @Valid @RequestBody Submit input,
            @RequestHeader("Idempotency-Key") String key,
            HttpServletRequest request) {
        return ResponseEntity.status(201)
                .cacheControl(CacheControl.noStore())
                .body(service.submit(cookies.read(request), project, item, input, key));
    }

    @PostMapping(value = "/withdraw", consumes = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Withdrawn> withdraw(
            @PathVariable UUID project,
            @PathVariable UUID item,
            @Valid @RequestBody Withdraw input,
            @RequestHeader("Idempotency-Key") String key,
            HttpServletRequest request) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.withdraw(cookies.read(request), project, item, input, key));
    }
}

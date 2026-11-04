package com.ayaantrix.collector.visibility.controller;

import com.ayaantrix.collector.auth.service.AccountRequestLimiter;
import com.ayaantrix.collector.visibility.dto.VisibilityDtos.*;
import com.ayaantrix.collector.visibility.security.ShareFrameHeaders;
import com.ayaantrix.collector.visibility.service.*;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
public class StatusShareController {
    private final ShareService service;
    private final AccountRequestLimiter limits;

    public StatusShareController(ShareService service, AccountRequestLimiter limits) {
        this.service = service;
        this.limits = limits;
    }

    @PostMapping("/api/v1/workspaces/{workspace}/projects/{project}/status-shares")
    ResponseEntity<CreatedShare> create(
            @PathVariable UUID workspace,
            @PathVariable UUID project,
            @Valid @RequestBody CreateShare input,
            @RequestHeader("Idempotency-Key") String key) {
        return ResponseEntity.status(201)
                .cacheControl(CacheControl.noStore())
                .body(service.create(workspace, project, input, key));
    }

    @DeleteMapping("/api/v1/workspaces/{workspace}/projects/{project}/status-shares/{share}")
    ResponseEntity<Void> revoke(
            @PathVariable UUID workspace, @PathVariable UUID project, @PathVariable UUID share) {
        service.revoke(workspace, project, share);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @PostMapping("/api/v1/status-shares/exchange")
    ResponseEntity<ReadToken> exchange(
            @Valid @RequestBody Exchange input, HttpServletRequest request) {
        limits.check("STATUS_EXCHANGE", request.getRemoteAddr(), 30);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.exchange(input));
    }

    @GetMapping("/api/v1/status-shares/{share}/counts")
    ResponseEntity<Counts> counts(
            @PathVariable UUID share,
            @RequestHeader(value = "X-Status-Token", required = false) String token,
            HttpServletRequest request) {
        limits.check("STATUS_COUNTS", request.getRemoteAddr(), 120);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.counts(share, token));
    }

    @GetMapping(value = "/api/v1/status-shares/{share}/embed", produces = MediaType.TEXT_HTML_VALUE)
    ResponseEntity<String> embed(@PathVariable UUID share, HttpServletRequest request) {
        limits.check("STATUS_EMBED", request.getRemoteAddr(), 60);
        var origins = service.origins(share);
        request.setAttribute(ShareFrameHeaders.APPROVED_EMBED, true);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .contentType(MediaType.parseMediaType("text/html;charset=UTF-8"))
                .header("Content-Security-Policy", StatusEmbedPage.policy(origins))
                .header("Referrer-Policy", "no-referrer")
                .body(StatusEmbedPage.html(share));
    }
}

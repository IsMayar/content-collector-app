package com.ayaantrix.collector.attachment.controller;

import com.ayaantrix.collector.attachment.dto.AttachmentDtos.*;
import com.ayaantrix.collector.attachment.service.AttachmentService;
import com.ayaantrix.collector.clientaccess.security.ClientSessionCookies;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/client/projects/{project}")
public class ClientAttachmentController {
    private final AttachmentService service;
    private final ClientSessionCookies cookies;

    public ClientAttachmentController(AttachmentService service, ClientSessionCookies cookies) {
        this.service = service;
        this.cookies = cookies;
    }

    @PostMapping("/uploads")
    ResponseEntity<Reservation> reserve(
            @PathVariable UUID project,
            @Valid @RequestBody Reserve input,
            @RequestHeader("Idempotency-Key") String key,
            HttpServletRequest r) {
        return ResponseEntity.status(201)
                .cacheControl(CacheControl.noStore())
                .body(service.reserve(cookies.read(r), project, input, key));
    }

    @PostMapping("/uploads/{upload}/finalize")
    ResponseEntity<Map<String, Object>> finish(
            @PathVariable UUID project,
            @PathVariable UUID upload,
            @RequestHeader("Idempotency-Key") String key,
            HttpServletRequest r) {
        return ResponseEntity.accepted()
                .cacheControl(CacheControl.noStore())
                .body(service.finalizeUpload(cookies.read(r), project, upload, key));
    }

    @DeleteMapping("/uploads/{id}")
    ResponseEntity<Void> cancel(
            @PathVariable UUID project, @PathVariable UUID id, HttpServletRequest r) {
        service.remove(cookies.read(r), project, id, true);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @GetMapping("/assets/{id}")
    ResponseEntity<Map<String, Summary>> read(
            @PathVariable UUID project, @PathVariable UUID id, HttpServletRequest r) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(Map.of("asset", service.read(cookies.read(r), project, id)));
    }

    @DeleteMapping("/assets/{id}")
    ResponseEntity<Void> remove(
            @PathVariable UUID project, @PathVariable UUID id, HttpServletRequest r) {
        service.remove(cookies.read(r), project, id, false);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @PostMapping("/assets/{id}/download")
    ResponseEntity<Map<String, String>> download(
            @PathVariable UUID project,
            @PathVariable UUID id,
            @Valid @RequestBody Download input,
            HttpServletRequest r) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.clientDownload(cookies.read(r), project, id, input.variant()));
    }
}

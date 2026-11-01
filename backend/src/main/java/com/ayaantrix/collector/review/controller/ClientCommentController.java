package com.ayaantrix.collector.review.controller;

import com.ayaantrix.collector.clientaccess.security.ClientSessionCookies;
import com.ayaantrix.collector.review.dto.ReviewDtos.ClientComment;
import com.ayaantrix.collector.review.service.ReviewService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/client/projects/{project}/items/{item}/comments")
public class ClientCommentController {
    private final ReviewService service;
    private final ClientSessionCookies cookies;

    public ClientCommentController(ReviewService service, ClientSessionCookies cookies) {
        this.service = service;
        this.cookies = cookies;
    }

    @GetMapping
    ResponseEntity<Map<String, Object>> read(
            @PathVariable UUID project, @PathVariable UUID item, HttpServletRequest request) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.clientComments(cookies.read(request), project, item));
    }

    @PostMapping
    ResponseEntity<Map<String, Object>> add(
            @PathVariable UUID project,
            @PathVariable UUID item,
            @Valid @RequestBody ClientComment input,
            HttpServletRequest request) {
        return ResponseEntity.status(201)
                .cacheControl(CacheControl.noStore())
                .body(service.addClientComment(cookies.read(request), project, item, input));
    }
}

package com.ayaantrix.collector.reminder.controller;

import com.ayaantrix.collector.clientaccess.security.ClientSessionCookies;
import com.ayaantrix.collector.reminder.dto.ReminderDtos.*;
import com.ayaantrix.collector.reminder.service.ReminderService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping(value = "/api/v1", produces = MediaType.APPLICATION_JSON_VALUE)
public class ReminderController {
    private final ReminderService service;
    private final ClientSessionCookies cookies;

    public ReminderController(ReminderService service, ClientSessionCookies cookies) {
        this.service = service;
        this.cookies = cookies;
    }

    @GetMapping("/workspaces/{w}/projects/{p}/reminder-policy")
    Object policy(@PathVariable UUID w, @PathVariable UUID p) {
        return Map.of("policy", service.policy(w, p));
    }

    @PutMapping("/workspaces/{w}/projects/{p}/reminder-policy")
    Object update(@PathVariable UUID w, @PathVariable UUID p, @Valid @RequestBody Update input) {
        return Map.of("policy", service.update(w, p, input));
    }

    @PostMapping("/workspaces/{w}/projects/{p}/reminders/preview")
    Object preview(@PathVariable UUID w, @PathVariable UUID p, @Valid @RequestBody Send input) {
        return Map.of("preview", service.preview(w, p, input));
    }

    @PostMapping("/workspaces/{w}/projects/{p}/reminders/send")
    ResponseEntity<?> send(
            @PathVariable UUID w,
            @PathVariable UUID p,
            @Valid @RequestBody Send input,
            @RequestHeader("Idempotency-Key") String key) {
        return ResponseEntity.accepted().body(Map.of("jobId", service.send(w, p, input, key)));
    }

    @GetMapping("/workspaces/{w}/projects/{p}/deliveries")
    Object history(
            @PathVariable UUID w,
            @PathVariable UUID p,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.history(w, p, page, size);
    }

    @GetMapping("/client/projects/{p}/notification-preferences")
    Object preferences(@PathVariable UUID p, HttpServletRequest request) {
        return service.preferences(cookies.read(request), p);
    }

    @PutMapping("/client/projects/{p}/notification-preferences")
    Object preferences(
            @PathVariable UUID p,
            HttpServletRequest request,
            @Valid @RequestBody ChangePreferences input) {
        return Map.of("preferences", service.preferences(cookies.read(request), p, input));
    }
}

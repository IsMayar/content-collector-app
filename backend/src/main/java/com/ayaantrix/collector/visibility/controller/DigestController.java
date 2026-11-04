package com.ayaantrix.collector.visibility.controller;

import com.ayaantrix.collector.visibility.dto.VisibilityDtos.*;
import com.ayaantrix.collector.visibility.service.DigestService;

import jakarta.validation.Valid;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces/{workspace}")
public class DigestController {
    private final DigestService service;

    public DigestController(DigestService service) {
        this.service = service;
    }

    @GetMapping("/digest-preferences")
    ResponseEntity<Preference> preference(@PathVariable UUID workspace) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.preference(workspace));
    }

    @PutMapping("/digest-preferences")
    ResponseEntity<Preference> save(
            @PathVariable UUID workspace, @Valid @RequestBody SavePreference input) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.save(workspace, input));
    }

    @GetMapping("/digest-preview")
    ResponseEntity<DigestPreview> preview(@PathVariable UUID workspace) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.preview(workspace));
    }
}

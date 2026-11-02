package com.ayaantrix.collector.export.controller;

import com.ayaantrix.collector.export.dto.ExportDtos.Create;
import com.ayaantrix.collector.export.service.ExportService;

import jakarta.validation.Valid;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/workspaces/{w}/projects/{p}/exports")
public class ExportController {
    private final ExportService service;

    public ExportController(ExportService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> list(@PathVariable UUID w, @PathVariable UUID p) {
        return service.list(w, p);
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(
            @PathVariable UUID w,
            @PathVariable UUID p,
            @Valid @RequestBody Create input,
            @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        return ResponseEntity.status(202)
                .cacheControl(CacheControl.noStore())
                .body(service.create(w, p, input, key));
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(
            @PathVariable UUID w, @PathVariable UUID p, @PathVariable UUID id) {
        return service.get(w, p, id);
    }

    @PostMapping("/{id}/download")
    public Map<String, String> download(
            @PathVariable UUID w, @PathVariable UUID p, @PathVariable UUID id) {
        return service.download(w, p, id);
    }
}

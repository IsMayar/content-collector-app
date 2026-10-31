package com.ayaantrix.collector.attachment.controller;

import com.ayaantrix.collector.attachment.dto.AttachmentDtos.Download;
import com.ayaantrix.collector.attachment.service.AttachmentService;

import jakarta.validation.Valid;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
public class AgencyAttachmentController {
    private final AttachmentService service;

    public AgencyAttachmentController(AttachmentService service) {
        this.service = service;
    }

    @PostMapping("/api/v1/workspaces/{workspace}/projects/{project}/assets/{asset}/download")
    ResponseEntity<Map<String, String>> download(
            @PathVariable UUID workspace,
            @PathVariable UUID project,
            @PathVariable UUID asset,
            @Valid @RequestBody Download input) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.agencyDownload(workspace, project, asset, input.variant()));
    }
}

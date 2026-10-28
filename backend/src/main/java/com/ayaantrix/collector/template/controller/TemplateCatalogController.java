package com.ayaantrix.collector.template.controller;

import com.ayaantrix.collector.template.dto.TemplateCatalogDtos.*;
import com.ayaantrix.collector.template.entity.Template.ProjectType;
import com.ayaantrix.collector.template.service.TemplateCatalogService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController @RequestMapping(value="/api/v1/workspaces/{workspaceId}",produces=MediaType.APPLICATION_JSON_VALUE)
public class TemplateCatalogController {
    private final TemplateCatalogService service;
    TemplateCatalogController(TemplateCatalogService service) { this.service=service; }
    @GetMapping("/templates") ResponseEntity<Catalog> list(@PathVariable UUID workspaceId,
            @RequestParam(required=false) ProjectType projectType, @RequestParam(required=false) String industry) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(workspaceId,projectType,industry));
    }
    @GetMapping("/template-versions/{versionId}") ResponseEntity<Definition> read(@PathVariable UUID workspaceId, @PathVariable UUID versionId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.read(workspaceId,versionId));
    }
}

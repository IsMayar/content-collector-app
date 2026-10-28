package com.ayaantrix.collector.project.controller;
import com.ayaantrix.collector.project.dto.ProjectStructureDtos.*;
import com.ayaantrix.collector.project.service.ProjectStructureService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController @RequestMapping(value="/api/v1/workspaces/{workspaceId}/projects/{projectId}",produces=MediaType.APPLICATION_JSON_VALUE)
public class ProjectStructureController {
    private final ProjectStructureService service;
    ProjectStructureController(ProjectStructureService service){this.service=service;}
    @PostMapping(value="/sections",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<?> section(@PathVariable UUID workspaceId,@PathVariable UUID projectId,@Valid @RequestBody SectionCreate body){return response(201,"section",service.createSection(workspaceId,projectId,body));}
    @PatchMapping(value="/sections/{sectionId}",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<?> section(@PathVariable UUID workspaceId,@PathVariable UUID projectId,@PathVariable UUID sectionId,@Valid @RequestBody SectionPatch body){return response(200,"section",service.patchSection(workspaceId,projectId,sectionId,body));}
    @PostMapping(value="/sections/{sectionId}/items",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<?> item(@PathVariable UUID workspaceId,@PathVariable UUID projectId,@PathVariable UUID sectionId,@Valid @RequestBody ItemCreate body){return response(201,"item",service.createItem(workspaceId,projectId,sectionId,body));}
    @PatchMapping(value="/items/{itemId}/schema",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<?> item(@PathVariable UUID workspaceId,@PathVariable UUID projectId,@PathVariable UUID itemId,@Valid @RequestBody ItemPatch body){return response(200,"item",service.patchItem(workspaceId,projectId,itemId,body));}
    @PostMapping(value="/structure/reorder",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<?> reorder(@PathVariable UUID workspaceId,@PathVariable UUID projectId,@Valid @RequestBody Reorder body){return response(200,"structureVersion",service.reorder(workspaceId,projectId,body));}
    private ResponseEntity<?> response(int status,String key,Object value){return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(Map.of(key,value));}
}

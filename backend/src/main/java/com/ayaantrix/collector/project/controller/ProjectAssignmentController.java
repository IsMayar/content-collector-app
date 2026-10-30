package com.ayaantrix.collector.project.controller;
import com.ayaantrix.collector.project.service.ProjectAssignmentService;
import com.ayaantrix.collector.project.dto.ProjectAssignmentDtos.*;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import java.util.*;
@RestController @RequestMapping(value="/api/v1/workspaces/{workspaceId}/projects/{projectId}/assignments",produces=MediaType.APPLICATION_JSON_VALUE)
public class ProjectAssignmentController {
 private final ProjectAssignmentService service;
 ProjectAssignmentController(ProjectAssignmentService service){this.service=service;}
 @GetMapping ResponseEntity<Map<String,List<Assignment>>> list(@PathVariable UUID workspaceId,@PathVariable UUID projectId){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("data",service.list(workspaceId,projectId)));}
 @PutMapping(value="/{memberId}",consumes=MediaType.APPLICATION_JSON_VALUE) ResponseEntity<Map<String,Assignment>> put(@PathVariable UUID workspaceId,@PathVariable UUID projectId,@PathVariable UUID memberId,@Valid @RequestBody Change body){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("assignment",service.put(workspaceId,projectId,memberId,body)));}
 @DeleteMapping("/{memberId}") ResponseEntity<Void> revoke(@PathVariable UUID workspaceId,@PathVariable UUID projectId,@PathVariable UUID memberId){service.revoke(workspaceId,projectId,memberId);return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();}
}

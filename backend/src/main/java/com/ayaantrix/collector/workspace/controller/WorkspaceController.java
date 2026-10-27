package com.ayaantrix.collector.workspace.controller;
import com.ayaantrix.collector.workspace.dto.WorkspaceDtos;
import com.ayaantrix.collector.workspace.service.WorkspaceService;

import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController @RequestMapping(value="/api/v1/workspaces",produces=MediaType.APPLICATION_JSON_VALUE)
public class WorkspaceController {
    private final WorkspaceService service;
    WorkspaceController(WorkspaceService service){this.service=service;}
    @GetMapping ResponseEntity<Map<String,Object>> list(){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("data",service.list()));}
    @PostMapping(consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Map<String,Object>> create(@Valid @RequestBody WorkspaceDtos.Create request){
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(Map.of("workspace",service.create(request)));
    }
    @GetMapping("/{workspaceId}") ResponseEntity<WorkspaceDtos.Details> read(@PathVariable UUID workspaceId){
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.read(workspaceId));
    }
    @PatchMapping(value="/{workspaceId}",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Map<String,Object>> update(@PathVariable UUID workspaceId,@Valid @RequestBody WorkspaceDtos.Update request){
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("workspace",service.update(workspaceId,request)));
    }
}

package com.ayaantrix.collector.project.controller;
import com.ayaantrix.collector.project.dto.ProjectDtos.*;
import com.ayaantrix.collector.project.entity.ProjectState;
import com.ayaantrix.collector.project.service.ProjectService;
import com.ayaantrix.collector.template.entity.Template.ProjectType;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController @RequestMapping(value="/api/v1/workspaces/{workspaceId}",produces=MediaType.APPLICATION_JSON_VALUE)
public class ProjectController {
    private final ProjectService service;
    ProjectController(ProjectService service){this.service=service;}
    @PostMapping(value="/projects",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Map<String,View>> create(@PathVariable UUID workspaceId,@Valid @RequestBody Create body,@RequestHeader("Idempotency-Key") String key){
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(Map.of("project",service.create(workspaceId,body,key)));
    }
    @GetMapping("/projects") ResponseEntity<Paged<Summary>> list(@PathVariable UUID workspaceId,@RequestParam(defaultValue="") String search,
            @RequestParam(required=false) ProjectType projectType,@RequestParam(required=false) ProjectState state,@RequestParam(defaultValue="updatedAt") String sort,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="12") int size){
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(workspaceId,search,projectType,state,sort,page,size));
    }
    @GetMapping("/projects/{projectId}") ResponseEntity<Detail> read(@PathVariable UUID workspaceId,@PathVariable UUID projectId){
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.read(workspaceId,projectId));
    }
    @PostMapping(value="/clients",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Map<String,Customer>> customer(@PathVariable UUID workspaceId,@Valid @RequestBody CustomerCreate body){
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(Map.of("client",service.createCustomer(workspaceId,body)));
    }
    @GetMapping("/clients") ResponseEntity<Paged<Customer>> customers(@PathVariable UUID workspaceId,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="12") int size){
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.customers(workspaceId,page,size));
    }
}

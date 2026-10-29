package com.ayaantrix.collector.project.controller;
import com.ayaantrix.collector.project.dto.ProjectClientDtos.*;
import com.ayaantrix.collector.project.dto.ProjectDtos;
import com.ayaantrix.collector.project.service.ProjectClientService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController @RequestMapping(value="/api/v1/workspaces/{workspaceId}",produces=MediaType.APPLICATION_JSON_VALUE)
public class ProjectClientController {
    private final ProjectClientService service;
    ProjectClientController(ProjectClientService service){this.service=service;}
    @PatchMapping(value="/clients/{clientId}",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Map<String,ProjectDtos.Customer>> update(@PathVariable UUID workspaceId,@PathVariable UUID clientId,@Valid @RequestBody CustomerPatch body){
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("client",service.updateCustomer(workspaceId,clientId,body)));
    }
    @GetMapping("/projects/{projectId}/contacts") ResponseEntity<Map<String,List<Contact>>> contacts(@PathVariable UUID workspaceId,@PathVariable UUID projectId){
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("data",service.contacts(workspaceId,projectId)));
    }
    @PostMapping(value="/projects/{projectId}/contacts",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Map<String,Contact>> create(@PathVariable UUID workspaceId,@PathVariable UUID projectId,@Valid @RequestBody ContactCreate body){
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(Map.of("contact",service.createContact(workspaceId,projectId,body)));
    }
    @GetMapping("/projects/{projectId}/client-preview") ResponseEntity<Map<String,Preview>> preview(@PathVariable UUID workspaceId,@PathVariable UUID projectId){
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("preview",service.preview(workspaceId,projectId)));
    }
}

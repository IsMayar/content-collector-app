package com.ayaantrix.collector.template.controller;

import com.ayaantrix.collector.template.service.TemplateWriteService;
import com.ayaantrix.collector.template.dto.TemplateWriteDtos.*;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController @RequestMapping(value="/api/v1/workspaces/{workspace}/templates",produces=MediaType.APPLICATION_JSON_VALUE)
public class TemplateWriteController {
    private final TemplateWriteService service;
    public TemplateWriteController(TemplateWriteService service){this.service=service;}
    @PostMapping(consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<?> create(@PathVariable UUID workspace,@Valid @RequestBody Definition request){return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(service.create(workspace,request.definition()));}
    @GetMapping("/{id}/draft") ResponseEntity<?> read(@PathVariable UUID workspace,@PathVariable UUID id){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.read(workspace,id));}
    @PutMapping(value="/{id}/draft",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<?> save(@PathVariable UUID workspace,@PathVariable UUID id,@Valid @RequestBody Draft request){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.save(workspace,id,request.definition(),request.expectedVersion()));}
    @PostMapping(value="/{id}/versions",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<?> publish(@PathVariable UUID workspace,@PathVariable UUID id,@Valid @RequestBody Publish request){return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(service.publish(workspace,id,request.expectedVersion()));}
}

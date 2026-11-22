package com.ayaantrix.collector.template.service;

import com.ayaantrix.collector.project.security.ProjectAuthorization;
import com.ayaantrix.collector.template.repository.TemplateWriteRepository;
import com.ayaantrix.collector.template.validation.TemplateSchemaValidator;
import com.ayaantrix.collector.common.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import java.time.Clock;
import java.util.*;

@Service @Transactional
public class TemplateWriteService {
    private final ProjectAuthorization auth;
    private final TemplateWriteRepository repo;
    private final TemplateSchemaValidator validator;
    private final Clock clock;
    public TemplateWriteService(ProjectAuthorization auth,TemplateWriteRepository repo,TemplateSchemaValidator validator,Clock clock){this.auth=auth;this.repo=repo;this.validator=validator;this.clock=clock;}
    private void access(UUID w,boolean write){var a=auth.access(w,true);if(write)auth.writable(a);auth.entitlements().require(auth.entitlements().current(w).customTemplates(),"custom templates");}
    public Map<String,Object> read(UUID w,UUID id){access(w,false);var row=repo.locked(w,id);return Map.of("version",row.get("version"),"definition",validator.validate((String)row.get("definition")));}
    public Map<String,Object> create(UUID w,JsonNode definition){
        access(w,true);var value=validator.validate(definition);UUID id=UUID.randomUUID();
        repo.create(w,id,value.path("projectType").asText(),value.path("title").asText(),value.path("industry").asText(),value.toString(),clock.instant());
        UUID published=repo.publish(w,id,value.toString(),value.path("title").asText(),clock.instant());
        return Map.of("id",id,"version",1,"versionId",published);
    }
    private void expected(Map<String,Object> row,Long expected){if(expected==null || ((Number)row.get("version")).longValue()!=expected)throw new ApiException(HttpStatus.CONFLICT,"VERSION_CONFLICT","This template changed. Reload before saving.");}
    public Map<String,Object> save(UUID w,UUID id,JsonNode definition,Long version){
        access(w,true);var row=repo.locked(w,id);expected(row,version);var value=validator.validate(definition);
        var original=validator.validate((String)row.get("definition"));
        if(!original.path("projectType").equals(value.path("projectType")))throw new ApiException(HttpStatus.BAD_REQUEST,"TEMPLATE_TYPE","A template's project type cannot change.");
        repo.draft(w,id,value.toString(),clock.instant());return Map.of("version",version+1);
    }
    public Map<String,Object> publish(UUID w,UUID id,Long version){
        access(w,true);var row=repo.locked(w,id);expected(row,version);var value=validator.validate((String)row.get("definition"));
        UUID published=repo.publish(w,id,value.toString(),value.path("title").asText(),clock.instant());return Map.of("version",version+1,"versionId",published);
    }
}

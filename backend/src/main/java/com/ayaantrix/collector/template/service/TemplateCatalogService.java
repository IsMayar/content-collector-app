package com.ayaantrix.collector.template.service;

import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.template.dto.TemplateCatalogDtos.*;
import com.ayaantrix.collector.template.entity.Template.ProjectType;
import com.ayaantrix.collector.template.repository.TemplateCatalogRepository;
import com.ayaantrix.collector.template.validation.TemplateSchemaValidator;
import com.ayaantrix.collector.workspace.security.WorkspaceAuthorization;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

@Service @Transactional
public class TemplateCatalogService {
    private final WorkspaceAuthorization authorization;
    private final TemplateCatalogRepository repository;
    private final TemplateSchemaValidator validator;
    TemplateCatalogService(WorkspaceAuthorization authorization, TemplateCatalogRepository repository, TemplateSchemaValidator validator) {
        this.authorization=authorization; this.repository=repository; this.validator=validator;
    }
    public Catalog list(UUID workspace, ProjectType type, String industry) {
        authorization.require(workspace, authorization.actor(), false);
        if (industry != null && (industry.isBlank() || industry.length()>80))
            throw new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_FAILED","Invalid industry filter.");
        return new Catalog(repository.catalog(workspace,type,industry).stream().map(v -> {
            var t=v.template(); return new Summary(t.id(),t.title(),t.projectType(),t.industry(),t.builtin(),v.versionNo(),v.id());
        }).toList());
    }
    public Definition read(UUID workspace, UUID version) {
        authorization.require(workspace, authorization.actor(), false);
        var record=repository.definition(workspace,version).orElseThrow(() ->
            new ApiException(HttpStatus.NOT_FOUND,"NOT_FOUND","The requested template version is unavailable."));
        // Parse a fresh independent tree for every consumer. Stored JSON and managed entities remain immutable.
        return new Definition(validator.validate(record.definition()));
    }
}

package com.ayaantrix.collector.template.dto;

import com.ayaantrix.collector.template.entity.Template.ProjectType;
import tools.jackson.databind.JsonNode;
import java.util.*;

public final class TemplateCatalogDtos {
    private TemplateCatalogDtos() {}
    public record Summary(UUID id, String title, ProjectType projectType, String industry,
                          boolean isBuiltin, int version, UUID versionId) {}
    public record Catalog(List<Summary> data) { public Catalog { data=List.copyOf(data); } }
    public record Definition(JsonNode definition) {}
}

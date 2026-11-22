package com.ayaantrix.collector.template.dto;

import jakarta.validation.constraints.*;
import tools.jackson.databind.JsonNode;

public final class TemplateWriteDtos {
    private TemplateWriteDtos(){}
    public record Definition(@NotNull JsonNode definition){}
    public record Draft(@NotNull JsonNode definition,@NotNull @PositiveOrZero Long expectedVersion){}
    public record Publish(@NotNull @PositiveOrZero Long expectedVersion){}
}

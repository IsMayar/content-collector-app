package com.ayaantrix.collector.project.dto;
import jakarta.validation.constraints.*;
import tools.jackson.databind.JsonNode;
import java.util.*;
public final class ProjectStructureDtos {
    private ProjectStructureDtos() {}
    public record SectionCreate(@Size(max=160) String key,@NotBlank @Size(max=200) String title,
        @NotNull @PositiveOrZero Long expectedStructureVersion) {}
    public record SectionPatch(@Size(min=1,max=200) String title,Boolean enabled,
        @NotNull @PositiveOrZero Long expectedStructureVersion) {}
    public record ItemCreate(@NotNull JsonNode definition,@NotNull @PositiveOrZero Long expectedStructureVersion) {}
    public record ItemPatch(@NotNull JsonNode definition,@NotNull @PositiveOrZero Long expectedStructureVersion,boolean reopenAffected,@Size(max=5000) String reason) {public ItemPatch(JsonNode definition,Long expectedStructureVersion,boolean reopenAffected){this(definition,expectedStructureVersion,reopenAffected,null);}}
    public record Reorder(@NotNull @Size(max=30) List<@NotNull UUID> sectionIds,
        @NotNull @Size(max=30) Map<UUID,List<@NotNull UUID>> itemOrderBySection,
        @NotNull @PositiveOrZero Long expectedStructureVersion) {}
}

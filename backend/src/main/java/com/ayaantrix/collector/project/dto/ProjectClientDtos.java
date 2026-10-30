package com.ayaantrix.collector.project.dto;
import jakarta.validation.constraints.*;
import tools.jackson.databind.JsonNode;
import java.time.*;
import java.util.*;
import com.ayaantrix.collector.project.entity.ProjectState;
import com.ayaantrix.collector.template.entity.Template.ProjectType;
public final class ProjectClientDtos {
    private ProjectClientDtos() {}
    public record CustomerPatch(@Size(min=1,max=200) String businessName,@NotNull @Min(0) Long expectedVersion) {}
    public record ContactCreate(@NotNull UUID clientId,@NotBlank @Size(max=150) String name,
        @NotBlank @Email @Size(max=254) String email,@NotNull Instant accessExpiresAt) {}
    public record Contact(UUID id,String name,String email,String state,String timezone,Instant accessExpiresAt,boolean emailRemindersEnabled,Instant accessInitializedAt) {}
    public record PreviewProject(UUID id,String title,ProjectType projectType,ProjectState state,LocalDate dueDate,long structureVersion,String agencyDisplayName,boolean aiEnabled) {}
    public record Preview(PreviewProject project,List<JsonNode> sections,ProjectDtos.Progress progress) {}
}

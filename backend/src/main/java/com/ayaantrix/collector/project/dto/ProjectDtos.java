package com.ayaantrix.collector.project.dto;

import com.ayaantrix.collector.project.entity.ProjectState;
import com.ayaantrix.collector.template.entity.Template.ProjectType;
import jakarta.validation.constraints.*;
import tools.jackson.databind.JsonNode;
import java.time.*;
import java.util.*;

public final class ProjectDtos {
        private ProjectDtos() {
        }

        public record Create(@NotNull UUID clientId, @NotBlank @Size(max = 200) String title,
                        @NotNull ProjectType projectType,
                        @NotNull LocalDate dueDate, @NotBlank @Size(max = 80) String timezone,
                        @NotNull UUID templateVersionId) {
        }

        public record CustomerCreate(@NotBlank @Size(max = 200) String businessName,
                        @Size(max = 150) String contactName,
                        @Email @Size(max = 254) String email) {
        }

        public record Customer(UUID id, String businessName, String contactName, String email, long version) {
        }

        public record Progress(long requiredTotal, long submittedRequired, long approvedRequired,
                        long clientActionRequired,
                        long optionalApproved) {
        }

        public record Permissions(boolean canEditStructure, boolean canReview, boolean canExport,
                        boolean canManageAccess) {
        }

        public record Summary(UUID id, UUID workspaceId, String title, String clientBusinessName,
                        ProjectType projectType,
                        ProjectState state,
                        LocalDate dueDate, String timezone, Progress progress, Instant updatedAt) {
        }

        public record View(UUID id, UUID workspaceId, String title, String clientBusinessName, ProjectType projectType,
                        ProjectState state,
                        LocalDate dueDate, String timezone, Progress progress, Instant updatedAt, UUID clientId,
                        long version,
                        long structureVersion, boolean aiEnabled, Permissions permissions) {
        }

        public record Detail(View project, Progress progress, List<JsonNode> structure) {
        }

        public record Page(int page, int size, long totalElements) {
        }

        public record Paged<T>(List<T> data, Page page) {
        }
}

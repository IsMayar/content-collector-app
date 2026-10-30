package com.ayaantrix.collector.project.dto;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;
public final class ProjectAssignmentDtos {
 private ProjectAssignmentDtos(){}
 public record Change(@NotNull Boolean canReview,@NotNull Boolean canExport){}
 public record Assignment(UUID memberId,boolean canReview,boolean canExport){}
}

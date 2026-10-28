package com.ayaantrix.collector.project.repository;
import com.ayaantrix.collector.project.entity.ProjectSnapshot;
import org.springframework.data.repository.Repository;
import java.util.*;
public interface ProjectSnapshotRepository extends Repository<ProjectSnapshot,UUID> {
    ProjectSnapshot saveAndFlush(ProjectSnapshot snapshot);
    Optional<ProjectSnapshot> findByWorkspaceIdAndProjectId(UUID workspaceId,UUID projectId);
}

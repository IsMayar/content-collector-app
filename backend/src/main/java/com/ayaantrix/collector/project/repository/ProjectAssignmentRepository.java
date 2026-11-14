package com.ayaantrix.collector.project.repository;

import com.ayaantrix.collector.project.entity.ProjectAssignment;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.*;
import java.util.*;

public interface ProjectAssignmentRepository extends Repository<ProjectAssignment, UUID> {
    ProjectAssignment saveAndFlush(ProjectAssignment assignment);

    Optional<ProjectAssignment> findByWorkspaceIdAndProjectIdAndWorkspaceMemberId(UUID workspaceId, UUID projectId,
            UUID workspaceMemberId);

    List<ProjectAssignment> findByWorkspaceIdAndProjectId(UUID workspaceId, UUID projectId);

    @Modifying
    @Query("delete from ProjectAssignment a where a.workspaceId=:workspace and a.projectId=:project and a.workspaceMemberId=:member")
    int revoke(UUID workspace, UUID project, UUID member);

    @Modifying
    @Query("delete from ProjectAssignment a where a.workspaceId=:workspace and a.workspaceMemberId=:member")
    int revokeMembership(UUID workspace, UUID member);
}

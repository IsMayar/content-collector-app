package com.ayaantrix.collector.workspace;

import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.*;

// Package-private, deliberately no global findAll/findById or arbitrary save API for controllers.
interface WorkspaceRepository extends Repository<Workspace,UUID> {
    Workspace saveAndFlush(Workspace workspace);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from Workspace w where w.id=:workspace and exists (select m.id from WorkspaceMember m where m.workspaceId=w.id and m.userId=:user and m.state=com.ayaantrix.collector.workspace.WorkspaceMember.State.ACTIVE)")
    Optional<Workspace> lockAccessible(@Param("workspace") UUID workspace,@Param("user") UUID user);
    @Query("select new com.ayaantrix.collector.workspace.WorkspaceDtos$Membership(m.id,w.id,w.name,m.role) from Workspace w, WorkspaceMember m where m.workspaceId=w.id and m.userId=:user and m.state=com.ayaantrix.collector.workspace.WorkspaceMember.State.ACTIVE order by w.createdAt,w.id")
    List<WorkspaceDtos.Membership> memberships(@Param("user") UUID user);
}

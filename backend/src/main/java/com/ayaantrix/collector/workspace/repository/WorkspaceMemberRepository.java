package com.ayaantrix.collector.workspace.repository;
import com.ayaantrix.collector.workspace.entity.WorkspaceMember;
import com.ayaantrix.collector.workspace.entity.WorkspaceRole;

import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.*;

public interface WorkspaceMemberRepository extends Repository<WorkspaceMember,UUID> {
    WorkspaceMember saveAndFlush(WorkspaceMember member);
    boolean existsByUserIdAndRoleAndState(UUID userId,WorkspaceRole role,WorkspaceMember.State state);
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select m from WorkspaceMember m where m.workspaceId=:workspace and m.userId=:user")
    Optional<WorkspaceMember> lockMembership(@Param("workspace") UUID workspace,@Param("user") UUID user);
}

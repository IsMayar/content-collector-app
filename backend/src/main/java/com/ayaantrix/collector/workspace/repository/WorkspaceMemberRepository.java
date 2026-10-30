package com.ayaantrix.collector.workspace.repository;
import com.ayaantrix.collector.workspace.entity.WorkspaceMember;
import com.ayaantrix.collector.workspace.entity.WorkspaceRole;

import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.*;

public interface WorkspaceMemberRepository extends Repository<WorkspaceMember,UUID> {
    List<WorkspaceMember> findByWorkspaceIdOrderByCreatedAtAscIdAsc(UUID workspaceId);
    Optional<WorkspaceMember> findByWorkspaceIdAndId(UUID workspaceId,UUID id);
    Optional<WorkspaceMember> findByWorkspaceIdAndUserId(UUID workspaceId,UUID userId);
    long countByWorkspaceIdAndState(UUID workspaceId,WorkspaceMember.State state);
    @Query("select m from WorkspaceMember m where m.workspaceId=:workspace and m.id=:target and exists(select a.id from WorkspaceMember a where a.workspaceId=:workspace and a.userId=:actor and a.state=com.ayaantrix.collector.workspace.entity.WorkspaceMember.State.ACTIVE)")
    Optional<WorkspaceMember> ownershipTarget(UUID workspace,UUID target,UUID actor);
    @Query("select m from WorkspaceMember m, UserAccount u where m.workspaceId=:workspace and m.id=:member and m.userId=u.id and m.state=com.ayaantrix.collector.workspace.entity.WorkspaceMember.State.ACTIVE and m.role=com.ayaantrix.collector.workspace.entity.WorkspaceRole.MEMBER and u.state=com.ayaantrix.collector.auth.entity.AccountState.ACTIVE and u.verifiedAt is not null")
    Optional<WorkspaceMember> eligibleAssignee(UUID workspace,UUID member);
    WorkspaceMember saveAndFlush(WorkspaceMember member);
    boolean existsByUserIdAndRoleAndState(UUID userId,WorkspaceRole role,WorkspaceMember.State state);
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select m from WorkspaceMember m where m.workspaceId=:workspace and m.userId=:user")
    Optional<WorkspaceMember> lockMembership(@Param("workspace") UUID workspace,@Param("user") UUID user);
}

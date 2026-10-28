package com.ayaantrix.collector.workspace.repository;
import com.ayaantrix.collector.workspace.entity.WorkspaceSubscription;
import org.springframework.data.repository.Repository;
import java.util.*;
public interface WorkspaceSubscriptionRepository extends Repository<WorkspaceSubscription,UUID> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_READ)
    @org.springframework.data.jpa.repository.Query("select s from WorkspaceSubscription s where s.workspaceId=:workspace")
    Optional<WorkspaceSubscription> lockedForWorkspace(UUID workspace);
    WorkspaceSubscription saveAndFlush(WorkspaceSubscription subscription);
    Optional<WorkspaceSubscription> findByWorkspaceId(UUID workspaceId);
}

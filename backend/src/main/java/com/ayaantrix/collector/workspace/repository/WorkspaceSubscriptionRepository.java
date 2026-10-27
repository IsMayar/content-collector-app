package com.ayaantrix.collector.workspace.repository;
import com.ayaantrix.collector.workspace.entity.WorkspaceSubscription;
import org.springframework.data.repository.Repository;
import java.util.*;
public interface WorkspaceSubscriptionRepository extends Repository<WorkspaceSubscription,UUID> {
    WorkspaceSubscription saveAndFlush(WorkspaceSubscription subscription);
    Optional<WorkspaceSubscription> findByWorkspaceId(UUID workspaceId);
}

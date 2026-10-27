package com.ayaantrix.collector.workspace;
import org.springframework.data.repository.Repository;
import java.util.*;
interface WorkspaceSubscriptionRepository extends Repository<WorkspaceSubscription,UUID> {
    WorkspaceSubscription saveAndFlush(WorkspaceSubscription subscription);
    Optional<WorkspaceSubscription> findByWorkspaceId(UUID workspaceId);
}

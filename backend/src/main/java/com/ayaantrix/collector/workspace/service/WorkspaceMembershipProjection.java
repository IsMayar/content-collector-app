package com.ayaantrix.collector.workspace.service;
import com.ayaantrix.collector.workspace.repository.WorkspaceRepository;

import com.ayaantrix.collector.auth.dto.SessionResponses;
import com.ayaantrix.collector.auth.service.AccountMemberships;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

/** One scoped join, no role claims/cache or entity serialization. */
@Service @Transactional(readOnly=true)
class WorkspaceMembershipProjection implements AccountMemberships {
    private final WorkspaceRepository workspaces;
    WorkspaceMembershipProjection(WorkspaceRepository workspaces){this.workspaces=workspaces;}
    public List<SessionResponses.Membership> forAuthenticatedUser(UUID userId){
        return workspaces.memberships(userId).stream().map(m->new SessionResponses.Membership(
            m.memberId(),m.workspaceId(),m.workspaceName(),m.role().name())).toList();
    }
}

package com.ayaantrix.collector.workspace.repository;
import com.ayaantrix.collector.workspace.entity.WorkspaceInvitation;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.*;
import java.time.Instant;
import java.util.*;
public interface WorkspaceInvitationRepository extends Repository<WorkspaceInvitation,UUID> {
 WorkspaceInvitation saveAndFlush(WorkspaceInvitation invite);
 Optional<WorkspaceInvitation> findByWorkspaceIdAndId(UUID workspaceId,UUID id);
 List<WorkspaceInvitation> findByWorkspaceIdOrderByCreatedAtDescIdDesc(UUID workspaceId);
 @Query("select count(i) from WorkspaceInvitation i, AccountToken t where i.id=t.id and i.workspaceId=:workspace and i.state='PENDING' and t.expiresAt>:now and t.consumedAt is null and t.revokedAt is null")
 long reserved(UUID workspace,Instant now);
 boolean existsByWorkspaceIdAndEmailAndState(UUID workspaceId,String email,String state);
 @Modifying @Query("update WorkspaceInvitation i set i.state='EXPIRED',i.updatedAt=:now where i.workspaceId=:workspace and i.state='PENDING' and i.id in (select t.id from AccountToken t where t.expiresAt<=:now)")
 int expire(UUID workspace,Instant now);
 @Query(value="""
 select exists(select 1 from collector.workspace_invitations i join collector.workspaces w on w.id=i.workspace_id
 join collector.workspace_members m on m.workspace_id=w.id and m.user_id=i.invited_by_user_id
 join collector.users u on u.id=m.user_id where i.workspace_id=:workspace and i.id=:id and i.state='PENDING'
 and w.state='ACTIVE' and m.state='ACTIVE' and m.role='OWNER' and u.state='ACTIVE' and u.verified_at is not null)
 """,nativeQuery=true)
 boolean deliveryAuthorized(UUID workspace,UUID id);
}

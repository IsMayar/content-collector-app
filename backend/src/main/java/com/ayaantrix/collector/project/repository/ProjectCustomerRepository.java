package com.ayaantrix.collector.project.repository;
import com.ayaantrix.collector.project.entity.ProjectCustomer;
import org.springframework.data.repository.Repository;
import org.springframework.data.domain.*;
import java.util.*;
public interface ProjectCustomerRepository extends Repository<ProjectCustomer,UUID> {
    @org.springframework.data.jpa.repository.Query("select c from ProjectCustomer c where c.workspaceId=:workspace and (:member is null or exists(select p.id from Project p,ProjectAssignment a where p.workspaceId=:workspace and p.clientId=c.id and a.workspaceId=:workspace and a.projectId=p.id and a.workspaceMemberId=:member))")
    Page<ProjectCustomer> visibleCustomers(UUID workspace,UUID member,Pageable page);
    ProjectCustomer saveAndFlush(ProjectCustomer customer);
    Optional<ProjectCustomer> findByWorkspaceIdAndId(UUID workspaceId,UUID id);
    Page<ProjectCustomer> findByWorkspaceId(UUID workspaceId,Pageable page);
    List<ProjectCustomer> findByWorkspaceIdAndIdIn(UUID workspaceId,Collection<UUID> ids);
}

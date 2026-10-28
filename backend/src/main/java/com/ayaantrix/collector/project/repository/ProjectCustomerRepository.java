package com.ayaantrix.collector.project.repository;
import com.ayaantrix.collector.project.entity.ProjectCustomer;
import org.springframework.data.repository.Repository;
import org.springframework.data.domain.*;
import java.util.*;
public interface ProjectCustomerRepository extends Repository<ProjectCustomer,UUID> {
    ProjectCustomer saveAndFlush(ProjectCustomer customer);
    Optional<ProjectCustomer> findByWorkspaceIdAndId(UUID workspaceId,UUID id);
    Page<ProjectCustomer> findByWorkspaceId(UUID workspaceId,Pageable page);
    List<ProjectCustomer> findByWorkspaceIdAndIdIn(UUID workspaceId,Collection<UUID> ids);
}

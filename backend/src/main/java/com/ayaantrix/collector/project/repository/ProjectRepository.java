package com.ayaantrix.collector.project.repository;
import com.ayaantrix.collector.project.entity.*;
import com.ayaantrix.collector.template.entity.Template.ProjectType;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.domain.*;
import java.util.*;
public interface ProjectRepository extends Repository<Project,UUID> {
    Project saveAndFlush(Project project);
    Optional<Project> findByWorkspaceIdAndId(UUID workspaceId,UUID id);
    @Query("""
        select p from Project p where p.workspaceId=:workspace
        and (:type is null or p.projectType=:type) and (:state is null or p.state=:state)
        and (lower(p.title) like :search escape '!' or exists
            (select c.id from ProjectCustomer c where c.workspaceId=:workspace and c.id=p.clientId and lower(c.businessName) like :search escape '!'))
        """)
    Page<Project> list(UUID workspace,ProjectType type,ProjectState state,String search,Pageable page);
}

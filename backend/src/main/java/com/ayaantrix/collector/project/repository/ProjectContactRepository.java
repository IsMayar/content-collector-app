package com.ayaantrix.collector.project.repository;
import com.ayaantrix.collector.project.entity.ProjectContact;
import org.springframework.data.repository.Repository;
import java.util.*;
public interface ProjectContactRepository extends Repository<ProjectContact,UUID> {
    ProjectContact saveAndFlush(ProjectContact contact);
    List<ProjectContact> findByWorkspaceIdAndProjectIdOrderByNameAscIdAsc(UUID workspace,UUID project);
    boolean existsByWorkspaceIdAndProjectIdAndEmail(UUID workspace,UUID project,String email);
}

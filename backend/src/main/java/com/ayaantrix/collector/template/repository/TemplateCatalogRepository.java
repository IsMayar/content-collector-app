package com.ayaantrix.collector.template.repository;

import com.ayaantrix.collector.template.entity.TemplateVersion;
import com.ayaantrix.collector.template.entity.Template.ProjectType;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.Query;
import java.util.*;

/** All consumer reads carry workspace scope; no global findById or persistence commands. */
public interface TemplateCatalogRepository extends Repository<TemplateVersion, UUID> {
    @Query("""
        select v from TemplateVersion v join fetch v.template t
        where (t.builtin=true or t.workspaceId=:workspace)
          and (:type is null or t.projectType=:type) and (:industry is null or t.industry=:industry)
          and v.versionNo=(select max(other.versionNo) from TemplateVersion other where other.template=t)
        order by t.key
        """)
    List<TemplateVersion> catalog(UUID workspace, ProjectType type, String industry);
    @Query("""
        select v from TemplateVersion v join fetch v.template t
        where v.id=:version and (t.builtin=true or t.workspaceId=:workspace)
        """)
    Optional<TemplateVersion> definition(UUID workspace, UUID version);
}

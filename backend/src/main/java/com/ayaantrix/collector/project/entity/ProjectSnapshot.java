package com.ayaantrix.collector.project.entity;
import jakarta.persistence.*;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.util.UUID;
@Entity @Immutable @Table(name="project_snapshots",schema="collector")
public class ProjectSnapshot {
    @Id private UUID id;
    @Column(name="workspace_id",nullable=false) private UUID workspaceId;
    @Column(name="project_id",nullable=false) private UUID projectId;
    @Column(name="source_template_version_id",nullable=false) private UUID sourceTemplateVersionId;
    @Column(name="structure_version",nullable=false) private long structureVersion;
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false,columnDefinition="jsonb") private String definition;
    @Column(name="created_at",nullable=false) private Instant createdAt;
    protected ProjectSnapshot() {}
    public ProjectSnapshot(Project project,String definition,Instant now){
        id=UUID.randomUUID();workspaceId=project.workspaceId();projectId=project.id();sourceTemplateVersionId=project.sourceTemplateVersionId();structureVersion=1;this.definition=definition;createdAt=now;
    }
    public UUID id(){return id;} public String definition(){return definition;}
}

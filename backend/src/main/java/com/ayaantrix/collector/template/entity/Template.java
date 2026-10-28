package com.ayaantrix.collector.template.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.util.UUID;

@Entity @Immutable @Table(name="templates", schema="collector")
public class Template {
    public enum ProjectType { WEBSITE, WEB_APP, MOBILE_APP }
    @Id private UUID id;
    @Column(name="workspace_id") private UUID workspaceId;
    @Column(name="template_key", nullable=false, length=160) private String key;
    @Enumerated(EnumType.STRING) @Column(name="project_type", nullable=false, columnDefinition="text") private ProjectType projectType;
    @Column(length=80) private String industry;
    @Column(nullable=false, length=160) private String title;
    @Column(name="is_builtin", nullable=false) private boolean builtin;
    @Column(nullable=false) private long version;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name="draft_definition", columnDefinition="jsonb") private String draftDefinition;
    @Column(name="created_at", nullable=false) private Instant createdAt;
    @Column(name="updated_at", nullable=false) private Instant updatedAt;
    protected Template() {}
    public UUID id() { return id; }
    public String title() { return title; }
    public ProjectType projectType() { return projectType; }
    public String industry() { return industry; }
    public boolean builtin() { return builtin; }
}

package com.ayaantrix.collector.template.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.util.UUID;

@Entity @Immutable @Table(name="template_versions", schema="collector")
public class TemplateVersion {
    @Id private UUID id;
    @ManyToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="template_id", nullable=false) private Template template;
    @Column(name="version_no", nullable=false) private int versionNo;
    @Column(name="schema_version", nullable=false) private int schemaVersion;
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false, columnDefinition="jsonb") private String definition;
    @Column(name="published_at", nullable=false) private Instant publishedAt;
    @Column(name="created_at", nullable=false) private Instant createdAt;
    @Column(name="updated_at", nullable=false) private Instant updatedAt;
    protected TemplateVersion() {}
    public UUID id() { return id; }
    public Template template() { return template; }
    public int versionNo() { return versionNo; }
    public String definition() { return definition; }
}

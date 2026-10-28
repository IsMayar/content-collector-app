package com.ayaantrix.collector.project.entity;
import com.ayaantrix.collector.template.entity.Template.ProjectType;
import jakarta.persistence.*;
import java.time.*;
import java.util.UUID;
@Entity @Table(name="projects",schema="collector")
public class Project {
    @Id private UUID id;
    @Column(name="workspace_id",nullable=false,updatable=false) private UUID workspaceId;
    @Column(name="client_id",nullable=false,updatable=false) private UUID clientId;
    @Column(name="source_template_version_id",nullable=false,updatable=false) private UUID sourceTemplateVersionId;
    @Column(name="created_by_user_id",nullable=false,updatable=false) private UUID createdBy;
    @Column(nullable=false,length=200) private String title;
    @Enumerated(EnumType.STRING) @Column(name="project_type",nullable=false,columnDefinition="text") private ProjectType projectType;
    @Enumerated(EnumType.STRING) @Column(nullable=false,columnDefinition="text") private ProjectState state;
    @Column(name="due_date",nullable=false) private LocalDate dueDate;
    @Column(nullable=false,length=80) private String timezone;
    @Column(name="structure_version",nullable=false) private long structureVersion;
    @Version private Long version;
    @Column(name="ai_enabled",nullable=false) private boolean aiEnabled;
    @Column(name="created_at",nullable=false,updatable=false) private Instant createdAt;
    @Column(name="updated_at",nullable=false) private Instant updatedAt;
    protected Project() {}
    public Project(UUID workspace,UUID client,UUID source,UUID actor,String title,ProjectType type,LocalDate dueDate,String timezone,Instant now) {
        id=UUID.randomUUID();workspaceId=workspace;clientId=client;sourceTemplateVersionId=source;createdBy=actor;
        this.title=title;projectType=type;this.dueDate=dueDate;this.timezone=timezone;state=ProjectState.DRAFT;structureVersion=1;createdAt=now;updatedAt=now;
    }
    // The existing frontend project/item contracts are one-based. Keep nullable newness detection until persist.
    @PrePersist void initialVersion(){if(version==null)version=1L;}
    public void structureChanged(Instant now){structureVersion++;updatedAt=now;}
    public boolean structureEditable(){return state==ProjectState.DRAFT || state==ProjectState.ACTIVE || state==ProjectState.PAUSED;}
    public UUID id(){return id;} public UUID workspaceId(){return workspaceId;} public UUID clientId(){return clientId;}
    public UUID sourceTemplateVersionId(){return sourceTemplateVersionId;}
    public String title(){return title;} public ProjectType projectType(){return projectType;} public ProjectState state(){return state;}
    public LocalDate dueDate(){return dueDate;} public String timezone(){return timezone;} public long structureVersion(){return structureVersion;}
    public Long version(){return version;} public boolean aiEnabled(){return aiEnabled;} public Instant updatedAt(){return updatedAt;}
}

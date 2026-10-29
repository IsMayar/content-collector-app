package com.ayaantrix.collector.project.entity;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
@Entity @Table(name="clients",schema="collector")
public class ProjectCustomer {
    @Id private UUID id;
    @Column(name="workspace_id",nullable=false,updatable=false) private UUID workspaceId;
    @Column(name="business_name",nullable=false,length=200) private String businessName;
    @Column(name="contact_name",length=150) private String contactName;
    @Column(name="email_normalized",columnDefinition="text") private String email;
    @Version private Long version;
    @Column(name="created_at",nullable=false,updatable=false) private Instant createdAt;
    @Column(name="updated_at",nullable=false) private Instant updatedAt;
    protected ProjectCustomer() {}
    public ProjectCustomer(UUID workspace,String business,String contact,String email,Instant now) {
        id=UUID.randomUUID();workspaceId=workspace;businessName=business;contactName=contact;this.email=email;createdAt=now;updatedAt=now;
    }
    public void rename(String name,Instant now){businessName=name;updatedAt=now;}
    public UUID id(){return id;} public String businessName(){return businessName;}
    public String contactName(){return contactName;} public String email(){return email;} public Long version(){return version;}
}

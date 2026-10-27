package com.ayaantrix.collector.workspace;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="workspaces",schema="collector")
public class Workspace {
    public enum State { ACTIVE, READ_ONLY, SUSPENDED, DELETION_PENDING }
    @Id @Column(nullable=false,updatable=false) private UUID id;
    @Column(nullable=false,length=150) private String name;
    @Column(nullable=false,length=80) private String timezone;
    @Column(name="logo_asset_key",columnDefinition="text") private String logoAssetKey;
    @Enumerated(EnumType.STRING) @Column(nullable=false,columnDefinition="text") private State state;
    @Column(name="storage_limit_bytes",nullable=false) private long storageLimitBytes;
    @Column(name="storage_used_bytes",nullable=false) private long storageUsedBytes;
    @Column(name="storage_reserved_bytes",nullable=false) private long storageReservedBytes;
    @Version @Column(nullable=false) private Long version;
    @Column(name="created_at",nullable=false,updatable=false) private Instant createdAt;
    @Column(name="updated_at",nullable=false) private Instant updatedAt;
    protected Workspace(){}
    Workspace(String name,String timezone,Instant now){
        id=UUID.randomUUID();this.name=name;this.timezone=timezone;state=State.ACTIVE;
        storageLimitBytes=PlanKey.STORAGE_BYTES;createdAt=now;updatedAt=now;
    }
    void update(String name,String timezone,Instant now){
        if(now.isBefore(updatedAt))throw new IllegalStateException("Invalid workspace update time.");
        if(name!=null)this.name=name;if(timezone!=null)this.timezone=timezone;updatedAt=now;
    }
    UUID id(){return id;} String name(){return name;} String timezone(){return timezone;}
    State state(){return state;} long version(){return version;} long storageLimit(){return storageLimitBytes;}
}

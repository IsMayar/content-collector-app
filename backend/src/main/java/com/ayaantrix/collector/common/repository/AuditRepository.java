package com.ayaantrix.collector.common.repository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;
import java.time.Instant;
import java.util.*;
@Repository @Transactional(propagation=Propagation.MANDATORY)
public class AuditRepository {
 private final JdbcTemplate jdbc;private final JsonMapper json;
 public AuditRepository(JdbcTemplate jdbc,JsonMapper json){this.jdbc=jdbc;this.json=json;}
 public void write(UUID workspace,UUID project,UUID actor,String action,String kind,UUID resource,Map<String,?> metadata,Instant now){var time=java.sql.Timestamp.from(now);jdbc.update("""
 insert into collector.audit_logs(id,workspace_id,project_id,actor_kind,actor_id,action,resource_kind,resource_id,metadata_json,created_at,updated_at)
 values(?,?,?,'USER',?,?,?,?,?::jsonb,?,?)
 """,UUID.randomUUID(),workspace,project,actor,action,kind,resource,json.writeValueAsString(metadata),time,time);}
 public void writeClient(UUID workspace,UUID project,UUID contact,String action,UUID resource,Instant now){writeAccessActor("CLIENT",workspace,project,contact,action,resource,now);}
 public void writeAnonymous(UUID workspace,UUID project,UUID contact,String action,UUID resource,Instant now){writeAccessActor("ANONYMOUS",workspace,project,contact,action,resource,now);}
 private void writeAccessActor(String actorKind,UUID workspace,UUID project,UUID contact,String action,UUID resource,Instant now){var time=java.sql.Timestamp.from(now);jdbc.update("insert into collector.audit_logs(id,workspace_id,project_id,actor_kind,client_contact_id,action,resource_kind,resource_id,metadata_json,created_at,updated_at) values(?,?,?,?,?,?,'CLIENT_ACCESS',?,'{}'::jsonb,?,?)",UUID.randomUUID(),workspace,project,actorKind,contact,action,resource,time,time);}
}

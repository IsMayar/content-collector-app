package com.ayaantrix.collector.clientaccess.repository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.time.*;
import java.sql.Timestamp;
import java.util.*;
@Repository
public class ClientAccessRepository {
 public record Grant(UUID workspace,UUID project,UUID contact,String name,String email,String state,Instant expires,Instant initialized){}
 private final JdbcTemplate jdbc;
 public ClientAccessRepository(JdbcTemplate jdbc){this.jdbc=jdbc;}
 public Optional<Grant> contact(UUID workspace,UUID project,UUID id){return jdbc.query("select * from collector.project_contacts where workspace_id=? and project_id=? and id=?",(r,n)->new Grant(workspace,project,id,r.getString("name"),r.getString("email_normalized"),r.getString("state"),r.getTimestamp("access_expires_at").toInstant(),r.getTimestamp("access_initialized_at")==null?null:r.getTimestamp("access_initialized_at").toInstant()),workspace,project,id).stream().findFirst();}
 public Optional<Grant> candidate(UUID project,String email){return jdbc.query("select workspace_id,id from collector.project_contacts where project_id=? and email_normalized=?",(r,n)->contact(r.getObject(1,UUID.class),project,r.getObject(2,UUID.class)).orElseThrow(),project,email).stream().findFirst();}
 public void initialize(Grant g,Instant now){jdbc.update("update collector.project_contacts set state='ACTIVE',revoked_at=null,access_initialized_at=?,updated_at=? where workspace_id=? and project_id=? and id=?",Timestamp.from(now),Timestamp.from(now),g.workspace(),g.project(),g.contact());}
 public void revoke(Grant g,Instant now){jdbc.update("update collector.project_contacts set state='REVOKED',revoked_at=?,updated_at=? where workspace_id=? and project_id=? and id=?",Timestamp.from(now),Timestamp.from(now),g.workspace(),g.project(),g.contact());}
 public void revokeInvitations(Grant g,Instant now){jdbc.update("update collector.access_tokens set revoked_at=?,updated_at=? where purpose='CLIENT_INVITE' and workspace_id=? and project_id=? and contact_id=? and consumed_at is null and revoked_at is null",Timestamp.from(now),Timestamp.from(now),g.workspace(),g.project(),g.contact());
 jdbc.update("update collector.outbox_jobs j set state='SUCCEEDED',encrypted_payload=null,lease_owner=null,lease_expires_at=null,last_error_code='TOKEN_NOT_USABLE',updated_at=? where j.job_type='CLIENT_INVITE' and j.state in ('QUEUED','RUNNING','FAILED') and exists(select 1 from collector.access_tokens t where t.id=(j.payload_json->>'tokenId')::uuid and t.workspace_id=? and t.project_id=? and t.contact_id=? and (t.revoked_at is not null or t.consumed_at is not null))",Timestamp.from(now),g.workspace(),g.project(),g.contact());}
 public void discardConsumed(UUID token,Instant now){jdbc.update("update collector.outbox_jobs set state='SUCCEEDED',encrypted_payload=null,lease_owner=null,lease_expires_at=null,updated_at=? where job_type='CLIENT_INVITE' and payload_json->>'tokenId'=?",Timestamp.from(now),token.toString());}
 public boolean canDeliver(UUID workspace,UUID project,UUID contact,Instant now){return Boolean.TRUE.equals(jdbc.queryForObject("""
 select exists(select 1 from collector.project_contacts c join collector.projects p on p.workspace_id=c.workspace_id and p.id=c.project_id
 join collector.workspaces w on w.id=c.workspace_id where c.workspace_id=? and c.project_id=? and c.id=?
 and c.state='ACTIVE' and c.revoked_at is null and c.access_initialized_at is not null and c.access_expires_at>?
 and w.state in ('ACTIVE','READ_ONLY') and p.state in ('ACTIVE','PAUSED','COMPLETED'))
 """,Boolean.class,workspace,project,contact,Timestamp.from(now)));}
}

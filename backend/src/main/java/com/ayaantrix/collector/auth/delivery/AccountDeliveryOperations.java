package com.ayaantrix.collector.auth.delivery;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;

/** Trusted in-process operations only. No controller, actuator exposure or raw-capability access. */
@Service
public class AccountDeliveryOperations {
    public enum Resolution { CONFIRMED_SENT, CONFIRMED_NOT_SENT, ABANDON }
    public record Job(UUID id,String purpose,String state,int attempts,String outcome,Instant updatedAt) {}
    private final com.ayaantrix.collector.auth.repository.AccountTokenRepository tokens;
    private final com.ayaantrix.collector.workspace.service.WorkspaceTeamPolicy team;
    private final com.ayaantrix.collector.clientaccess.repository.ClientAccessRepository clients;
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final TransactionTemplate transactions;
    public AccountDeliveryOperations(JdbcTemplate jdbc,Clock clock,PlatformTransactionManager manager,com.ayaantrix.collector.auth.repository.AccountTokenRepository tokens,com.ayaantrix.collector.workspace.service.WorkspaceTeamPolicy team,com.ayaantrix.collector.clientaccess.repository.ClientAccessRepository clients){this.clients=clients;this.tokens=tokens;this.team=team;
        this.jdbc=jdbc;this.clock=clock;this.transactions=new TransactionTemplate(manager);
    }
    public List<Job> inspectHeld(int limit) {
        if(limit<1 || limit>100)throw new IllegalArgumentException("Inspection limit must be 1-100.");
        return jdbc.query("""
            select id,job_type,state,attempt_count,last_error_code,updated_at from collector.outbox_jobs
            where job_type in ('VERIFY_EMAIL','RESET_PASSWORD','TEAM_INVITE','CLIENT_INVITE') and state='FAILED'
            order by updated_at,id limit ?
            """,(row,index)->new Job(row.getObject(1,UUID.class),row.getString(2),row.getString(3),row.getInt(4),
                row.getString(5),row.getTimestamp(6).toInstant()),limit);
    }
    /** Caller must pause/drain all workers and verify provider evidence before CONFIRMED_NOT_SENT. */
    public boolean reconcile(UUID id,Instant expectedUpdatedAt,int expectedAttempts,Resolution resolution,String evidenceReference) {
        if(id==null || expectedUpdatedAt==null || expectedAttempts<1 || expectedAttempts>5 || resolution==null || evidenceReference==null
                || !evidenceReference.matches("CASE-[0-9]{1,12}"))
            throw new IllegalArgumentException("A job, expected version, resolution and safe evidence reference are required.");
        return Boolean.TRUE.equals(transactions.execute(status->{
            // Row lock serializes operators; expectedUpdatedAt rejects stale decisions after restart/recovery.
            var jobs=jdbc.query("""
                select attempt_count,last_error_code from collector.outbox_jobs
                where id=? and updated_at=? and attempt_count=? and state='FAILED'
                and job_type in ('VERIFY_EMAIL','RESET_PASSWORD','TEAM_INVITE','CLIENT_INVITE') for update
                """,(row,index)->new Object[]{row.getInt(1),row.getString(2)},id,Timestamp.from(expectedUpdatedAt),expectedAttempts);
            if(jobs.isEmpty())return false;
            var job=jobs.getFirst();
            if(resolution!=Resolution.ABANDON && !"DELIVERY_OUTCOME_UNKNOWN".equals(job[1]))return false;
            var now=clock.instant();
            Boolean usable=jdbc.queryForObject("""
                select exists(select 1 from collector.outbox_jobs j
                  join collector.access_tokens t on t.id=(j.payload_json->>'tokenId')::uuid
                  join collector.users u on u.id=t.user_id
                  where j.id=? and t.purpose=j.job_type and t.created_at<=? and t.expires_at>?
                    and t.consumed_at is null and t.revoked_at is null and t.email_normalized=u.email_normalized
                    and ((j.job_type='VERIFY_EMAIL' and u.state='UNVERIFIED')
                      or (j.job_type='RESET_PASSWORD' and u.state='ACTIVE' and u.verified_at is not null)))
                """,Boolean.class,id,Timestamp.from(now),Timestamp.from(now));
            var tokenId=jdbc.queryForObject("select (payload_json->>'tokenId')::uuid from collector.outbox_jobs where id=?",UUID.class,id);
            var teamToken=tokens.findById(tokenId).filter(t->t.getPurpose()==com.ayaantrix.collector.auth.entity.TokenPurpose.TEAM_INVITE);
            if(teamToken.isPresent())usable=team.canDeliver(teamToken.get());
            var clientToken=tokens.findById(tokenId).filter(t->t.getPurpose()==com.ayaantrix.collector.auth.entity.TokenPurpose.CLIENT_INVITE);
            if(clientToken.isPresent()){var t=clientToken.get();usable=t.isUsableFor(com.ayaantrix.collector.auth.entity.TokenPurpose.CLIENT_INVITE,now)&&clients.canDeliver(t.getWorkspaceId(),t.getProjectId(),t.getContactId(),now);}
            boolean retry=resolution==Resolution.CONFIRMED_NOT_SENT && Boolean.TRUE.equals(usable) && (int)job[0]<5;
            String state=resolution==Resolution.CONFIRMED_SENT?"SUCCEEDED":retry?"QUEUED":"DEAD";
            String code=resolution==Resolution.CONFIRMED_SENT?"RECONCILED_SENT":retry?"RECONCILED_NOT_SENT":"RECONCILED_CLOSED";
            jdbc.update("""
                update collector.outbox_jobs set state=?,last_error_code=?,
                  encrypted_payload=case when ? then encrypted_payload else null end,
                  available_at=?,updated_at=?,payload_json=payload_json || jsonb_build_object('reconciliation',
                    jsonb_build_object('resolution',cast(? as text),'evidenceRef',cast(? as text),'at',cast(? as text)))
                where id=?
                """,state,code,retry,Timestamp.from(now),Timestamp.from(now),resolution.name(),evidenceReference,now.toString(),id);
            return true;
        }));
    }
}

package com.ayaantrix.collector.auth.delivery;

import com.ayaantrix.collector.auth.entity.*;
import com.ayaantrix.collector.auth.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
import java.net.URI;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;

@Component
public class VerificationDeliveryWorker {
    private final com.ayaantrix.collector.workspace.service.WorkspaceTeamPolicy team;
    private final com.ayaantrix.collector.clientaccess.repository.ClientAccessRepository clients;
    private final JdbcTemplate jdbc;
    private final TokenDeliveryCipher cipher;
    private final AccountTokenRepository tokens;
    private final UserAccountRepository users;
    private final VerificationMailSender sender;
    private final Clock clock;
    private final URI app;
    private final TransactionTemplate transactions;
    private record Claimed(UUID id,UUID tokenId,byte[] encrypted,String keyId,int attempts,TokenPurpose purpose) {}

    public VerificationDeliveryWorker(JdbcTemplate jdbc,TokenDeliveryCipher cipher,AccountTokenRepository tokens,
            UserAccountRepository users,VerificationMailSender sender,Clock clock,PlatformTransactionManager manager,com.ayaantrix.collector.workspace.service.WorkspaceTeamPolicy team,com.ayaantrix.collector.clientaccess.repository.ClientAccessRepository clients,
            @Value("${collector.delivery.app-base-url:http://127.0.0.1:5173}") String appBase) {
        this.clients=clients;this.team=team;this.jdbc=jdbc;this.cipher=cipher;this.tokens=tokens;this.users=users;this.sender=sender;this.clock=clock;
        try {
            this.app=URI.create(appBase);
            boolean local=Set.of("localhost","127.0.0.1","[::1]").contains(app.getHost());
            if (app.getHost()==null || app.getUserInfo()!=null || app.getQuery()!=null || app.getFragment()!=null
                    || !("https".equals(app.getScheme()) || (local && "http".equals(app.getScheme()))))
                throw new IllegalArgumentException();
        } catch (RuntimeException error) { throw new IllegalStateException("Invalid application base URL."); }
        this.transactions=new TransactionTemplate(manager);
        transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    // Shared entry point for explicit calls and the opt-in AccountDeliveryRunner.
    public boolean dispatchOne() {
        if (TransactionSynchronizationManager.isActualTransactionActive())
            throw new IllegalStateException("Email delivery cannot run inside a caller transaction.");
        Instant now=clock.instant();
        String owner=UUID.randomUUID().toString();
        Claimed job=transactions.execute(status -> {
            // A crashed sender may already have contacted the provider. Recover to
            // reconciliation, never automatic redelivery of an unknown outcome.
            jdbc.update("""
                    with stale as (
                      select id from collector.outbox_jobs where job_type in ('VERIFY_EMAIL','RESET_PASSWORD','TEAM_INVITE','CLIENT_INVITE')
                        and state='RUNNING' and lease_expires_at<=? order by lease_expires_at,id
                      for update skip locked limit 100
                    ) update collector.outbox_jobs j set state='FAILED',lease_owner=null,lease_expires_at=null,
                    last_error_code='DELIVERY_OUTCOME_UNKNOWN',updated_at=? from stale s where j.id=s.id
                    """,Timestamp.from(now),Timestamp.from(now));
            jdbc.update("""
                    with expired as (
                      select j.id from collector.outbox_jobs j where j.job_type in ('VERIFY_EMAIL','RESET_PASSWORD','TEAM_INVITE','CLIENT_INVITE')
                      and j.state='FAILED' and (j.created_at<=? or exists(
                        select 1 from collector.access_tokens t where t.id=(j.payload_json->>'tokenId')::uuid
                        and (t.expires_at<=? or t.consumed_at is not null or t.revoked_at is not null)))
                      order by j.updated_at,j.id for update of j skip locked limit 100
                    ) update collector.outbox_jobs j set state='DEAD',encrypted_payload=null,
                    last_error_code='DELIVERY_EXPIRED',updated_at=? from expired e where j.id=e.id
                    """,Timestamp.from(now.minusSeconds(86400)),Timestamp.from(now),Timestamp.from(now));
            var jobs=jdbc.query("""
                    with candidate as (
                      select id from collector.outbox_jobs where job_type in ('VERIFY_EMAIL','RESET_PASSWORD','TEAM_INVITE','CLIENT_INVITE') and attempt_count<5
                      and state='QUEUED' and available_at<=?
                      order by available_at,id for update skip locked limit 1
                    ) update collector.outbox_jobs j set state='RUNNING',lease_owner=?,lease_expires_at=?,
                      attempt_count=j.attempt_count+1,updated_at=? from candidate c where j.id=c.id
                    returning j.id,j.payload_json->>'tokenId',j.encrypted_payload,j.encryption_key_id,j.attempt_count,j.job_type
                    """,(row,index)->new Claimed(row.getObject(1,UUID.class),UUID.fromString(row.getString(2)),
                    row.getBytes(3),row.getString(4),row.getInt(5),TokenPurpose.valueOf(row.getString(6))),Timestamp.from(now),owner,
                    Timestamp.from(now.plusSeconds(60)),Timestamp.from(now));
            return jobs.isEmpty()?null:jobs.getFirst();
        });
        if (job==null) return false;
        var token=tokens.findById(job.tokenId());
        var user=token.filter(t->t.getUserId()!=null).flatMap(t->users.findById(t.getUserId()));
        boolean eligible=token.isPresent() && token.get().isUsableFor(job.purpose(),clock.instant()) && (job.purpose()==TokenPurpose.TEAM_INVITE
            ? team.canDeliver(token.get())
            : job.purpose()==TokenPurpose.CLIENT_INVITE ? clients.canDeliver(token.get().getWorkspaceId(),token.get().getProjectId(),token.get().getContactId(),clock.instant())
            : user.isPresent() && (job.purpose()==TokenPurpose.VERIFY_EMAIL ? user.get().getState()==AccountState.UNVERIFIED : user.get().getState()==AccountState.ACTIVE && user.get().getVerifiedAt()!=null)
              && token.get().getEmailNormalized().equals(user.get().getEmailNormalized()));
        if(!eligible){finish(job,owner,"SUCCEEDED","TOKEN_NOT_USABLE",true);return true;}
        String raw;
        try { raw=cipher.decrypt(job.encrypted(),job.keyId(),job.id(),job.tokenId()); }
        catch (RuntimeException error) { finish(job,owner,"FAILED","DELIVERY_CIPHER_UNAVAILABLE",false);return true; }
        try {
            String path=switch(job.purpose()){case VERIFY_EMAIL->"/verify-email";case RESET_PASSWORD->"/reset-password";case TEAM_INVITE->"/team-invite";case CLIENT_INVITE->"/client/access?projectId="+token.get().getProjectId();};
            URI link=app.resolve(path+"#token="+raw);
            sender.send(new VerificationMailSender.Message(job.id(),token.get().getEmailNormalized(),link,job.purpose()));
            finish(job,owner,"SUCCEEDED",null,true);
        } catch (VerificationMailSender.DeliveryFailure error) {
            if (error.outcomeUnknown()) finish(job,owner,"FAILED","DELIVERY_OUTCOME_UNKNOWN",false);
            else if (job.attempts()>=5) finish(job,owner,"DEAD","DELIVERY_EXHAUSTED",true);
            else finish(job,owner,"QUEUED","DELIVERY_UNAVAILABLE",false);
        } catch (RuntimeException error) {
            // Adapter failures after a potential send are never blindly retried.
            finish(job,owner,"FAILED","DELIVERY_OUTCOME_UNKNOWN",false);
        }
        return true;
    }
    private void finish(Claimed job,String owner,String state,String code,boolean erase) {
        transactions.executeWithoutResult(status -> {
            Instant now=clock.instant();
            long delay=Math.min(3600,30L << Math.min(job.attempts(),6));
            jdbc.update("""
                    update collector.outbox_jobs set state=?,last_error_code=?,
                    encrypted_payload=case when ? then null else encrypted_payload end,
                    lease_owner=null,lease_expires_at=null,available_at=?,updated_at=?
                    where id=? and state='RUNNING' and lease_owner=?
                    """,state,code,erase,Timestamp.from(now.plusSeconds(delay)),Timestamp.from(now),job.id(),owner);
        });
    }
}

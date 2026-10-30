package com.ayaantrix.collector.auth.delivery;

import com.ayaantrix.collector.auth.entity.AccountToken;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.sql.Timestamp;
import java.util.UUID;

@Component
public class VerificationOutbox {
    private final JdbcTemplate jdbc;
    private final TokenDeliveryCipher cipher;
    public VerificationOutbox(JdbcTemplate jdbc, TokenDeliveryCipher cipher) { this.jdbc=jdbc; this.cipher=cipher; }
    public void enqueue(AccountToken token, String raw, String traceId) {
        if (!TransactionSynchronizationManager.isActualTransactionActive())
            throw new IllegalStateException("Verification issuance requires a transaction.");
        UUID jobId=UUID.randomUUID();
        byte[] payload=cipher.encrypt(raw,jobId,token.getId());
        jdbc.update("""
                insert into collector.outbox_jobs
                (id,job_type,payload_json,encrypted_payload,encryption_key_id,dedupe_key,state,available_at,created_at,updated_at)
                values (?,?,jsonb_build_object('tokenId',?::text,'traceId',?::text),?,?,?,'QUEUED',?,?,?)
                """,jobId,token.getPurpose().name(),token.getId().toString(),traceId,payload,cipher.keyId(),
                (switch(token.getPurpose()){case VERIFY_EMAIL->"verify-email:";case RESET_PASSWORD->"password-reset:";case TEAM_INVITE->"team-invite:";})+token.getId(),
                Timestamp.from(token.getCreatedAt()),Timestamp.from(token.getCreatedAt()),Timestamp.from(token.getCreatedAt()));
    }
    public void discardTeamInvitationJob(UUID tokenId,java.time.Instant now){
        if(!TransactionSynchronizationManager.isActualTransactionActive())throw new IllegalStateException("Invitation cleanup requires a transaction.");
        jdbc.update("update collector.outbox_jobs set state='SUCCEEDED',encrypted_payload=null,lease_owner=null,lease_expires_at=null,last_error_code='TOKEN_NOT_USABLE',updated_at=? where job_type='TEAM_INVITE' and payload_json->>'tokenId'=? and state in ('QUEUED','RUNNING','FAILED')",Timestamp.from(now),tokenId.toString());
    }
    // Remove queued/held capability payloads atomically with successful password changes/replacement.
    public void discardUnusablePasswordResetJobs(UUID userId,java.time.Instant now) {
        if(!TransactionSynchronizationManager.isActualTransactionActive())
            throw new IllegalStateException("Reset delivery cleanup requires a transaction.");
        jdbc.update("""
                update collector.outbox_jobs j set state='SUCCEEDED',encrypted_payload=null,
                lease_owner=null,lease_expires_at=null,last_error_code='TOKEN_NOT_USABLE',updated_at=?
                where j.job_type='RESET_PASSWORD' and j.state in ('QUEUED','RUNNING','FAILED')
                and exists(select 1 from collector.access_tokens t where t.id=(j.payload_json->>'tokenId')::uuid
                  and t.user_id=? and (t.consumed_at is not null or t.revoked_at is not null or t.expires_at<=?))
                """,Timestamp.from(now),userId,Timestamp.from(now));
    }

}

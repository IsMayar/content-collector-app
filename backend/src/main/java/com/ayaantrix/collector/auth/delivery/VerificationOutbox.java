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
                values (?,'VERIFY_EMAIL',jsonb_build_object('tokenId',?::text,'traceId',?::text),?,?,?,'QUEUED',?,?,?)
                """,jobId,token.getId().toString(),traceId,payload,cipher.keyId(),"verify-email:"+token.getId(),
                Timestamp.from(token.getCreatedAt()),Timestamp.from(token.getCreatedAt()),Timestamp.from(token.getCreatedAt()));
    }
}

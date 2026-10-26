package com.ayaantrix.collector.auth.service;

import com.ayaantrix.collector.auth.delivery.*;
import com.ayaantrix.collector.auth.entity.*;
import com.ayaantrix.collector.auth.repository.*;
import com.ayaantrix.collector.auth.security.*;
import com.ayaantrix.collector.common.error.ApiException;
import org.slf4j.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Clock;
import java.util.concurrent.locks.LockSupport;

@Service
public class PasswordRecoveryService {
    private static final Logger log=LoggerFactory.getLogger(PasswordRecoveryService.class);
    private final UserAccountRepository users;
    private final AccountTokenRepository tokens;
    private final SecureAccountTokens secrets;
    private final PasswordEncoder passwords;
    private final TokenDeliveryCipher cipher;
    private final VerificationOutbox outbox;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final long minimumNanos;
    public PasswordRecoveryService(UserAccountRepository users,AccountTokenRepository tokens,SecureAccountTokens secrets,
            PasswordEncoder passwords,TokenDeliveryCipher cipher,VerificationOutbox outbox,Clock clock,
            PlatformTransactionManager manager,@Value("${collector.auth.recovery-min-response-ms:250}") long minimumMillis) {
        this.users=users;this.tokens=tokens;this.secrets=secrets;this.passwords=passwords;this.cipher=cipher;
        this.outbox=outbox;this.clock=clock;this.transactions=new TransactionTemplate(manager);
        if(minimumMillis<100 || minimumMillis>2000) throw new IllegalStateException("Invalid recovery response timing configuration.");
        this.minimumNanos=minimumMillis*1_000_000;
    }
    public void request(String suppliedEmail,String traceId) {
        long start=System.nanoTime();
        try {
            try { cipher.requireConfigured(); }
            catch(ApiException unavailable) {
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"EMAIL_DELIVERY_UNAVAILABLE","Password recovery is temporarily unavailable.");
            }
            String email=EmailAddresses.normalize(suppliedEmail);
            // Equal expensive work for unknown, ineligible, coalesced and issued requests.
            passwords.encode(secrets.generate());
            try {
                transactions.executeWithoutResult(status->{
                    var found=users.findByEmailNormalized(email);
                    if(found.isEmpty())return;
                    var user=users.findLockedById(found.get().getId()).orElseThrow();
                    if(user.getState()!=AccountState.ACTIVE || user.getVerifiedAt()==null
                            || !user.getEmailNormalized().equals(email))return;
                    var now=clock.instant();
                    if(tokens.findByUserIdAndPurpose(user.getId(),TokenPurpose.RESET_PASSWORD).stream()
                            .anyMatch(t->t.isUsableFor(TokenPurpose.RESET_PASSWORD,now)))return;
                    // Replacing expired/revoked capabilities and enqueuing the new one commit together.
                    tokens.revokeUnconsumedForUserAndPurpose(user.getId(),TokenPurpose.RESET_PASSWORD,now);
                    user=users.findById(user.getId()).orElseThrow();
                    String raw=secrets.generate();
                    var token=tokens.saveAndFlush(new AccountToken(user,secrets.digest(raw),TokenPurpose.RESET_PASSWORD,now));
                    outbox.enqueue(token,raw,traceId);
                    outbox.discardUnusablePasswordResetJobs(user.getId(),now);
                });
            } catch(RuntimeException failure) {
                // A recipient-specific persistence failure must not become an enumeration oracle.
                // No email, raw token, SQL cause or payload is logged; operators can correlate safely.
                log.warn("Password recovery could not be queued. traceId={}",traceId);
            }
        } finally {
            long remaining;
            while((remaining=minimumNanos-(System.nanoTime()-start))>0 && !Thread.currentThread().isInterrupted()) {
                LockSupport.parkNanos(remaining);
            }
        }
    }
}

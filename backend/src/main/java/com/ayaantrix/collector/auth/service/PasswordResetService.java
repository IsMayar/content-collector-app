package com.ayaantrix.collector.auth.service;

import com.ayaantrix.collector.auth.delivery.VerificationOutbox;
import com.ayaantrix.collector.auth.dto.PasswordResetRequest;
import com.ayaantrix.collector.auth.entity.*;
import com.ayaantrix.collector.auth.repository.*;
import com.ayaantrix.collector.auth.security.SecureAccountTokens;
import com.ayaantrix.collector.common.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Clock;
import java.nio.charset.StandardCharsets;

@Service
public class PasswordResetService {
    private final UserAccountRepository users;
    private final AccountTokenRepository tokens;
    private final PasswordEncoder passwords;
    private final SecureAccountTokens secrets;
    private final VerificationOutbox outbox;
    private final Clock clock;
    private final TransactionTemplate transactions;
    private final AuthSessionRepository sessions;
    public PasswordResetService(UserAccountRepository users,AccountTokenRepository tokens,PasswordEncoder passwords,
            SecureAccountTokens secrets,VerificationOutbox outbox,Clock clock,PlatformTransactionManager manager,AuthSessionRepository sessions) {
        this.users=users;this.tokens=tokens;this.passwords=passwords;this.secrets=secrets;this.outbox=outbox;
        this.clock=clock;this.transactions=new TransactionTemplate(manager);this.sessions=sessions;
    }
    public void reset(PasswordResetRequest request) {
        if(request.password()==null || request.password().length()<12 || request.password().length()>128
                || request.password().getBytes(StandardCharsets.UTF_8).length>512)
            throw new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_FAILED","Invalid password.");
        String digest;
        try {digest=secrets.digest(request.token());}catch(IllegalArgumentException invalid){throw invalid();}
        // Password hashing happens before taking the database account lock.
        String hash=passwords.encode(request.password());
        transactions.executeWithoutResult(status->{
            var token=tokens.findByTokenHashAndPurpose(digest,TokenPurpose.RESET_PASSWORD).orElseThrow(this::invalid);
            var user=users.findLockedById(token.getUserId()).orElseThrow(this::invalid);
            var now=clock.instant();
            if(user.getState()!=AccountState.ACTIVE || user.getVerifiedAt()==null
                    || !token.getEmailNormalized().equals(user.getEmailNormalized()) || token.getRevokedAt()!=null
                    || now.isBefore(token.getCreatedAt()))throw invalid();
            if(token.getConsumedAt()!=null)
                throw new ApiException(HttpStatus.GONE,"TOKEN_CONSUMED","This password reset link has already been used.");
            if(!now.isBefore(token.getExpiresAt()))
                throw new ApiException(HttpStatus.GONE,"TOKEN_EXPIRED","This password reset link has expired.");
            if(tokens.consume(token.getId(),TokenPurpose.RESET_PASSWORD,now)!=1)
                throw new ApiException(HttpStatus.GONE,"TOKEN_CONSUMED","This password reset link is no longer usable.");
            user=users.findById(user.getId()).orElseThrow(this::invalid);
            user.changePasswordHash(hash,now);
            users.saveAndFlush(user);
            tokens.revokeUnconsumedForUserAndPurpose(user.getId(),TokenPurpose.RESET_PASSWORD,now);
            outbox.discardUnusablePasswordResetJobs(user.getId(),now);
            sessions.revokeAll(user.getId(),now);
        });
    }
    private ApiException invalid(){return new ApiException(HttpStatus.BAD_REQUEST,"TOKEN_INVALID","This password reset link is invalid.");}
}

package com.ayaantrix.collector.auth.service;

import com.ayaantrix.collector.auth.entity.*;
import com.ayaantrix.collector.auth.repository.*;
import com.ayaantrix.collector.auth.security.SecureAccountTokens;
import com.ayaantrix.collector.common.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;

@Service
public class EmailVerificationService {
    private final UserAccountRepository users;
    private final AccountTokenRepository tokens;
    private final SecureAccountTokens secrets;
    private final Clock clock;
    public EmailVerificationService(UserAccountRepository users,AccountTokenRepository tokens,SecureAccountTokens secrets,Clock clock) {
        this.users=users;this.tokens=tokens;this.secrets=secrets;this.clock=clock;
    }
    @Transactional
    public void verify(String raw) {
        String digest;
        try { digest=secrets.digest(raw); } catch (IllegalArgumentException invalid) { throw invalid(); }
        var token=tokens.findByTokenHashAndPurpose(digest,TokenPurpose.VERIFY_EMAIL).orElseThrow(this::invalid);
        var user=users.findLockedById(token.getUserId()).orElseThrow(this::invalid);
        var now=clock.instant();
        if (token.getRevokedAt()!=null || !token.getEmailNormalized().equals(user.getEmailNormalized())
                || user.getState()==AccountState.DISABLED) throw invalid();
        if (token.getConsumedAt()!=null || user.getState()==AccountState.ACTIVE)
            throw new ApiException(HttpStatus.GONE,"TOKEN_CONSUMED","This verification link has already been used.");
        if (!now.isBefore(token.getExpiresAt()))
            throw new ApiException(HttpStatus.GONE,"TOKEN_EXPIRED","This verification link has expired.");
        if (tokens.consume(token.getId(),TokenPurpose.VERIFY_EMAIL,now)!=1)
            throw new ApiException(HttpStatus.GONE,"TOKEN_CONSUMED","This verification link is no longer usable.");
        // consume clears the persistence context; reload while retaining the account row lock.
        user=users.findById(user.getId()).orElseThrow(this::invalid);
        user.markVerified(now);
        users.saveAndFlush(user);
        tokens.revokeUnconsumedForUserAndPurpose(user.getId(),TokenPurpose.VERIFY_EMAIL,now);
    }
    private ApiException invalid() { return new ApiException(HttpStatus.BAD_REQUEST,"TOKEN_INVALID","This verification link is invalid."); }
}

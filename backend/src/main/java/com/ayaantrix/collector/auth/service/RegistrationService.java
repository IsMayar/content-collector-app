package com.ayaantrix.collector.auth.service;

import com.ayaantrix.collector.auth.dto.RegistrationRequest;
import com.ayaantrix.collector.auth.entity.*;
import com.ayaantrix.collector.auth.repository.*;
import com.ayaantrix.collector.auth.security.*;
import com.ayaantrix.collector.auth.delivery.*;
import com.ayaantrix.collector.common.error.ApiException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Clock;
import java.nio.charset.StandardCharsets;

@Service
public class RegistrationService {
    private final UserAccountRepository users;
    private final AccountTokenRepository tokens;
    private final PasswordEncoder passwords;
    private final SecureAccountTokens secrets;
    private final VerificationOutbox outbox;
    private final TokenDeliveryCipher cipher;
    private final Clock clock;
    private final TransactionTemplate transactions;
    public RegistrationService(UserAccountRepository users,AccountTokenRepository tokens,PasswordEncoder passwords,
            SecureAccountTokens secrets,VerificationOutbox outbox,TokenDeliveryCipher cipher,Clock clock,
            PlatformTransactionManager manager) {
        this.users=users;this.tokens=tokens;this.passwords=passwords;this.secrets=secrets;
        this.outbox=outbox;this.cipher=cipher;this.clock=clock;this.transactions=new TransactionTemplate(manager);
    }
    public void register(RegistrationRequest request,String traceId) {
        cipher.requireConfigured(); // Same disabled-feature result for new and existing emails.
        if (request.password().getBytes(StandardCharsets.UTF_8).length > 512)
            throw new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_FAILED","Invalid password.");
        String email=EmailAddresses.normalize(request.email());
        // Perform the same hash work for valid duplicate and new registrations.
        String hash=passwords.encode(request.password());
        try {
            transactions.executeWithoutResult(status -> {
                if (users.existsByEmailNormalized(email)) return;
                var now=clock.instant();
                var user=users.saveAndFlush(new UserAccount(email,request.displayName(),hash,now));
                String raw=secrets.generate();
                var token=tokens.saveAndFlush(new AccountToken(user,secrets.digest(raw),TokenPurpose.VERIFY_EMAIL,now));
                outbox.enqueue(token,raw,traceId);
            });
        } catch (DataIntegrityViolationException error) {
            // Catch outside the transaction: a concurrent insert has already rolled back.
            for (Throwable cause=error;cause!=null;cause=cause.getCause()) {
                if (cause instanceof org.hibernate.exception.ConstraintViolationException constraint
                        && "users_email_normalized_key".equals(constraint.getConstraintName())) return;
            }
            throw error;
        }
    }
}

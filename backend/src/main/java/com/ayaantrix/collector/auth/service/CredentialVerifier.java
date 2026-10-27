package com.ayaantrix.collector.auth.service;
import com.ayaantrix.collector.auth.dto.LoginRequest;
import com.ayaantrix.collector.auth.entity.AccountState;
import com.ayaantrix.collector.auth.repository.UserAccountRepository;
import com.ayaantrix.collector.auth.security.*;
import com.ayaantrix.collector.common.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
@Service
public class CredentialVerifier {
    private final UserAccountRepository users;private final PasswordEncoder passwords;private final String dummy;
    public record Verified(UUID userId,String passwordHash){@Override public String toString(){return "VerifiedCredentials[redacted]";}}
    public CredentialVerifier(UserAccountRepository users,PasswordEncoder passwords,SecureAccountTokens secrets){
        this.users=users;this.passwords=passwords;dummy=passwords.encode(secrets.generate());
    }
    public Verified verify(LoginRequest request){
        if(request.email()==null || request.password()==null || request.password().length()>128
                || request.password().getBytes(StandardCharsets.UTF_8).length>512)throw invalid();
        var user=users.findByEmailNormalized(EmailAddresses.normalize(request.email()));
        boolean matches=passwords.matches(request.password(),user.isPresent()?user.get().getPasswordHash():dummy);
        if(!matches || user.isEmpty() || user.get().getState()==AccountState.DISABLED)throw invalid();
        if(user.get().getState()==AccountState.UNVERIFIED)
            throw new ApiException(HttpStatus.FORBIDDEN,"EMAIL_NOT_VERIFIED","Verify your email before signing in.");
        if(user.get().getVerifiedAt()==null)throw invalid();
        return new Verified(user.get().getId(),user.get().getPasswordHash());
    }
    private ApiException invalid(){return new ApiException(HttpStatus.UNAUTHORIZED,"INVALID_CREDENTIALS","The email or password is incorrect.");}
}

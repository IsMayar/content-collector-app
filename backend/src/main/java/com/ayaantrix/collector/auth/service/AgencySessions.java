package com.ayaantrix.collector.auth.service;

import com.ayaantrix.collector.auth.dto.*;
import com.ayaantrix.collector.auth.entity.*;
import com.ayaantrix.collector.auth.repository.*;
import com.ayaantrix.collector.auth.security.*;
import com.ayaantrix.collector.common.error.ApiException;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.*;
import java.util.*;

@Service
public class AgencySessions {
    public record Issued(String accessToken,String refreshToken,Instant expiresAt,SessionResponses.User user){
        @Override public String toString(){return "IssuedSession[redacted]";}
    }
    private record RefreshResult(Issued issued,ApiException failure){}
    private final UserAccountRepository users;private final AuthSessionRepository sessions;private final SessionTokenRepository tokens;
    private final CredentialVerifier credentials;private final SecureAccountTokens secrets;private final RefreshTokenHashes hashes;
    private final AccessTokens access;private final Clock clock;private final TransactionTemplate transactions;
    public AgencySessions(UserAccountRepository users,AuthSessionRepository sessions,SessionTokenRepository tokens,
            CredentialVerifier credentials,SecureAccountTokens secrets,RefreshTokenHashes hashes,AccessTokens access,
            Clock clock,PlatformTransactionManager manager){
        this.users=users;this.sessions=sessions;this.tokens=tokens;this.credentials=credentials;this.secrets=secrets;
        this.hashes=hashes;this.access=access;this.clock=clock;transactions=new TransactionTemplate(manager);
    }
    public Issued login(LoginRequest request){
        access.requireConfigured();hashes.requireConfigured();var verified=credentials.verify(request);
        return transactions.execute(status->{
            var user=users.findLockedById(verified.userId()).orElseThrow(this::unauthorized);
            if(!eligible(user) || !verified.passwordHash().equals(user.getPasswordHash()))throw unauthorized();
            var now=clock.instant();var session=sessions.saveAndFlush(new AuthSession(user.getId(),now));
            String raw=secrets.generate();tokens.saveAndFlush(new SessionToken(session,hashes.digest(raw),now));
            return new Issued(access.issue(user.getId(),session.getId()),raw,session.getExpiresAt(),SessionResponses.User.from(user));
        });
    }
    public Issued refresh(String raw){
        if(raw==null)throw unauthorized();
        final String digest;
        try{digest=hashes.digest(raw);}catch(IllegalArgumentException invalid){throw unauthorized();}
        access.requireConfigured();
        var result=transactions.execute(status->{
            var located=tokens.locate(digest).orElseThrow(this::unauthorized);
            var user=users.findLockedById(located.getUserId()).orElseThrow(this::unauthorized);
            var session=sessions.findLockedById(located.getSessionId()).orElseThrow(this::unauthorized);
            var token=tokens.findById(located.getId()).orElseThrow(this::unauthorized);var now=clock.instant();
            if(!eligible(user) || !session.usable(now) || !now.isBefore(token.getExpiresAt()))throw unauthorized();
            if(token.getRotatedAt()!=null){
                if(!now.isBefore(token.getRotatedAt()) && now.isBefore(token.getRotatedAt().plusSeconds(2)))
                    return new RefreshResult(null,new ApiException(HttpStatus.CONFLICT,"REFRESH_ALREADY_ROTATED","Session refresh is already in progress. Try again."));
                // Return the error AFTER committing revocation; throwing here would roll it back.
                session.revoke(now);sessions.saveAndFlush(session);
                return new RefreshResult(null,unauthorized());
            }
            String next=secrets.generate();var replacement=tokens.saveAndFlush(new SessionToken(session,hashes.digest(next),now));
            token.rotate(replacement.getId(),now);tokens.saveAndFlush(token);session.touch(now);sessions.saveAndFlush(session);
            return new RefreshResult(new Issued(access.issue(user.getId(),session.getId()),next,session.getExpiresAt(),SessionResponses.User.from(user)),null);
        });
        if(result.failure()!=null)throw result.failure();return result.issued();
    }
    public void validateAccess(Jwt jwt){
        try{
            UUID userId=UUID.fromString(jwt.getSubject()),sessionId=UUID.fromString(jwt.getClaimAsString("sid"));
            var user=users.findById(userId).orElseThrow(this::unauthorized);var session=sessions.findById(sessionId).orElseThrow(this::unauthorized);
            if(!eligible(user) || !session.getUserId().equals(userId) || !session.usable(clock.instant()))throw unauthorized();
        }catch(IllegalArgumentException invalid){throw unauthorized();}
    }
    public SessionResponses.Me me(Jwt jwt){validateAccess(jwt);return new SessionResponses.Me(SessionResponses.User.from(users.findById(UUID.fromString(jwt.getSubject())).orElseThrow(this::unauthorized)),List.of());}
    public List<SessionResponses.Session> list(Jwt jwt){
        validateAccess(jwt);var now=clock.instant();UUID current=UUID.fromString(jwt.getClaimAsString("sid"));
        return sessions.findByUserIdOrderByCreatedAtDesc(UUID.fromString(jwt.getSubject()),PageRequest.of(0,100)).stream().filter(s->s.usable(now))
            .map(s->new SessionResponses.Session(s.getId(),s.getId().equals(current),s.getCreatedAt(),s.getLastSeenAt(),s.getExpiresAt(),"Browser session")).toList();
    }
    public void logout(String raw,String bearer){
        if(raw!=null){logout(raw);return;}
        if(bearer==null || !bearer.startsWith("Bearer "))return;
        final Jwt jwt;try{jwt=access.decode(bearer.substring(7));}catch(org.springframework.security.oauth2.jwt.JwtException invalid){return;}
        transactions.executeWithoutResult(status->{
            UUID userId=UUID.fromString(jwt.getSubject()),sessionId=UUID.fromString(jwt.getClaimAsString("sid"));
            if(users.findLockedById(userId).isEmpty())return;
            var found=sessions.findLockedById(sessionId);
            if(found.isPresent() && found.get().getUserId().equals(userId)){
                found.get().revoke(clock.instant());sessions.saveAndFlush(found.get());
            }
        });
    }
    public void logout(String raw){
        if(raw==null)return;
        final String digest;try{digest=hashes.digest(raw);}catch(IllegalArgumentException invalid){return;}
        transactions.executeWithoutResult(status->{var located=tokens.locate(digest);if(located.isEmpty())return;
            users.findLockedById(located.get().getUserId()).orElseThrow(this::unauthorized);
            var session=sessions.findLockedById(located.get().getSessionId()).orElseThrow(this::unauthorized);
            session.revoke(clock.instant());sessions.saveAndFlush(session);
        });
    }
    public void revoke(Jwt jwt,UUID sessionId){
        transactions.executeWithoutResult(status->{
            var user=users.findLockedById(UUID.fromString(jwt.getSubject())).orElseThrow(this::unauthorized);validateAccess(jwt);
            var session=sessions.findLockedById(sessionId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"NOT_FOUND","Session not found."));
            if(!session.getUserId().equals(user.getId()))throw new ApiException(HttpStatus.NOT_FOUND,"NOT_FOUND","Session not found.");
            session.revoke(clock.instant());sessions.saveAndFlush(session);
        });
    }
    public void logoutAll(Jwt jwt){transactions.executeWithoutResult(status->{
        users.findLockedById(UUID.fromString(jwt.getSubject())).orElseThrow(this::unauthorized);validateAccess(jwt);
        sessions.revokeAll(UUID.fromString(jwt.getSubject()),clock.instant());
    });}
    private boolean eligible(UserAccount user){return user.getState()==AccountState.ACTIVE && user.getVerifiedAt()!=null;}
    private ApiException unauthorized(){return new ApiException(HttpStatus.UNAUTHORIZED,"INVALID_CREDENTIALS","Your session is unavailable. Sign in again.");}
}

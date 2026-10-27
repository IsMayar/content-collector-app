package com.ayaantrix.collector.auth.dto;
import com.ayaantrix.collector.auth.entity.UserAccount;
import java.time.Instant;
import java.util.*;
public final class SessionResponses {
    private SessionResponses(){}
    public record User(UUID id,String email,String displayName,boolean verified){
        public static User from(UserAccount user){return new User(user.getId(),user.getEmailNormalized(),user.getDisplayName(),user.getVerifiedAt()!=null);}
    }
    public record Login(String accessToken,int expiresIn,User user){@Override public String toString(){return "LoginResponse[redacted]";}}
    public record Access(String accessToken,int expiresIn){@Override public String toString(){return "AccessResponse[redacted]";}}
    public record Me(User user,List<Object> memberships){}
    public record Session(UUID id,boolean current,Instant createdAt,Instant lastSeenAt,Instant expiresAt,String label){}
}

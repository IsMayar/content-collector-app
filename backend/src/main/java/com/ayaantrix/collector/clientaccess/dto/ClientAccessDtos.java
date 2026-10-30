package com.ayaantrix.collector.clientaccess.dto;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.UUID;
public final class ClientAccessDtos {
 private ClientAccessDtos(){}
 public record Exchange(@NotBlank @Size(max=100) String token){@Override public String toString(){return "ClientExchange[redacted]";}}
 public record RequestLink(@NotBlank @Email @Size(max=254) String email,@NotNull UUID projectId){}
 public record Invitation(UUID id,String email,Instant expiresAt,String state){}
 public record Access(UUID projectId,Instant expiresAt){}
 public record Issued(String credential,UUID projectId,Instant expiresAt){@Override public String toString(){return "ClientSession[redacted]";}}
}

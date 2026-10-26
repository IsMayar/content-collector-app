package com.ayaantrix.collector.auth.dto;

import jakarta.validation.constraints.*;

public record PasswordResetRequest(
        @NotBlank @Pattern(regexp="[A-Za-z0-9_-]{43}") String token,
        @NotBlank @Size(min=12,max=128) String password) {
    public PasswordResetRequest { if (token != null) token=token.strip(); }
    @Override public String toString() { return "PasswordResetRequest[redacted]"; }
}

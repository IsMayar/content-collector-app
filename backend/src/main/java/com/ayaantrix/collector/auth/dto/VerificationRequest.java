package com.ayaantrix.collector.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record VerificationRequest(@NotBlank @Pattern(regexp="[A-Za-z0-9_-]{43}") String token) {
    public VerificationRequest { if (token != null) token = token.strip(); }
    @Override public String toString() { return "VerificationRequest[redacted]"; }
}

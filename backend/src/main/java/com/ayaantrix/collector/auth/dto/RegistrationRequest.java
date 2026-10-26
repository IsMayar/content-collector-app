package com.ayaantrix.collector.auth.dto;

import jakarta.validation.constraints.*;

public record RegistrationRequest(
        @NotBlank @Email @Size(max=254) String email,
        @NotBlank @Size(min=2,max=100) String displayName,
        @NotBlank @Size(min=12,max=128) String password) {
    public RegistrationRequest {
        if (email != null) email = email.strip();
        if (displayName != null) displayName = displayName.strip();
    }
    @Override public String toString() { return "RegistrationRequest[redacted]"; }
}

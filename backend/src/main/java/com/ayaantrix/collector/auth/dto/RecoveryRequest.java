package com.ayaantrix.collector.auth.dto;

import jakarta.validation.constraints.*;

public record RecoveryRequest(@NotBlank @Email @Size(max=254) String email) {
    public RecoveryRequest { if (email != null) email=email.strip(); }
    @Override public String toString() { return "RecoveryRequest[redacted]"; }
}

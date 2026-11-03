package com.ayaantrix.collector.sms.dto;

import jakarta.validation.constraints.*;

import java.util.UUID;

public final class SmsDtos {
    private SmsDtos() {}

    public record Start(
            @NotBlank @Pattern(regexp = "\\+1[0-9]{10}") String phoneE164,
            @NotBlank @Size(max = 80) String consentTextVersion,
            @AssertTrue boolean consent) {
        @Override
        public String toString() {
            return "SmsConsent[redacted]";
        }
    }

    public record Confirm(
            @NotNull UUID verificationId, @NotBlank @Pattern(regexp = "[0-9]{6}") String code) {
        @Override
        public String toString() {
            return "SmsConfirmation[redacted]";
        }
    }
}

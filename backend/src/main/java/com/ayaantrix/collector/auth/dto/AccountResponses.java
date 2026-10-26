package com.ayaantrix.collector.auth.dto;

public final class AccountResponses {
    private AccountResponses() {}
    public record Message(String message) {}
    public record Verified(boolean verified) {}
    public record Csrf(String token) {
        @Override public String toString() { return "Csrf[redacted]"; }
    }
}

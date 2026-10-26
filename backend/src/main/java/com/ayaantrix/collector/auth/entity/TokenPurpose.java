package com.ayaantrix.collector.auth.entity;

import java.time.Duration;

public enum TokenPurpose {
    VERIFY_EMAIL(Duration.ofHours(24)),
    RESET_PASSWORD(Duration.ofMinutes(30));

    private final Duration lifetime;
    TokenPurpose(Duration lifetime) { this.lifetime = lifetime; }
    public Duration lifetime() { return lifetime; }
}

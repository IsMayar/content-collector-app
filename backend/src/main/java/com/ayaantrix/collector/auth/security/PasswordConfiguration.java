package com.ayaantrix.collector.auth.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.util.Map;

@Configuration(proxyBeanMethods = false)
public class PasswordConfiguration {
    @Bean
    public PasswordEncoder passwordEncoder() {
        // Guide Section 8.1: Argon2id, 19 MiB, t=2, p=1; benchmark on deployment hardware.
        var argon2 = new Argon2PasswordEncoder(16, 32, 1, 19456, 2);
        return new DelegatingPasswordEncoder("argon2", Map.of("argon2", argon2));
    }
}

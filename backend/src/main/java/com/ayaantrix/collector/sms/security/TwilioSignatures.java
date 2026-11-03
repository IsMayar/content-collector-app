package com.ayaantrix.collector.sms.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

@Component
public class TwilioSignatures {
    private final String secret, inbound, status, account, scope;

    public TwilioSignatures(
            @Value("${collector.sms.auth-token:}") String secret,
            @Value("${collector.sms.inbound-url:}") String inbound,
            @Value("${collector.sms.status-url:}") String status,
            @Value("${collector.sms.account-sid:}") String account,
            @Value("${collector.sms.messaging-service-sid:}") String scope) {
        this.secret = secret;
        this.inbound = inbound;
        this.status = status;
        this.account = account;
        this.scope = scope;
    }

    public boolean valid(
            String kind,
            String url,
            String query,
            Map<String, String> parameters,
            String signature) {
        try {
            String canonical = kind.equals("inbound") ? inbound : status;
            if (query != null) {
                if (!kind.equals("status")
                        || !query.matches(
                                "attempt=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))
                    return false;
                canonical = canonical + "?" + query;
            }
            if (secret.isBlank()
                    || canonical.isBlank()
                    || !canonical.equals(url + (query == null ? "" : "?" + query))
                    || !account.equals(parameters.get("AccountSid"))
                    || !scope.equals(parameters.get("MessagingServiceSid"))
                    || signature == null
                    || signature.length() > 256) return false;
            StringBuilder signed = new StringBuilder(canonical);
            new TreeMap<>(parameters).forEach((k, v) -> signed.append(k).append(v));
            var mac = javax.crypto.Mac.getInstance("HmacSHA1");
            mac.init(
                    new javax.crypto.spec.SecretKeySpec(
                            secret.getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
            return MessageDigest.isEqual(
                    mac.doFinal(signed.toString().getBytes(StandardCharsets.UTF_8)),
                    Base64.getDecoder().decode(signature));
        } catch (Exception e) {
            return false;
        }
    }
}

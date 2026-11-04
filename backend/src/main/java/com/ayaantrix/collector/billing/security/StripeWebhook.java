package com.ayaantrix.collector.billing.security;

import com.ayaantrix.collector.billing.repository.BillingRepository;
import com.ayaantrix.collector.common.error.ApiException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.*;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

@Service
public class StripeWebhook {
    private final BillingRepository repo;
    private final JsonMapper json;
    private final Clock clock;
    private final String secret;

    public StripeWebhook(
            BillingRepository repo,
            JsonMapper json,
            Clock clock,
            @Value("${collector.billing.webhook-secret:}") String secret) {
        this.repo = repo;
        this.json = json;
        this.clock = clock;
        this.secret = secret;
    }

    @Transactional
    public void receive(byte[] body, String signature) {
        if (secret.isBlank()
                || body.length > 262144
                || signature == null
                || signature.length() > 4096) throw invalid();
        try {
            String timestamp = null;
            var signatures = new ArrayList<String>();
            for (String part : signature.split(",")) {
                var pair = part.strip().split("=", 2);
                if (pair.length != 2) continue;
                if (pair[0].equals("t")) {
                    if (timestamp != null) throw invalid();
                    timestamp = pair[1];
                }
                if (pair[0].equals("v1")) signatures.add(pair[1]);
            }
            if (timestamp == null
                    || Math.abs(
                                    Math.subtractExact(
                                            clock.instant().getEpochSecond(),
                                            Long.parseLong(timestamp)))
                            > 300) throw invalid();
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            mac.update((timestamp + ".").getBytes(StandardCharsets.UTF_8));
            byte[] expected = mac.doFinal(body);
            boolean valid = false;
            for (String candidate : signatures)
                if (candidate.matches("[a-fA-F0-9]{64}"))
                    valid |= MessageDigest.isEqual(expected, HexFormat.of().parseHex(candidate));
            if (!valid) throw invalid();
            var event = json.readTree(body);
            String id = event.path("id").asText(), type = event.path("type").asText();
            if (!id.matches("evt_[A-Za-z0-9]{1,180}")
                    || type.length() > 120
                    || event.path("livemode").asBoolean()) throw invalid();
            if (!(type.equals("checkout.session.completed")
                    || type.startsWith("customer.subscription.")
                    || Set.of("invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed")
                            .contains(type))) return;
            var object = event.path("data").path("object");
            String customer = object.path("customer").asText();
            if (!customer.matches("cus_[A-Za-z0-9]+")) throw invalid();
            String hash =
                    HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body));
            if (!hash.equals(repo.event(id, hash, type, customer, clock.instant())))
                throw new ApiException(
                        HttpStatus.CONFLICT,
                        "BILLING_EVENT_CONFLICT",
                        "Provider event identity conflicts.");
        } catch (ApiException known) {
            throw known;
        } catch (Exception invalid) {
            throw invalid();
        }
    }

    private static ApiException invalid() {
        return new ApiException(
                HttpStatus.BAD_REQUEST,
                "INVALID_WEBHOOK",
                "The provider notification could not be verified.");
    }
}

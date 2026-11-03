package com.ayaantrix.collector.sms.controller;

import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.repository.IdempotencyRepository;
import com.ayaantrix.collector.sms.repository.SmsRepository;
import com.ayaantrix.collector.sms.security.TwilioSignatures;
import com.ayaantrix.collector.sms.service.SmsService;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.*;

@RestController
public class TwilioWebhookController {
    private final TwilioSignatures signatures;
    private final SmsRepository repo;
    private final SmsService sms;
    private final Clock clock;

    public TwilioWebhookController(
            TwilioSignatures signatures, SmsRepository repo, SmsService sms, Clock clock) {
        this.signatures = signatures;
        this.repo = repo;
        this.sms = sms;
        this.clock = clock;
    }

    @PostMapping(
            value = "/api/v1/webhooks/twilio/{kind}",
            consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    @Transactional
    public Map<String, Boolean> receive(@PathVariable String kind, HttpServletRequest request)
            throws java.io.IOException {
        if (!Set.of("inbound", "status").contains(kind))
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Webhook unavailable.");
        byte[] raw = request.getInputStream().readNBytes(16385);
        if (raw.length > 16384)
            throw new ApiException(
                    HttpStatus.PAYLOAD_TOO_LARGE, "PAYLOAD_TOO_LARGE", "Webhook too large.");
        var values = new LinkedHashMap<String, String>();
        try {
            for (String pair : new String(raw, StandardCharsets.UTF_8).split("&")) {
                String[] parts = pair.split("=", 2);
                String k = java.net.URLDecoder.decode(parts[0], StandardCharsets.UTF_8),
                        v =
                                parts.length == 2
                                        ? java.net.URLDecoder.decode(
                                                parts[1], StandardCharsets.UTF_8)
                                        : "";
                if (values.putIfAbsent(k, v) != null) throw new IllegalArgumentException();
            }
        } catch (IllegalArgumentException e) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Invalid provider form.");
        }
        if (!signatures.valid(
                kind,
                request.getRequestURL().toString(),
                request.getQueryString(),
                values,
                request.getHeader("X-Twilio-Signature")))
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "INVALID_WEBHOOK_SIGNATURE",
                    "Webhook verification failed.");
        String sid = values.getOrDefault("MessageSid", "");
        if (!sid.matches("SM[0-9a-fA-F]{32}"))
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_FAILED",
                    "Invalid provider message identifier.");
        if (kind.equals("inbound")) {
            String type = values.getOrDefault("OptOutType", "");
            if (Set.of("STOP", "START", "HELP").contains(type)) {
                String from = values.getOrDefault("From", "");
                if (!from.matches("\\+1[0-9]{10}"))
                    throw new ApiException(
                            HttpStatus.BAD_REQUEST,
                            "VALIDATION_FAILED",
                            "Invalid provider destination.");
                repo.inbound(
                        sid, sms.scope(), IdempotencyRepository.hash(from), type, clock.instant());
            }
        } else repo.status(sid, values.getOrDefault("MessageStatus", ""), clock.instant());
        return Map.of("accepted", true);
    }
}

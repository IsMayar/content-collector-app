package com.ayaantrix.collector.sms.provider;

import com.ayaantrix.collector.reminder.service.EmailSender.Result;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import tools.jackson.databind.json.JsonMapper;

import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;

@Component
public class TwilioSmsSender implements SmsSender {
    private final boolean enabled;
    private final String account, token, scope, statusUrl;
    private final JsonMapper json;
    private final HttpClient http =
            HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .followRedirects(HttpClient.Redirect.NEVER)
                    .build();

    public TwilioSmsSender(
            @Value("${collector.sms.enabled:false}") boolean enabled,
            @Value("${collector.sms.onboarding-approved:false}") boolean approved,
            @Value("${collector.sms.account-sid:}") String account,
            @Value("${collector.sms.auth-token:}") String token,
            @Value("${collector.sms.messaging-service-sid:}") String scope,
            @Value("${collector.sms.status-url:}") String statusUrl,
            JsonMapper json,
            @Value("${collector.sms.inbound-url:}") String inboundUrl) {
        this.enabled = enabled && approved;
        this.account = account;
        this.token = token;
        this.scope = scope;
        this.statusUrl = statusUrl;
        this.json = json;
        if (enabled
                && (!approved
                        || !account.matches("AC[0-9a-fA-F]{32}")
                        || token.isBlank()
                        || !scope.matches("MG[0-9a-fA-F]{32}")
                        || !statusUrl.startsWith("https://")
                        || !inboundUrl.startsWith("https://")))
            throw new IllegalStateException("Approved SMS provider configuration is required.");
    }

    public boolean available() {
        return enabled;
    }

    public String scope() {
        return scope;
    }

    public Result send(UUID id, String phone, String body) {
        if (!enabled) return new Result("FAILED", null, "SMS_UNAVAILABLE");
        try {
            String form =
                    "To="
                            + enc(phone)
                            + "&MessagingServiceSid="
                            + enc(scope)
                            + "&Body="
                            + enc(body)
                            + "&StatusCallback="
                            + enc(statusUrl + "?attempt=" + id);
            var req =
                    HttpRequest.newBuilder(
                                    URI.create(
                                            "https://api.twilio.com/2010-04-01/Accounts/"
                                                    + account
                                                    + "/Messages.json"))
                            .timeout(Duration.ofSeconds(30))
                            .header(
                                    "Authorization",
                                    "Basic "
                                            + Base64.getEncoder()
                                                    .encodeToString(
                                                            (account + ":" + token)
                                                                    .getBytes(
                                                                            StandardCharsets
                                                                                    .UTF_8)))
                            .header("Content-Type", "application/x-www-form-urlencoded")
                            .POST(HttpRequest.BodyPublishers.ofString(form))
                            .build();
            var res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 200 && res.statusCode() < 300) {
                String sid = json.readTree(res.body()).path("sid").asString();
                return sid.matches("SM[0-9a-fA-F]{32}")
                        ? new Result("ACCEPTED", sid, null)
                        : new Result("UNKNOWN", null, "SMS_OUTCOME_UNKNOWN");
            }
            if (res.statusCode() == 429) return new Result("QUEUED", null, "SMS_RATE_LIMIT");
            if (res.statusCode() >= 500) return new Result("UNKNOWN", null, "SMS_OUTCOME_UNKNOWN");
            return new Result("FAILED", null, "SMS_PROVIDER_REJECTED");
        } catch (java.net.ConnectException e) {
            return new Result("QUEUED", null, "SMS_CONNECT_FAILED");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Result("UNKNOWN", null, "SMS_OUTCOME_UNKNOWN");
        } catch (Exception e) {
            return new Result("UNKNOWN", null, "SMS_OUTCOME_UNKNOWN");
        }
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    @Override
    public Optional<com.ayaantrix.collector.reminder.service.EmailSender.Receipt> lookup(
            String id) {
        if (!enabled || id == null || !id.matches("SM[0-9a-fA-F]{32}")) return Optional.empty();
        try {
            var request =
                    HttpRequest.newBuilder(
                                    URI.create(
                                            "https://api.twilio.com/2010-04-01/Accounts/"
                                                    + account
                                                    + "/Messages/"
                                                    + id
                                                    + ".json"))
                            .timeout(Duration.ofSeconds(20))
                            .header(
                                    "Authorization",
                                    "Basic "
                                            + Base64.getEncoder()
                                                    .encodeToString(
                                                            (account + ":" + token)
                                                                    .getBytes(
                                                                            StandardCharsets
                                                                                    .UTF_8)))
                            .GET()
                            .build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (var body = response.body()) {
                byte[] raw = body.readNBytes(65537);
                if (response.statusCode() != 200 || raw.length > 65536) return Optional.empty();
                return receipt(json.readTree(raw), id, account, scope);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    public static Optional<com.ayaantrix.collector.reminder.service.EmailSender.Receipt> receipt(
            tools.jackson.databind.JsonNode data, String expected, String account, String scope) {
        if (!expected.equals(data.path("sid").asString())
                || !account.equals(data.path("account_sid").asString())
                || !scope.equals(data.path("messaging_service_sid").asString()))
            return Optional.empty();
        String state =
                switch (data.path("status").asString()) {
                    case "accepted", "queued", "sending", "sent" -> "ACCEPTED";
                    case "delivered" -> "DELIVERED";
                    case "failed", "undelivered", "canceled" -> "FAILED";
                    default -> null;
                };
        return state == null
                ? Optional.empty()
                : Optional.of(
                        new com.ayaantrix.collector.reminder.service.EmailSender.Receipt(
                                expected, data.path("to").asString(), state));
    }
}

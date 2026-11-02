package com.ayaantrix.collector.reminder.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import tools.jackson.databind.json.JsonMapper;

import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;

@Component
public class ResendEmailSender implements EmailSender {
    private final String key, from;
    private final boolean enabled;
    private final JsonMapper json;
    private final HttpClient http =
            HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .followRedirects(HttpClient.Redirect.NEVER)
                    .build();

    public ResendEmailSender(
            @Value("${collector.reminders.email-enabled:false}") boolean enabled,
            @Value("${collector.reminders.resend-api-key:}") String key,
            @Value("${collector.reminders.from:}") String from,
            JsonMapper json,
            @Value("${collector.reminders.webhook-secret:}") String webhookSecret,
            @Value("${collector.reminders.webhook-url:}") String webhookUrl) {
        this.enabled = enabled;
        this.key = key;
        this.from = from;
        this.json = json;
        if (enabled && (webhookSecret.isBlank() || !webhookUrl.startsWith("https://")))
            throw new IllegalStateException(
                    "Verified reminder webhooks are required before email delivery.");
        if (enabled
                && (key.isBlank()
                        || (!from.contains("@") || from.contains("\r") || from.contains("\n"))))
            throw new IllegalStateException("Reminder provider configuration is incomplete.");
    }

    public boolean available() {
        return enabled;
    }

    public Result send(Message m) {
        if (!enabled) return new Result("FAILED", null, "EMAIL_UNAVAILABLE");
        try {
            var request =
                    HttpRequest.newBuilder(URI.create("https://api.resend.com/emails"))
                            .timeout(Duration.ofSeconds(30))
                            .header("Authorization", "Bearer " + key)
                            .header("Content-Type", "application/json")
                            .header("Idempotency-Key", m.deliveryId().toString())
                            .POST(
                                    HttpRequest.BodyPublishers.ofString(
                                            json.writeValueAsString(
                                                    Map.of(
                                                            "from",
                                                            from,
                                                            "to",
                                                            List.of(m.recipient()),
                                                            "reply_to",
                                                            m.replyTo(),
                                                            "subject",
                                                            m.subject(),
                                                            "text",
                                                            m.body()))))
                            .build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                var id = json.readTree(response.body()).path("id").asString();
                return id.isBlank()
                        ? new Result("UNKNOWN", null, "INVALID_PROVIDER_RECEIPT")
                        : new Result("ACCEPTED", id, null);
            }
            if (response.statusCode() == 429)
                return new Result("QUEUED", null, "PROVIDER_RATE_LIMIT");
            if (response.statusCode() >= 500)
                return new Result("UNKNOWN", null, "PROVIDER_OUTCOME_UNKNOWN");
            return new Result("FAILED", null, "PROVIDER_REJECTED");
        } catch (java.net.ConnectException e) {
            return new Result("QUEUED", null, "PROVIDER_CONNECT_FAILED");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Result("UNKNOWN", null, "PROVIDER_OUTCOME_UNKNOWN");
        } catch (Exception e) {
            return new Result("UNKNOWN", null, "PROVIDER_OUTCOME_UNKNOWN");
        }
    }
}

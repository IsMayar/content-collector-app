package com.ayaantrix.collector.auth.delivery;

import com.ayaantrix.collector.auth.entity.TokenPurpose;

import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Explicit opt-in email delivery for account verification, password recovery and invitations.
 * A 2xx response with a provider receipt means accepted, not necessarily delivered.
 * Definite rejection can be retried by the existing bounded outbox; an uncertain outcome is held.
 */
public final class ResendAccountMailSender implements VerificationMailSender {
    private final String apiKey;
    private final String from;
    private final JsonMapper json;
    private final HttpClient http;

    public ResendAccountMailSender(String apiKey, String from, JsonMapper json) {
        this(
                apiKey,
                from,
                json,
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(5))
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build());
    }

    // Inject a synthetic HTTP client in unit tests; no real email must be sent by tests.
    ResendAccountMailSender(String apiKey, String from, JsonMapper json, HttpClient http) {
        if (apiKey == null
                || !apiKey.startsWith("re_")
                || apiKey.isBlank()
                || apiKey.contains("\r")
                || apiKey.contains("\n")
                || from == null
                || !from.contains("@")
                || from.contains("\r")
                || from.contains("\n"))
            throw new IllegalStateException("Account email provider configuration is incomplete.");
        this.apiKey = apiKey;
        this.from = from;
        this.json = json;
        this.http = http;
    }

    record Content(String subject, String text) {}

    static Content content(Message message) {
        String subject;
        String action;
        if (message.purpose() == TokenPurpose.CLIENT_INVITE) {
            subject = "Your Content Collector project invitation";
            action = "Open your private project using the following link:";
        } else if (message.purpose() == TokenPurpose.TEAM_INVITE) {
            subject = "You're invited to Content Collector";
            action = "Accept your team invitation using the following link:";
        } else if (message.purpose() == TokenPurpose.RESET_PASSWORD) {
            subject = "Reset your Content Collector password";
            action = "Reset your password using the following link:";
        } else {
            subject = "Verify your Content Collector email";
            action = "Verify your email address using the following link:";
        }
        URI uri = message.actionLink();
        if (uri == null || !"https".equals(uri.getScheme()) || uri.getHost() == null
                || uri.getUserInfo() != null)
            throw new IllegalStateException("Account email action link requires an HTTPS origin.");
        return new Content(
                subject,
                action + "\n\n" + uri + "\n\nIf you did not request this email, you can ignore it.");
    }

    @Override
    public void send(Message message) {
        // Validate before the provider call, so an unsafe action URL is never delivered.
        Content content = content(message);
        try {
            var body = json.writeValueAsString(
                    Map.of(
                            "from", from,
                            "to", List.of(message.recipient()),
                            "subject", content.subject(),
                            "text", content.text()));
            var request = HttpRequest.newBuilder(URI.create("https://api.resend.com/emails"))
                    .timeout(Duration.ofSeconds(20))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .header("Idempotency-Key", message.deliveryId().toString())
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofString());
            int status = response.statusCode();
            if (status >= 200 && status < 300) {
                if (!json.readTree(response.body()).path("id").asText().isBlank()) return;
                throw new DeliveryFailure(true);
            }
            if (status >= 500 || status == 408 || status == 409)
                throw new DeliveryFailure(true);
            // Provider rejected the request before accepting this delivery.
            throw new DeliveryFailure(false);
        } catch (DeliveryFailure failure) {
            throw failure;
        } catch (HttpTimeoutException failure) {
            throw new DeliveryFailure(true);
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            throw new DeliveryFailure(true);
        } catch (IOException failure) {
            // A dropped connection may occur after the provider has accepted the request.
            throw new DeliveryFailure(true);
        } catch (RuntimeException failure) {
            // Do not leak exception text, email address, token or provider response.
            throw new DeliveryFailure(true);
        }
    }
}

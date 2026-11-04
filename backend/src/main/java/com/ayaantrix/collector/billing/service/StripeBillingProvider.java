package com.ayaantrix.collector.billing.service;

import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.workspace.entity.PlanKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;

/** Sandbox-only adapter. Redirects and provider URLs never come from callers. */
@Component
public class StripeBillingProvider implements BillingProvider {
    private final boolean enabled;
    private final String secret, solo, agency, configuration, base;
    private final JsonMapper json;
    private final HttpClient http =
            HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(5))
                    .followRedirects(HttpClient.Redirect.NEVER)
                    .build();

    public StripeBillingProvider(
            JsonMapper json,
            @Value("${collector.billing.enabled:false}") boolean enabled,
            @Value("${collector.billing.secret:}") String secret,
            @Value("${collector.billing.solo-price:}") String solo,
            @Value("${collector.billing.agency-price:}") String agency,
            @Value("${collector.billing.portal-configuration:}") String configuration,
            @Value("${collector.billing.app-base:https://localhost:8443}") String base) {
        this.json = json;
        this.enabled = enabled;
        this.secret = secret;
        this.solo = solo;
        this.agency = agency;
        this.configuration = configuration;
        this.base = base.replaceAll("/$", "");
        if (enabled
                && (!secret.startsWith("sk_test_")
                        || !solo.matches("price_[A-Za-z0-9]+")
                        || !agency.matches("price_[A-Za-z0-9]+")
                        || solo.equals(agency)
                        || !configuration.matches("bpc_[A-Za-z0-9]+")
                        || !base.matches("https://[^?#]+")))
            throw new IllegalStateException(
                    "A complete approved Stripe sandbox configuration is required.");
    }

    public String customer(UUID workspace) {
        return call(
                        "POST",
                        "customers",
                        Map.of("metadata[collector_workspace]", workspace.toString()),
                        "collector-customer-" + workspace)
                .path("id")
                .asText();
    }

    public String checkout(UUID workspace, UUID operation, String customer, PlanKey plan) {
        var fields = new LinkedHashMap<String, String>();
        fields.put("customer", customer);
        fields.put("mode", "subscription");
        fields.put("line_items[0][price]", plan == PlanKey.SOLO ? solo : agency);
        fields.put("line_items[0][quantity]", "1");
        fields.put("subscription_data[metadata][collector_workspace]", workspace.toString());
        fields.put("subscription_data[metadata][collector_checkout]", operation.toString());
        fields.put("success_url", returnUrl(workspace));
        fields.put("cancel_url", returnUrl(workspace));
        return hosted(
                call("POST", "checkout/sessions", fields, "collector-checkout-" + operation),
                "checkout.stripe.com");
    }

    public String portal(UUID workspace, UUID operation, String customer) {
        var config = call("GET", "billing_portal/configurations/" + configuration, Map.of(), null);
        var features = config.path("features");
        if (!config.path("active").asBoolean()
                || config.path("livemode").asBoolean()
                || features.path("subscription_update").path("enabled").asBoolean()
                || (features.path("subscription_cancel").path("enabled").asBoolean()
                        && !"at_period_end"
                                .equals(
                                        features.path("subscription_cancel")
                                                .path("mode")
                                                .asText()))) throw unavailable();
        return hosted(
                call(
                        "POST",
                        "billing_portal/sessions",
                        Map.of(
                                "customer",
                                customer,
                                "configuration",
                                configuration,
                                "return_url",
                                returnUrl(workspace)),
                        "collector-portal-" + operation),
                "billing.stripe.com");
    }

    private String returnUrl(UUID workspace) {
        return base + "/app/w/" + workspace + "/billing?view=status";
    }

    public Snapshot current(String customer) {
        var list =
                call(
                        "GET",
                        "subscriptions",
                        Map.of(
                                "customer",
                                customer,
                                "status",
                                "all",
                                "limit",
                                "100",
                                "expand[]",
                                "data.latest_invoice"),
                        null);
        if (list.path("has_more").asBoolean()) throw unavailable();
        JsonNode selected = null;
        for (var sub : list.path("data")) {
            if (!"canceled".equals(sub.path("status").asText())
                    && !"incomplete_expired".equals(sub.path("status").asText())) {
                if (selected != null) throw unavailable();
                selected = sub;
            }
        }
        if (selected == null) {
            // A canceled subscription still supplies the exact paid-period boundary.
            for (var sub : list.path("data"))
                if (selected == null
                        || sub.path("created").asLong() > selected.path("created").asLong())
                    selected = sub;
        }
        if (selected == null) return null;
        var items = selected.path("items");
        var data = items.path("data");
        if (selected.path("livemode").asBoolean()
                || !customer.equals(selected.path("customer").asText())
                || items.path("has_more").asBoolean()
                || data.size() != 1) throw unavailable();
        var item = data.get(0);
        var price = item.path("price");
        String priceId = price.path("id").asText();
        PlanKey plan =
                solo.equals(priceId)
                        ? PlanKey.SOLO
                        : agency.equals(priceId) ? PlanKey.AGENCY : null;
        if (plan == null
                || item.path("quantity").asInt() != 1
                || !"usd".equals(price.path("currency").asText())
                || !"month".equals(price.path("recurring").path("interval").asText())
                || price.path("recurring").path("interval_count").asInt() != 1) throw unavailable();
        try {
            var metadata = selected.path("metadata");
            return new Snapshot(
                    selected.path("id").asText(),
                    UUID.fromString(metadata.path("collector_workspace").asText()),
                    UUID.fromString(metadata.path("collector_checkout").asText()),
                    plan,
                    selected.path("status").asText(),
                    Instant.ofEpochSecond(item.path("current_period_start").asLong()),
                    Instant.ofEpochSecond(item.path("current_period_end").asLong()),
                    selected.path("cancel_at_period_end").asBoolean(),
                    "paid".equals(selected.path("latest_invoice").path("status").asText()));
        } catch (RuntimeException invalid) {
            throw unavailable();
        }
    }

    private String hosted(JsonNode node, String host) {
        try {
            var uri = URI.create(node.path("url").asText());
            if (!"https".equals(uri.getScheme())
                    || !host.equals(uri.getHost())
                    || uri.getUserInfo() != null
                    || uri.getPort() != -1) throw unavailable();
            return uri.toString();
        } catch (IllegalArgumentException invalid) {
            throw unavailable();
        }
    }

    private JsonNode call(String method, String path, Map<String, String> fields, String key) {
        if (!enabled) throw unavailable();
        String form =
                fields.entrySet().stream()
                        .map(e -> encode(e.getKey()) + "=" + encode(e.getValue()))
                        .collect(java.util.stream.Collectors.joining("&"));
        var request =
                HttpRequest.newBuilder(
                                URI.create(
                                        "https://api.stripe.com/v1/"
                                                + path
                                                + (method.equals("GET") && !form.isEmpty()
                                                        ? "?" + form
                                                        : "")))
                        .timeout(Duration.ofSeconds(20))
                        .header("Authorization", "Bearer " + secret)
                        .header("Stripe-Version", "2026-10-28.endive");
        if (key != null) request.header("Idempotency-Key", key);
        if (method.equals("GET")) request.GET();
        else
            request.header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(form));
        try {
            var response = http.send(request.build(), HttpResponse.BodyHandlers.ofInputStream());
            try (var body = response.body()) {
                byte[] bytes = body.readNBytes(1_048_577);
                if (response.statusCode() / 100 != 2 || bytes.length > 1_048_576)
                    throw unavailable();
                return json.readTree(bytes);
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (java.io.IOException invalid) {
            throw unavailable();
        }
    }

    private static String encode(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    public static ApiException unavailable() {
        return new ApiException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "BILLING_UNAVAILABLE",
                "Hosted billing is temporarily unavailable.");
    }
}

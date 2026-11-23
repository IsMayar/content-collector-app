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
    @Value("${collector.billing.legacy-solo-price:}")
    private String legacySolo = "";

    @Value("${collector.billing.legacy-agency-price:}")
    private String legacyAgency = "";
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
        if (plan != PlanKey.SOLO && plan != PlanKey.AGENCY) throw unavailable();
        validateMappings();
        String priceId = plan == PlanKey.SOLO ? solo : agency;
        validatePrice(call("GET", "prices/" + priceId, Map.of(), null), priceId,
                plan == PlanKey.SOLO ? 700 : 1900, true);
        var fields = new LinkedHashMap<String, String>();
        fields.put("customer", customer);
        fields.put("mode", "subscription");
        fields.put("line_items[0][price]", priceId);
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

    public String schedule(UUID workspace, UUID operation, String customer, Snapshot source, PlanKey target) {
        if (target == PlanKey.FREE || target == source.plan() || !workspace.equals(source.workspace())
                || !"active".equals(source.state()) || !source.paid() || source.cancelAtPeriodEnd()
                || !source.id().matches("sub_[A-Za-z0-9]+")) throw unavailable();
        validateMappings();
        String price = target == PlanKey.SOLO ? solo : agency;
        validatePrice(call("GET", "prices/" + price, Map.of(), null), price,
                target == PlanKey.SOLO ? 700 : 1900, true);
        // Stable keys recover either POST after an unknown network outcome without a second schedule.
        var created = call("POST", "subscription_schedules", Map.of("from_subscription", source.id()),
                "collector-plan-create-" + operation);
        String id = created.path("id").asText();
        if (!id.matches("sub_sched_[A-Za-z0-9]+")) throw unavailable();
        validateScheduleOwner(created, customer, source.id());
        var phases = created.path("phases");
        if (phases.size() != 1) throw unavailable();
        var phase = phases.get(0);
        // Do not replace negotiated financial terms with simple monthly-plan phases.
        for (String field : List.of("discounts", "add_invoice_items", "default_tax_rates"))
            if (!phase.path(field).isMissingNode() && !phase.path(field).isNull()
                    && !phase.path(field).isEmpty()) throw unavailable();
        for (String field : List.of("trial_end", "coupon", "application_fee_percent", "transfer_data"))
            if (!phase.path(field).isMissingNode() && !phase.path(field).isNull()) throw unavailable();
        for (var item : phase.path("items"))
            for (String field : List.of("discounts", "tax_rates", "billing_thresholds"))
                if (!item.path(field).isMissingNode() && !item.path(field).isNull()
                        && !item.path(field).isEmpty()) throw unavailable();
        if (phase.path("start_date").asLong() != source.start().getEpochSecond()
                || phase.path("end_date").asLong() != source.end().getEpochSecond()
                || phase.path("items").size() != 1
                || phase.path("items").get(0).path("quantity").asInt() != 1) throw unavailable();
        String oldPrice = phase.path("items").get(0).path("price").asText();
        if (!(source.plan() == PlanKey.SOLO ? List.of(solo, legacySolo) : List.of(agency, legacyAgency)).contains(oldPrice)
                || oldPrice.isEmpty()) throw unavailable();
        var fields = new LinkedHashMap<String,String>();
        fields.put("end_behavior", "release");
        fields.put("proration_behavior", "none");
        for (int i=0;i<2;i++) {
            String prefix="phases["+i+"]";
            fields.put(prefix+"[items][0][price]",i==0?oldPrice:price);
            fields.put(prefix+"[items][0][quantity]","1");
            fields.put(prefix+"[start_date]",Long.toString((i==0?source.start():source.end()).getEpochSecond()));
            fields.put(prefix+"[proration_behavior]","none");
            fields.put(prefix+"[metadata][collector_workspace]",workspace.toString());
            fields.put(prefix+"[metadata][collector_checkout]",(i==0?source.checkout():operation).toString());
        }
        fields.put("phases[0][end_date]",Long.toString(source.end().getEpochSecond()));
        fields.put("phases[1][duration][interval]","month");
        fields.put("phases[1][duration][interval_count]","1");
        var updated=call("POST","subscription_schedules/"+id,fields,"collector-plan-update-"+operation);
        validateScheduleOwner(updated,customer,source.id());
        if (!id.equals(updated.path("id").asText()) || !"release".equals(updated.path("end_behavior").asText())
                || updated.path("phases").size()!=2) throw unavailable();
        var next=updated.path("phases").get(1);
        if(next.path("start_date").asLong()!=source.end().getEpochSecond()
                || next.path("items").size()!=1 || !price.equals(next.path("items").get(0).path("price").asText())
                || next.path("items").get(0).path("quantity").asInt()!=1
                || !operation.toString().equals(next.path("metadata").path("collector_checkout").asText())
                || !workspace.toString().equals(next.path("metadata").path("collector_workspace").asText())) throw unavailable();
        return id;
    }

    private void validateScheduleOwner(JsonNode schedule,String customer,String subscription) {
        if (!schedule.path("livemode").isBoolean() || schedule.path("livemode").asBoolean()
                || !customer.equals(schedule.path("customer").asText())
                || !subscription.equals(schedule.path("subscription").asText())
                || !"active".equals(schedule.path("status").asText())) throw unavailable();
    }

    private String returnUrl(UUID workspace) {
        return base + "/app/w/" + workspace + "/billing?view=status";
    }

    public Snapshot current(String customer) {
        validateMappings();
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
                solo.equals(priceId) || (!legacySolo.isEmpty() && legacySolo.equals(priceId))
                        ? PlanKey.SOLO
                        : agency.equals(priceId) || (!legacyAgency.isEmpty() && legacyAgency.equals(priceId))
                                ? PlanKey.AGENCY : null;
        if (plan == null
                || item.path("quantity").asInt() != 1
                || !"usd".equals(price.path("currency").asText())
                || !"month".equals(price.path("recurring").path("interval").asText())
                || price.path("recurring").path("interval_count").asInt() != 1) throw unavailable();
        int amount = solo.equals(priceId) ? 700 : agency.equals(priceId) ? 1900
                : legacySolo.equals(priceId) ? 1900 : 4900;
        // Archived legacy prices may still back active subscriptions; never use them for Checkout.
        validatePrice(price, priceId, amount, false);
        try {
            var metadata = selected.path("metadata");
            // Stripe's portal may schedule cancellation using cancel_at while
            // cancel_at_period_end remains false. Only accept the exact paid
            // period boundary; other cancellation times are not represented locally.
            var cancelAt = selected.path("cancel_at");
            boolean cancelAtEnd = selected.path("cancel_at_period_end").asBoolean();
            if (!cancelAt.isMissingNode()
                    && !cancelAt.isNull()
                    && !"canceled".equals(selected.path("status").asText())) {
                if (!cancelAt.isIntegralNumber()
                        || cancelAt.asLong() != item.path("current_period_end").asLong())
                    throw unavailable();
                cancelAtEnd = true;
            }
            return new Snapshot(
                    selected.path("id").asText(),
                    UUID.fromString(metadata.path("collector_workspace").asText()),
                    UUID.fromString(metadata.path("collector_checkout").asText()),
                    plan,
                    selected.path("status").asText(),
                    Instant.ofEpochSecond(item.path("current_period_start").asLong()),
                    Instant.ofEpochSecond(item.path("current_period_end").asLong()),
                    cancelAtEnd,
                    "paid".equals(selected.path("latest_invoice").path("status").asText()));
        } catch (RuntimeException invalid) {
            throw unavailable();
        }
    }

    private void validateMappings() {
        var identifiers = new HashSet<String>();
        for (String id : List.of(solo, agency, legacySolo, legacyAgency)) {
            if (id.isEmpty()) continue;
            if (!id.matches("price_[A-Za-z0-9]+") || !identifiers.add(id)) throw unavailable();
        }
    }

    private void validatePrice(JsonNode price, String id, int amount, boolean purchasing) {
        if (!id.equals(price.path("id").asText())
                || !price.path("livemode").isBoolean()
                || price.path("livemode").asBoolean()
                || (purchasing && !price.path("active").asBoolean())
                || !"recurring".equals(price.path("type").asText())
                || !"per_unit".equals(price.path("billing_scheme").asText())
                || !"usd".equals(price.path("currency").asText())
                || !price.path("unit_amount").isIntegralNumber()
                || price.path("unit_amount").asLong() != amount
                || !"month".equals(price.path("recurring").path("interval").asText())
                || price.path("recurring").path("interval_count").asInt() != 1
                || !"licensed".equals(price.path("recurring").path("usage_type").asText())
                || (!price.path("transform_quantity").isMissingNode()
                        && !price.path("transform_quantity").isNull())
                || (!price.path("custom_unit_amount").isMissingNode()
                        && !price.path("custom_unit_amount").isNull())) throw unavailable();
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

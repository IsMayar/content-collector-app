package com.ayaantrix.collector.billing.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import tools.jackson.databind.JsonNode;

import java.net.URI;

/** One mode boundary shared by provider reads, writes and signed notifications. */
@Component
public final class BillingEnvironment {
    private final boolean live;
    private final String liveKey, liveWebhook;

    public BillingEnvironment(
            @Value("${collector.billing.mode:SANDBOX}") String mode,
            @Value("${collector.billing.live-activation:false}") boolean activation,
            @Value("${collector.billing.live-secret:}") String liveKey,
            @Value("${collector.billing.live-webhook-secret:}") String liveWebhook,
            @Value("${collector.billing.enabled:false}") boolean enabled,
            @Value("${collector.billing.worker-enabled:false}") boolean worker,
            @Value("${collector.billing.webhook-secret:}") String sandboxWebhook) {
        if (!mode.equals("SANDBOX") && !mode.equals("LIVE"))
            throw new IllegalStateException("Invalid billing mode.");
        live = mode.equals("LIVE");
        this.liveKey = liveKey;
        this.liveWebhook = liveWebhook;
        if (live
                && (!activation
                        || !enabled
                        || !worker
                        || !validKey(liveKey)
                        || !liveWebhook.startsWith("whsec_")
                        || liveWebhook.equals(sandboxWebhook)))
            throw new IllegalStateException(
                    "Live billing requires explicit activation and separate complete credentials"
                        + " and worker.");
        if (!live && activation)
            throw new IllegalStateException("Live activation is inconsistent with sandbox mode.");
    }

    public static BillingEnvironment sandbox() {
        return new BillingEnvironment("SANDBOX", false, "", "", false, false, "");
    }

    public String apiSecret(String sandbox) {
        return live ? liveKey : sandbox;
    }

    public boolean isLive() {
        return live;
    }

    public String webhookSecret(String sandbox) {
        return live ? liveWebhook : sandbox;
    }

    public boolean validKey(String key) {
        return key.startsWith(live ? "sk_live_" : "sk_test_");
    }

    public boolean matches(JsonNode mode) {
        return mode.isBoolean() && mode.asBoolean() == live;
    }

    public boolean validOrigin(String value) {
        try {
            URI uri = URI.create(value);
            String host = uri.getHost();
            return "https".equals(uri.getScheme())
                    && host != null
                    && uri.getUserInfo() == null
                    && uri.getQuery() == null
                    && uri.getFragment() == null
                    && (uri.getPath().isEmpty() || uri.getPath().equals("/"))
                    && (!live
                            || (host.contains(".")
                                    && !host.matches("[0-9.]+")
                                    && !host.equals("localhost")
                                    && !host.endsWith(".localhost")
                                    && !host.endsWith(".local")
                                    && !host.endsWith(".test")));
        } catch (IllegalArgumentException invalid) {
            return false;
        }
    }
}

package com.ayaantrix.collector.billing.config;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

class BillingEnvironmentTests {
    private BillingEnvironment live(String key, String webhook, boolean worker) {
        return new BillingEnvironment("LIVE", true, key, webhook, true, worker, "whsec_test");
    }

    @Test
    void sandboxNeverAcceptsLiveOrMissingEventMode() {
        var mode = BillingEnvironment.sandbox();
        var json = JsonMapper.builder().build();
        assertThat(mode.matches(json.readTree("false"))).isTrue();
        assertThat(mode.matches(json.readTree("true"))).isFalse();
        assertThat(mode.matches(json.readTree("{}"))).isFalse();
        assertThat(mode.validKey("sk_live_fixture")).isFalse();
    }

    @Test
    void liveRequiresExplicitActivationSeparateKeysAndWorker() {
        assertThatThrownBy(
                        () ->
                                new BillingEnvironment(
                                        "LIVE",
                                        false,
                                        "sk_live_fixture",
                                        "whsec_live",
                                        true,
                                        true,
                                        "whsec_test"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> live("sk_test_fixture", "whsec_live", true))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> live("sk_live_fixture", "whsec_test", true))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> live("sk_live_fixture", "whsec_live", false))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new BillingEnvironment("typo", false, "", "", false, false, ""))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void liveUsesSeparateCredentialsAndRejectsLocalOrAmbiguousOrigins() {
        var mode = live("sk_live_fixture", "whsec_live", true);
        assertThat(mode.apiSecret("sk_test_fixture")).isEqualTo("sk_live_fixture");
        assertThat(mode.webhookSecret("whsec_test")).isEqualTo("whsec_live");
        assertThat(mode.validOrigin("https://billing.example.com")).isTrue();
        for (String origin :
                new String[] {
                    "http://billing.example.com",
                    "https://127.0.0.1:5173",
                    "https://localhost",
                    "https://user@billing.example.com",
                    "https://billing.example.com/path",
                    "https://billing.example.com?return=evil"
                }) assertThat(mode.validOrigin(origin)).isFalse();
    }
}

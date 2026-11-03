package com.ayaantrix.collector.reminder;

import static org.assertj.core.api.Assertions.*;

import com.ayaantrix.collector.reminder.service.ResendEmailSender;
import com.ayaantrix.collector.sms.provider.TwilioSmsSender;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

class ProviderReceiptTests {
    private final JsonMapper json = new JsonMapper();

    @Test
    void emailReceiptBindsIdAndDoesNotConfuseAcceptanceWithDelivery() {
        var value = json.createObjectNode().put("id", "email").put("last_event", "sent");
        value.putArray("to").add("synthetic@example.test");
        assertThat(ResendEmailSender.receipt(value, "email").orElseThrow().state())
                .isEqualTo("ACCEPTED");
        assertThat(ResendEmailSender.receipt(value, "other")).isEmpty();
        value.put("last_event", "delivered");
        assertThat(ResendEmailSender.receipt(value, "email").orElseThrow().state())
                .isEqualTo("DELIVERED");
        value.put("last_event", "not_found");
        assertThat(ResendEmailSender.receipt(value, "email")).isEmpty();
    }

    @Test
    void smsReceiptRequiresConfiguredAccountAndMessagingScope() {
        var value =
                json.createObjectNode()
                        .put("sid", "sid")
                        .put("account_sid", "account")
                        .put("messaging_service_sid", "scope")
                        .put("to", "+12025550123")
                        .put("status", "sent");
        assertThat(TwilioSmsSender.receipt(value, "sid", "account", "scope").orElseThrow().state())
                .isEqualTo("ACCEPTED");
        assertThat(TwilioSmsSender.receipt(value, "sid", "other", "scope")).isEmpty();
        value.put("status", "delivered");
        assertThat(TwilioSmsSender.receipt(value, "sid", "account", "scope").orElseThrow().state())
                .isEqualTo("DELIVERED");
        value.put("status", "unknown");
        assertThat(TwilioSmsSender.receipt(value, "sid", "account", "scope")).isEmpty();
    }
}

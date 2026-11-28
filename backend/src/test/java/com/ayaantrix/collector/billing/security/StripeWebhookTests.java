package com.ayaantrix.collector.billing.security;

import com.ayaantrix.collector.billing.repository.BillingRepository;
import com.ayaantrix.collector.common.error.ApiException;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * A webhook only validates and durably queues an event; it never grants entitlements.
 * Reconciliation reads the current Stripe snapshot regardless of event delivery order.
 */
class StripeWebhookTests {
    @Test
    void liveWebhookRejectsTestEnvelopeAndAcceptsOnlySignedLiveEnvelope() throws Exception {
        var mode =
                new com.ayaantrix.collector.billing.config.BillingEnvironment(
                        "LIVE", true, "sk_live_fixture", SECRET, true, true, "whsec_other");
        var liveWebhook =
                new StripeWebhook(
                        repo,
                        JsonMapper.builder().build(),
                        Clock.fixed(NOW, ZoneOffset.UTC),
                        "whsec_other");
        liveWebhook.configureEnvironment(mode);
        byte[] test = event("evt_mode", "invoice.paid", "cus_synthetic");
        assertThatThrownBy(() -> liveWebhook.receive(test, signature(test, NOW.getEpochSecond())))
                .isInstanceOf(ApiException.class);
        verifyNoInteractions(repo);
        byte[] live =
                new String(test, StandardCharsets.UTF_8)
                        .replace("false", "true")
                        .getBytes(StandardCharsets.UTF_8);
        when(repo.event(anyString(), anyString(), anyString(), anyString(), any()))
                .thenAnswer(i -> i.getArgument(1));
        liveWebhook.receive(live, signature(live, NOW.getEpochSecond()));
        verify(repo)
                .event(
                        eq("evt_mode"),
                        anyString(),
                        eq("invoice.paid"),
                        eq("cus_synthetic"),
                        eq(NOW));
    }


    private static final Instant NOW = Instant.parse("2026-11-25T00:00:00Z");
    private static final String SECRET = "whsec_synthetic_test_secret";
    private final BillingRepository repo = mock(BillingRepository.class);
    private final StripeWebhook webhook = new StripeWebhook(
            repo, JsonMapper.builder().build(), Clock.fixed(NOW, ZoneOffset.UTC), SECRET);

    private byte[] event(String id, String type, String customer) {
        String body = """
                {"id":"%s","type":"%s","livemode":false,"data":{"object":{"customer":"%s"}}}
                """.formatted(id, type, customer);
        return body.getBytes(StandardCharsets.UTF_8);
    }

    private String signature(byte[] body, long timestamp) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        mac.update((timestamp + ".").getBytes(StandardCharsets.UTF_8));
        return "t=" + timestamp + ",v1=" + HexFormat.of().formatHex(mac.doFinal(body));
    }

    private String hash(byte[] body) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body));
    }

    @Test void identicalRedeliveriesAreAcceptedIdempotentlyWithoutDirectEntitlementChanges()
            throws Exception {
        byte[] body = event("evt_duplicate", "invoice.payment_failed", "cus_synthetic");
        var digest = hash(body);
        when(repo.event(eq("evt_duplicate"), eq(digest), eq("invoice.payment_failed"),
                eq("cus_synthetic"), eq(NOW))).thenReturn(digest);

        String signature = signature(body, NOW.getEpochSecond());
        webhook.receive(body, signature);
        webhook.receive(body, signature);

        verify(repo, times(2)).event(
                "evt_duplicate", digest, "invoice.payment_failed", "cus_synthetic", NOW);
        verifyNoMoreInteractions(repo);
    }

    @Test void outOfOrderPaymentEventsAreQueuedWithoutApplyingStaleState() throws Exception {
        byte[] paid = event("evt_newPaid", "invoice.paid", "cus_synthetic");
        byte[] failed = event("evt_oldFailed", "invoice.payment_failed", "cus_synthetic");
        when(repo.event(anyString(), anyString(), anyString(), eq("cus_synthetic"), eq(NOW)))
                .thenAnswer(i -> i.getArgument(1));

        webhook.receive(paid, signature(paid, NOW.getEpochSecond()));
        webhook.receive(failed, signature(failed, NOW.getEpochSecond()));

        var ordered = inOrder(repo);
        ordered.verify(repo).event("evt_newPaid", hash(paid), "invoice.paid", "cus_synthetic", NOW);
        ordered.verify(repo).event(
                "evt_oldFailed", hash(failed), "invoice.payment_failed", "cus_synthetic", NOW);
        ordered.verifyNoMoreInteractions();
    }

    @Test void sameEventIdWithDifferentSignedPayloadIsAConflict() throws Exception {
        byte[] body = event("evt_conflict", "invoice.paid", "cus_synthetic");
        when(repo.event(eq("evt_conflict"), anyString(), eq("invoice.paid"),
                eq("cus_synthetic"), eq(NOW))).thenReturn("previous_different_hash");

        assertThatThrownBy(() -> webhook.receive(body, signature(body, NOW.getEpochSecond())))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("conflicts");
    }

    @Test void staleForgedOrLiveModeEventsAreRejectedBeforeQueueing() throws Exception {
        byte[] valid = event("evt_valid", "invoice.paid", "cus_synthetic");
        String signature = signature(valid, NOW.getEpochSecond());
        assertThatThrownBy(() -> webhook.receive(valid, signature(valid,
                NOW.minusSeconds(301).getEpochSecond()))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> webhook.receive(valid, "t=" + NOW.getEpochSecond()
                + ",v1=" + "0".repeat(64))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> webhook.receive(valid, signature + ",t="
                + NOW.getEpochSecond())).isInstanceOf(ApiException.class);

        byte[] live = new String(valid, StandardCharsets.UTF_8)
                .replace("\"livemode\":false", "\"livemode\":true")
                .getBytes(StandardCharsets.UTF_8);
        assertThatThrownBy(() -> webhook.receive(live, signature(live, NOW.getEpochSecond())))
                .isInstanceOf(ApiException.class);
        verifyNoInteractions(repo);
    }

    @Test void irrelevantEventsDoNotEnqueueAfterSignatureVerification() throws Exception {
        byte[] body = event("evt_ignored", "charge.refunded", "cus_synthetic");
        webhook.receive(body, signature(body, NOW.getEpochSecond()));
        verifyNoInteractions(repo);
    }
    @Test void databaseOutageIsNotDisguisedAsInvalidSignature() throws Exception {
        byte[] body = event("evt_databaseOutage", "invoice.paid", "cus_synthetic");
        when(repo.event(anyString(), anyString(), anyString(), anyString(), any()))
                .thenThrow(new org.springframework.dao.DataAccessResourceFailureException(
                        "Synthetic database unavailable"));

        assertThatThrownBy(() -> webhook.receive(body, signature(body, NOW.getEpochSecond())))
                .isInstanceOf(org.springframework.dao.DataAccessResourceFailureException.class)
                .isNotInstanceOf(ApiException.class);
    }

    @Test void malformedSignedEventStillReturnsBadRequest() throws Exception {
        byte[] body = event("evt_invalid", "invoice.paid", "not_a_customer");
        assertThatThrownBy(() -> webhook.receive(body, signature(body, NOW.getEpochSecond())))
                .isInstanceOf(ApiException.class)
                .satisfies(error -> assertThat(((ApiException) error).getStatus().value()).isEqualTo(400));
        verifyNoInteractions(repo);
    }

}

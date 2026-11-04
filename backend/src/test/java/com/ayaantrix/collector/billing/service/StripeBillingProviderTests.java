package com.ayaantrix.collector.billing.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.workspace.entity.PlanKey;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import tools.jackson.databind.json.JsonMapper;

import java.io.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

class StripeBillingProviderTests {
    final JsonMapper json = JsonMapper.builder().build();
    final UUID workspace = UUID.randomUUID(), operation = UUID.randomUUID();

    StripeBillingProvider provider(HttpClient http) {
        var provider =
                new StripeBillingProvider(
                        json,
                        true,
                        "sk_test_synthetic",
                        "price_solo",
                        "price_agency",
                        "bpc_synthetic",
                        "https://collector.test");
        ReflectionTestUtils.setField(provider, "http", http);
        return provider;
    }

    @SuppressWarnings("unchecked")
    HttpClient http(String body) throws Exception {
        HttpClient http = mock(HttpClient.class);
        HttpResponse<InputStream> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body())
                .thenAnswer(i -> new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(response);
        return http;
    }

    String snapshot(String price) {
        return """
        {"has_more":false,"data":[{"id":"sub_synthetic","customer":"cus_synthetic","livemode":false,
        "status":"active","created":100,"cancel_at_period_end":true,
        "metadata":{"collector_workspace":"%s","collector_checkout":"%s"},
        "latest_invoice":{"status":"paid"},"items":{"has_more":false,"data":[{"quantity":1,
        "current_period_start":1793750400,"current_period_end":1796342400,
        "price":{"id":"%s","currency":"usd","recurring":{"interval":"month","interval_count":1}}}]}}]}
        """
                .formatted(workspace, operation, price);
    }

    @Test
    void reconcilesCurrentExpandedSubscriptionWithPinnedApiAndExactConfiguredPrice()
            throws Exception {
        var http = http(snapshot("price_agency"));
        var value = provider(http).current("cus_synthetic");
        assertThat(value.plan()).isEqualTo(PlanKey.AGENCY);
        assertThat(value.paid()).isTrue();
        assertThat(value.workspace()).isEqualTo(workspace);
        assertThat(value.checkout()).isEqualTo(operation);
        assertThat(value.cancelAtPeriodEnd()).isTrue();
        assertThat(value.end()).isAfter(value.start());
        var request = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http).send(request.capture(), any(HttpResponse.BodyHandler.class));
        assertThat(request.getValue().uri().toString())
                .startsWith("https://api.stripe.com/v1/subscriptions?")
                .contains("customer=cus_synthetic", "expand%5B%5D=data.latest_invoice");
        assertThat(request.getValue().headers().firstValue("Stripe-Version"))
                .contains("2026-10-28.endive");
    }

    @Test
    void rejectsUnknownPricesMultipleSubscriptionsAndLiveOrWrongCustomerResults() throws Exception {
        for (String body :
                List.of(
                        snapshot("price_unknown"),
                        snapshot("price_agency").replace("\"livemode\":false", "\"livemode\":true"),
                        snapshot("price_agency").replace("cus_synthetic", "cus_other"),
                        snapshot("price_agency").replace("\"quantity\":1", "\"quantity\":2"),
                        snapshot("price_agency")
                                .replace("\"has_more\":false", "\"has_more\":true"))) {
            var provider = provider(http(body));
            assertThatThrownBy(() -> provider.current("cus_synthetic"))
                    .isInstanceOf(ApiException.class);
        }
    }

    @Test
    void hostedCheckoutUsesStableProviderKeyAndRejectsUntrustedRedirects() throws Exception {
        var http = http("{\"url\":\"https://checkout.stripe.com/c/pay/synthetic\"}");
        assertThat(provider(http).checkout(workspace, operation, "cus_synthetic", PlanKey.SOLO))
                .startsWith("https://checkout.stripe.com/");
        var request = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http).send(request.capture(), any(HttpResponse.BodyHandler.class));
        assertThat(request.getValue().headers().firstValue("Idempotency-Key"))
                .contains("collector-checkout-" + operation);
        assertThat(request.getValue().uri().toString())
                .isEqualTo("https://api.stripe.com/v1/checkout/sessions");
        var unsafe = provider(http("{\"url\":\"https://checkout.stripe.com.evil.test/\"}"));
        assertThatThrownBy(
                        () -> unsafe.checkout(workspace, operation, "cus_synthetic", PlanKey.SOLO))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void portalRejectsUncheckedPlanChangesAndImmediateCancellation() throws Exception {
        for (String config :
                List.of(
                        "{\"active\":true,\"features\":{\"subscription_update\":{\"enabled\":true}}}",
                        "{\"active\":true,\"features\":{\"subscription_cancel\":{\"enabled\":true,\"mode\":\"immediately\"}}}")) {
            var provider = provider(http(config));
            assertThatThrownBy(() -> provider.portal(workspace, operation, "cus_synthetic"))
                    .isInstanceOf(ApiException.class);
        }
    }

    @Test
    void productionPaymentsStayDisabledAndMalformedOrOversizedResponsesFailClosed()
            throws Exception {
        assertThatThrownBy(
                        () ->
                                new StripeBillingProvider(
                                        json,
                                        true,
                                        "sk_live_forbidden",
                                        "price_solo",
                                        "price_agency",
                                        "bpc_test",
                                        "https://collector.test"))
                .isInstanceOf(IllegalStateException.class);
        var disabled =
                new StripeBillingProvider(json, false, "", "", "", "", "https://collector.test");
        assertThatThrownBy(() -> disabled.customer(workspace)).isInstanceOf(ApiException.class);
        var tooLarge = provider(http(" ".repeat(1_048_577)));
        assertThatThrownBy(() -> tooLarge.current("cus_synthetic"))
                .isInstanceOf(ApiException.class);
    }
}

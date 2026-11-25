package com.ayaantrix.collector.billing.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.workspace.entity.PlanKey;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
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
        "price":%s}]}}]}
        """
                .formatted(workspace, operation, price(price, price.contains("agency") ? 1900 : 700));
    }

    String price(String id, int amount) {
        return """
                {"id":"%s","active":true,"livemode":false,"type":"recurring",
                "billing_scheme":"per_unit","currency":"usd","unit_amount":%d,
                "recurring":{"interval":"month","interval_count":1,"usage_type":"licensed"}}
                """.formatted(id, amount);
    }

    @SuppressWarnings("unchecked")
    HttpClient checkoutHttp(String price, String url) throws Exception {
        HttpClient http = mock(HttpClient.class);
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenAnswer(invocation -> {
                    HttpRequest request = invocation.getArgument(0);
                    HttpResponse<InputStream> response = mock(HttpResponse.class);
                    when(response.statusCode()).thenReturn(200);
                    String body = request.method().equals("GET") ? price : "{\"url\":\"" + url + "\"}";
                    when(response.body()).thenReturn(new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
                    return response;
                });
        return http;
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
    void recognizesScheduledEndOfPeriodCancellationWhenStripeFlagIsFalse() throws Exception {
        String cancelAtPeriodEnd =
                snapshot("price_solo")
                        .replace(
                                "\"cancel_at_period_end\":true,",
                                "\"cancel_at_period_end\":false,\"cancel_at\":1796342400,");
        assertThat(provider(http(cancelAtPeriodEnd)).current("cus_synthetic").cancelAtPeriodEnd())
                .isTrue();

        String noCancellation =
                snapshot("price_solo")
                        .replace(
                                "\"cancel_at_period_end\":true,",
                                "\"cancel_at_period_end\":false,\"cancel_at\":null,");
        assertThat(provider(http(noCancellation)).current("cus_synthetic").cancelAtPeriodEnd())
                .isFalse();
    }

    @Test
    void rejectsCancellationOutsidePaidPeriodBoundary() throws Exception {
        String differentDate =
                snapshot("price_solo")
                        .replace(
                                "\"cancel_at_period_end\":true,",
                                "\"cancel_at_period_end\":false,\"cancel_at\":1796342401,");
        assertThatThrownBy(() -> provider(http(differentDate)).current("cus_synthetic"))
                .isInstanceOf(ApiException.class);
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
        var http = checkoutHttp(price("price_solo", 700), "https://checkout.stripe.com/c/pay/synthetic");
        assertThat(provider(http).checkout(workspace, operation, "cus_synthetic", PlanKey.SOLO))
                .startsWith("https://checkout.stripe.com/");
        var request = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http, times(2)).send(request.capture(), any(HttpResponse.BodyHandler.class));
        assertThat(request.getAllValues().get(0).method()).isEqualTo("GET");
        assertThat(request.getAllValues().get(0).uri().getPath()).endsWith("/prices/price_solo");
        assertThat(request.getValue().headers().firstValue("Idempotency-Key"))
                .contains("collector-checkout-" + operation);
        assertThat(request.getValue().uri().toString())
                .isEqualTo("https://api.stripe.com/v1/checkout/sessions");
        var unsafe = provider(checkoutHttp(price("price_solo", 700), "https://checkout.stripe.com.evil.test/"));
        assertThatThrownBy(
                        () -> unsafe.checkout(workspace, operation, "cus_synthetic", PlanKey.SOLO))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void rejectsIncorrectPriceBeforeCreatingCheckout() throws Exception {
        String valid = price("price_solo", 700);
        for (String invalid : List.of(
                price("price_solo", 1900), price("price_other", 700),
                valid.replace("\"livemode\":false", "\"livemode\":true"),
                valid.replace("\"active\":true", "\"active\":false"),
                valid.replace("\"usd\"", "\"eur\""),
                valid.replace("\"month\"", "\"year\""),
                valid.replace("\"interval_count\":1", "\"interval_count\":2"),
                valid.replace("\"licensed\"", "\"metered\""),
                valid.replace("\"per_unit\"", "\"tiered\""),
                valid.replace("\"unit_amount\":700", "\"unit_amount\":null"),
                valid.replace("\"livemode\":false,", ""))) {
            var http = http(invalid);
            assertThatThrownBy(() -> provider(http).checkout(workspace, operation, "cus_synthetic", PlanKey.SOLO))
                    .isInstanceOf(ApiException.class);
            var request = ArgumentCaptor.forClass(HttpRequest.class);
            verify(http).send(request.capture(), any(HttpResponse.BodyHandler.class));
            assertThat(request.getValue().method()).isEqualTo("GET");
        }
        var http = checkoutHttp(price("price_agency", 1900), "https://checkout.stripe.com/c/pay/synthetic");
        assertThat(provider(http).checkout(workspace, operation, "cus_synthetic", PlanKey.AGENCY))
                .startsWith("https://checkout.stripe.com/");
    }

    @Test
    void reconcilesExplicitLegacyPricesButNeverPurchasesThem() throws Exception {
        for (var entry : Map.of("price_legacySolo", PlanKey.SOLO, "price_legacyAgency", PlanKey.AGENCY).entrySet()) {
            boolean solo = entry.getValue() == PlanKey.SOLO;
            String body = snapshot(entry.getKey()).replace(
                    price(entry.getKey(), entry.getKey().contains("agency") ? 1900 : 700),
                    price(entry.getKey(), solo ? 1900 : 4900).replace("\"active\":true", "\"active\":false"));
            var provider = provider(http(body));
            ReflectionTestUtils.setField(provider, solo ? "legacySolo" : "legacyAgency", entry.getKey());
            assertThat(provider.current("cus_synthetic").plan()).isEqualTo(entry.getValue());
        }
        var http = checkoutHttp(price("price_solo", 700), "https://checkout.stripe.com/c/pay/synthetic");
        var provider = provider(http);
        ReflectionTestUtils.setField(provider, "legacySolo", "price_oldSolo");
        assertThat(provider.checkout(workspace, operation, "cus_synthetic", PlanKey.SOLO)).contains("checkout.stripe.com");
        ReflectionTestUtils.setField(provider, "legacySolo", "price_agency");
        assertThatThrownBy(() -> provider.current("cus_synthetic")).isInstanceOf(ApiException.class);
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

    @ParameterizedTest
    @EnumSource(value = PlanKey.class, names = {"SOLO", "AGENCY"})
    @SuppressWarnings("unchecked")
    void schedulesBothUpgradeAndDowngradeAtRenewalWithoutProration(PlanKey target)
            throws Exception {
        var sourcePlan = target == PlanKey.SOLO ? PlanKey.AGENCY : PlanKey.SOLO;
        String targetPrice = target == PlanKey.SOLO ? "price_solo" : "price_agency";
        String sourcePrice = sourcePlan == PlanKey.SOLO ? "price_solo" : "price_agency";
        var requests = new ArrayList<HttpRequest>();
        HttpClient http = mock(HttpClient.class);
        var source = new BillingProvider.Snapshot(
                "sub_test", workspace, UUID.randomUUID(), sourcePlan, "active",
                java.time.Instant.ofEpochSecond(100),
                java.time.Instant.ofEpochSecond(200), false, true);
        String old = "{\"start_date\":100,\"end_date\":200,\"items\":[{\"price\":\""
                + sourcePrice + "\",\"quantity\":1}]}";
        String next = "{\"start_date\":200,\"items\":[{\"price\":\""
                + targetPrice + "\",\"quantity\":1}],\"metadata\":{\"collector_workspace\":\""
                + workspace + "\",\"collector_checkout\":\"" + operation + "\"}}";

        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenAnswer(invocation -> {
                    HttpRequest request = invocation.getArgument(0);
                    requests.add(request);
                    String responseBody = request.method().equals("GET")
                            ? price(targetPrice, target == PlanKey.SOLO ? 700 : 1900)
                            : "{\"id\":\"sub_sched_test\",\"customer\":\"cus_test\",\"subscription\":\"sub_test\",\"livemode\":false,\"status\":\"active\",\"end_behavior\":\"release\",\"phases\":["
                                + old
                                + (request.uri().getPath().endsWith("sub_sched_test")
                                        ? "," + next : "")
                                + "]}";
                    HttpResponse<InputStream> response = mock(HttpResponse.class);
                    when(response.statusCode()).thenReturn(200);
                    when(response.body()).thenReturn(new ByteArrayInputStream(
                            responseBody.getBytes(StandardCharsets.UTF_8)));
                    return response;
                });

        assertThat(provider(http).schedule(workspace, operation, "cus_test", source, target))
                .isEqualTo("sub_sched_test");
        assertThat(requests).hasSize(3);
        assertThat(requests.get(1).headers().firstValue("Idempotency-Key"))
                .contains("collector-plan-create-" + operation);
        assertThat(requests.get(2).headers().firstValue("Idempotency-Key"))
                .contains("collector-plan-update-" + operation);

        var bytes = HttpResponse.BodySubscribers.ofByteArray();
        requests.get(2).bodyPublisher().orElseThrow()
                .subscribe(new java.util.concurrent.Flow.Subscriber<java.nio.ByteBuffer>() {
                    public void onSubscribe(java.util.concurrent.Flow.Subscription subscription) {
                        bytes.onSubscribe(subscription);
                    }
                    public void onNext(java.nio.ByteBuffer buffer) {
                        bytes.onNext(List.of(buffer));
                    }
                    public void onError(Throwable error) {
                        bytes.onError(error);
                    }
                    public void onComplete() {
                        bytes.onComplete();
                    }
                });
        String sent = java.net.URLDecoder.decode(
                new String(bytes.getBody().toCompletableFuture().join(), StandardCharsets.UTF_8),
                StandardCharsets.UTF_8);
        assertThat(sent).contains(
                "phases[0][items][0][price]=" + sourcePrice,
                "phases[1][items][0][price]=" + targetPrice,
                "phases[1][start_date]=200",
                "proration_behavior=none");
        assertThatThrownBy(() -> provider(http).schedule(
                UUID.randomUUID(), operation, "cus_test", source, target))
                .isInstanceOf(ApiException.class);
    }

}

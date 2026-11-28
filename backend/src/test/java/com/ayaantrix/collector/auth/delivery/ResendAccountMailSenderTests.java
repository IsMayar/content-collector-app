package com.ayaantrix.collector.auth.delivery;

import com.ayaantrix.collector.auth.entity.TokenPurpose;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ResendAccountMailSenderTests {
    private final JsonMapper json = JsonMapper.builder().build();

    private VerificationMailSender.Message invitation() {
        return new VerificationMailSender.Message(
                UUID.randomUUID(),
                "client@example.test",
                URI.create("https://collector.example.com/client/access?projectId=fixture#token=synthetic"),
                TokenPurpose.CLIENT_INVITE);
    }

    @Test
    void acceptedProviderReceiptUsesStableIdempotencyAndDoesNotExfiltrateTokens() throws Exception {
        HttpClient http = mock(HttpClient.class);
        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn("{\"id\":\"receipt-synthetic\"}");
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(response);
        var sender = new ResendAccountMailSender("re_fixture", "notify@example.com", json, http);
        var message = invitation();
        sender.send(message);

        var request = org.mockito.ArgumentCaptor.forClass(HttpRequest.class);
        verify(http).send(request.capture(), any(HttpResponse.BodyHandler.class));
        assertThat(request.getValue().uri().toString()).isEqualTo("https://api.resend.com/emails");
        assertThat(request.getValue().headers().firstValue("Idempotency-Key"))
                .contains(message.deliveryId().toString());
        assertThat(request.getValue().method()).isEqualTo("POST");
        assertThat(request.getValue().timeout()).isPresent();
    }

    @Test
    void definiteRejectionIsRetryableButUncertainReceiptIsHeld() throws Exception {
        HttpClient http = mock(HttpClient.class);
        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(response);
        var sender = new ResendAccountMailSender("re_fixture", "notify@example.com", json, http);

        when(response.statusCode()).thenReturn(429);
        assertThatThrownBy(() -> sender.send(invitation()))
                .isInstanceOf(VerificationMailSender.DeliveryFailure.class)
                .satisfies(error -> assertThat(((VerificationMailSender.DeliveryFailure) error)
                        .outcomeUnknown()).isFalse());

        when(response.statusCode()).thenReturn(503);
        assertThatThrownBy(() -> sender.send(invitation()))
                .isInstanceOf(VerificationMailSender.DeliveryFailure.class)
                .satisfies(error -> assertThat(((VerificationMailSender.DeliveryFailure) error)
                        .outcomeUnknown()).isTrue());
    }

    @Test
    void validatesProviderConfigurationAndRejectsInsecureActionLinks() {
        assertThatThrownBy(() -> new ResendAccountMailSender("", "notify@example.com", json))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new ResendAccountMailSender("re_fixture", "notify@example.com\r\nX: bad", json))
                .isInstanceOf(IllegalStateException.class);
        var invalid = new VerificationMailSender.Message(
                UUID.randomUUID(), "client@example.test",
                URI.create("http://collector.example.com/client/access#token=synthetic"),
                TokenPurpose.CLIENT_INVITE);
        assertThatThrownBy(() -> ResendAccountMailSender.content(invalid))
                .isInstanceOf(IllegalStateException.class);
        assertThat(ResendAccountMailSender.content(invitation()).subject())
                .contains("project invitation");
    }
}

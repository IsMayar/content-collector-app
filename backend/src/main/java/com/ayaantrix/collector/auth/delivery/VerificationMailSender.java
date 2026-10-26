package com.ayaantrix.collector.auth.delivery;

import java.net.URI;
import java.util.UUID;

@FunctionalInterface
public interface VerificationMailSender {
    // The adapter must use deliveryId for provider idempotency where supported.
    void send(Message message);

    record Message(UUID deliveryId, String recipient, URI verificationLink,
            com.ayaantrix.collector.auth.entity.TokenPurpose purpose) {
        public Message(UUID deliveryId,String recipient,URI verificationLink) {
            this(deliveryId,recipient,verificationLink,com.ayaantrix.collector.auth.entity.TokenPurpose.VERIFY_EMAIL);
        }
        public URI actionLink() { return verificationLink; }
        @Override public String toString() { return "VerificationMail[redacted]"; }
    }
    final class DeliveryFailure extends RuntimeException {
        private final boolean outcomeUnknown;
        public DeliveryFailure(boolean outcomeUnknown) {
            super("Verification delivery is unavailable.");
            this.outcomeUnknown = outcomeUnknown;
        }
        public boolean outcomeUnknown() { return outcomeUnknown; }
    }
}

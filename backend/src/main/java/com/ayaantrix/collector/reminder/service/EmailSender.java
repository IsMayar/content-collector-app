package com.ayaantrix.collector.reminder.service;

import java.util.UUID;

/** A provider acceptance is not proof of delivery. Never log the message or provider body. */
public interface EmailSender {
    record Message(
            UUID deliveryId,
            String recipient,
            String replyTo,
            String subject,
            String body,
            boolean digest) {
        public Message(
                UUID deliveryId, String recipient, String replyTo, String subject, String body) {
            this(deliveryId, recipient, replyTo, subject, body, false);
        }

        @Override
        public String toString() {
            return "ReminderMessage[" + deliveryId + "]";
        }
    }

    record Result(String state, String providerId, String failureCode) {}

    record Receipt(String providerId, String recipient, String state) {
        @Override
        public String toString() {
            return "ProviderReceipt[redacted]";
        }
    }

    default java.util.Optional<Receipt> lookup(String providerId) {
        return java.util.Optional.empty();
    }

    boolean available();

    Result send(Message message);
}

package com.ayaantrix.collector.reminder.service;

import java.util.UUID;

/** A provider acceptance is not proof of delivery. Never log the message or provider body. */
public interface EmailSender {
    record Message(UUID deliveryId, String recipient, String replyTo, String subject, String body) {
        @Override
        public String toString() {
            return "ReminderMessage[" + deliveryId + "]";
        }
    }

    record Result(String state, String providerId, String failureCode) {}

    boolean available();

    Result send(Message message);
}

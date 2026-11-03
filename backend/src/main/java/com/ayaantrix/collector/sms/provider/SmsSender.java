package com.ayaantrix.collector.sms.provider;

import com.ayaantrix.collector.reminder.service.EmailSender.Result;

import java.util.UUID;

public interface SmsSender {
    default java.util.Optional<com.ayaantrix.collector.reminder.service.EmailSender.Receipt> lookup(
            String providerId) {
        return java.util.Optional.empty();
    }

    boolean available();

    String scope();

    Result send(UUID id, String phone, String body);
}

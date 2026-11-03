package com.ayaantrix.collector.sms.provider;

import com.ayaantrix.collector.reminder.service.EmailSender.Result;

import java.util.UUID;

public interface SmsSender {
    boolean available();

    String scope();

    Result send(UUID id, String phone, String body);
}

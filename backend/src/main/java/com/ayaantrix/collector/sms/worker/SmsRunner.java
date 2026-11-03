package com.ayaantrix.collector.sms.worker;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "collector.sms.worker-enabled", havingValue = "true")
public class SmsRunner {
    private final SmsVerificationWorker worker;

    public SmsRunner(SmsVerificationWorker worker) {
        this.worker = worker;
    }

    @Scheduled(fixedDelayString = "${collector.sms.poll-ms:1000}")
    public void tick() {
        for (int i = 0; i < 10 && worker.dispatchOne(); i++) {}
    }
}

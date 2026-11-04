package com.ayaantrix.collector.billing.worker;

import com.ayaantrix.collector.billing.service.BillingService;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class BillingWorker {
    private final BillingService billing;
    private final boolean enabled;

    public BillingWorker(
            BillingService billing,
            @Value("${collector.billing.worker-enabled:false}") boolean enabled) {
        this.billing = billing;
        this.enabled = enabled;
    }

    @Scheduled(fixedDelayString = "${collector.billing.poll-ms:30000}")
    public void poll() {
        if (enabled) billing.tick();
    }
}

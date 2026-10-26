package com.ayaantrix.collector.auth.service;

import java.time.Clock;
import org.springframework.context.annotation.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import com.ayaantrix.collector.auth.delivery.VerificationMailSender;

@Configuration(proxyBeanMethods=false)
public class AccountWorkflowConfiguration {
    @Bean @ConditionalOnMissingBean(Clock.class)
    Clock accountClock() { return Clock.systemUTC(); }
    @Bean @ConditionalOnMissingBean(VerificationMailSender.class)
    VerificationMailSender disabledVerificationMailSender() {
        return new VerificationMailSender() {
            @Override public boolean available() { return false; }
            @Override public void send(Message message) { throw new VerificationMailSender.DeliveryFailure(false); }
        };
    }
}

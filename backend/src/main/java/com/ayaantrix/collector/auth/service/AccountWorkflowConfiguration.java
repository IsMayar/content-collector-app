package com.ayaantrix.collector.auth.service;

import java.time.Clock;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import com.ayaantrix.collector.auth.delivery.DevelopmentInbox;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import com.ayaantrix.collector.auth.delivery.VerificationMailSender;

@Configuration(proxyBeanMethods=false)
public class AccountWorkflowConfiguration {
    @Bean @ConditionalOnMissingBean(Clock.class)
    Clock accountClock() { return Clock.systemUTC(); }
    @Bean @ConditionalOnMissingBean(VerificationMailSender.class)
    VerificationMailSender verificationMailSender(Environment environment) {
        if (environment.getProperty("collector.delivery.dev-inbox", Boolean.class, false)) {
            return new DevelopmentInbox(environment);
        }
        return new VerificationMailSender() {
            @Override public boolean available() { return false; }
            @Override public void send(Message message) { throw new VerificationMailSender.DeliveryFailure(false); }
        };
    }
}

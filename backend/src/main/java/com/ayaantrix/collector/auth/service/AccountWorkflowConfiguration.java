package com.ayaantrix.collector.auth.service;

import java.time.Clock;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import com.ayaantrix.collector.auth.delivery.DevelopmentInbox;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import com.ayaantrix.collector.auth.delivery.VerificationMailSender;
import com.ayaantrix.collector.auth.delivery.ResendAccountMailSender;
import tools.jackson.databind.json.JsonMapper;

@Configuration(proxyBeanMethods=false)
public class AccountWorkflowConfiguration {
    @Bean @ConditionalOnMissingBean(Clock.class)
    Clock accountClock() { return Clock.systemUTC(); }
    @Bean @ConditionalOnMissingBean(VerificationMailSender.class)
    VerificationMailSender verificationMailSender(Environment environment, JsonMapper json) {
        boolean developmentInbox = environment.getProperty("collector.delivery.dev-inbox", Boolean.class, false);
        boolean resendEnabled = environment.getProperty("collector.delivery.resend-enabled", Boolean.class, false);
        if (developmentInbox && resendEnabled)
            throw new IllegalStateException("Select only one account email delivery adapter.");
        if (resendEnabled)
            return new ResendAccountMailSender(
                    environment.getProperty("collector.delivery.resend-api-key", ""),
                    environment.getProperty("collector.delivery.resend-from", ""),
                    json);
        if (developmentInbox) return new DevelopmentInbox(environment);
        return new VerificationMailSender() {
            @Override public boolean available() { return false; }
            @Override public void send(Message message) { throw new VerificationMailSender.DeliveryFailure(false); }
        };
    }
}

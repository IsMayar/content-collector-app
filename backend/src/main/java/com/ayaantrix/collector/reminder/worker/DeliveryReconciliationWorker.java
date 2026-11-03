package com.ayaantrix.collector.reminder.worker;

import com.ayaantrix.collector.reminder.repository.DeliveryReconciliationRepository;
import com.ayaantrix.collector.reminder.service.*;
import com.ayaantrix.collector.sms.provider.SmsSender;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.util.*;

@Component
public class DeliveryReconciliationWorker {
    private final DeliveryReconciliationRepository repo;
    private final DeliveryReconciliationService service;
    private final EmailSender email;
    private final SmsSender sms;
    private final Clock clock;
    private final TransactionTemplate tx;
    private final boolean enabled;
    private boolean verificationFirst;

    public DeliveryReconciliationWorker(
            DeliveryReconciliationRepository repo,
            DeliveryReconciliationService service,
            EmailSender email,
            SmsSender sms,
            Clock clock,
            PlatformTransactionManager manager,
            @Value("${collector.reminders.reconciliation-enabled:false}") boolean enabled) {
        this.repo = repo;
        this.service = service;
        this.email = email;
        this.sms = sms;
        this.clock = clock;
        this.tx = new TransactionTemplate(manager);
        this.enabled = enabled;
    }

    public synchronized boolean reconcileOne() {
        boolean first = verificationFirst;
        verificationFirst = !verificationFirst;
        var subject =
                tx.execute(
                        t ->
                                repo.claim(
                                        email.available(),
                                        sms.available(),
                                        first,
                                        clock.instant()));
        if (subject == null || subject.isEmpty()) return false;
        var s = subject.get();
        if (service.stored(s)) return true;
        Optional<EmailSender.Receipt> receipt;
        try {
            receipt =
                    s.channel().equals("EMAIL")
                            ? email.lookup(s.provider())
                            : sms.lookup(s.provider());
        } catch (RuntimeException e) {
            receipt = Optional.empty();
        }
        service.lookup(s, receipt);
        return true;
    }

    @Scheduled(fixedDelayString = "${collector.reminders.reconciliation-poll-ms:60000}")
    public void tick() {
        if (enabled) for (int i = 0; i < 10 && reconcileOne(); i++) {}
    }
}

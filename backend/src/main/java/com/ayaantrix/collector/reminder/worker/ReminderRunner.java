package com.ayaantrix.collector.reminder.worker;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "collector.reminders.worker-enabled", havingValue = "true")
public class ReminderRunner {
    private final ReminderWorker worker;

    public ReminderRunner(ReminderWorker worker) {
        this.worker = worker;
    }

    @Scheduled(fixedDelayString = "${collector.reminders.poll-ms:30000}")
    public void tick() {
        worker.schedule();
        for (int i = 0; i < 25 && worker.dispatchOne(); i++) {}
    }
}

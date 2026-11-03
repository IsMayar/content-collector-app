package com.ayaantrix.collector.analytics.worker;

import com.ayaantrix.collector.analytics.repository.InteractionRepository;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;

@Component
public class InteractionRetention {
    private final InteractionRepository repo;
    private final Clock clock;

    public InteractionRetention(InteractionRepository repo, Clock clock) {
        this.repo = repo;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${collector.analytics.cleanup-poll-ms:86400000}")
    @Transactional
    public void purge() {
        repo.purge(clock.instant().minus(Duration.ofDays(90)));
    }
}

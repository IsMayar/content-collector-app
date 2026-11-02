package com.ayaantrix.collector.ai.worker;

import jakarta.annotation.PreDestroy;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

import java.util.concurrent.*;

@Component
@ConditionalOnProperty(name = "collector.ai.worker-enabled", havingValue = "true")
public class AiWorkerRunner implements SmartLifecycle {
    private final AiWorker worker;
    private ScheduledExecutorService executor;
    private volatile boolean running;

    public AiWorkerRunner(AiWorker worker) {
        this.worker = worker;
    }

    public synchronized void start() {
        if (running) return;
        running = true;
        executor =
                Executors.newSingleThreadScheduledExecutor(
                        r -> {
                            var t = new Thread(r, "ai-draft-worker");
                            t.setDaemon(true);
                            return t;
                        });
        executor.scheduleWithFixedDelay(
                () -> {
                    try {
                        worker.dispatchOne();
                        worker.cleanup();
                    } catch (RuntimeException ignored) {
                        /* Durable state is retried; do not log provider payloads/URLs. */
                    }
                },
                2,
                2,
                TimeUnit.SECONDS);
    }

    public boolean isRunning() {
        return running;
    }

    @PreDestroy
    public synchronized void stop() {
        running = false;
        if (executor != null) {
            executor.shutdown();
            try {
                if (!executor.awaitTermination(45, TimeUnit.SECONDS)) executor.shutdownNow();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                executor.shutdownNow();
            }
        }
    }
}

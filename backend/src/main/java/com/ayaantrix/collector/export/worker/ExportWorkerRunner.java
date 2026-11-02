package com.ayaantrix.collector.export.worker;

import jakarta.annotation.PreDestroy;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

import java.util.concurrent.*;

@Component
@ConditionalOnProperty(name = "collector.exports.worker-enabled", havingValue = "true")
public class ExportWorkerRunner implements SmartLifecycle {
    private final ExportWorker worker;
    private ScheduledExecutorService executor;
    private volatile boolean running;

    public ExportWorkerRunner(ExportWorker worker) {
        this.worker = worker;
    }

    public synchronized void start() {
        if (running) return;
        running = true;
        executor =
                Executors.newSingleThreadScheduledExecutor(
                        r -> {
                            var t = new Thread(r, "private-export-worker");
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

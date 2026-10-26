package com.ayaantrix.collector.auth.delivery;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;
import java.util.concurrent.*;

/** Opt-in polling of the existing durable worker; no web or token-inspection interface. */
@Component
@ConditionalOnProperty(name="collector.delivery.worker-enabled",havingValue="true")
public class AccountDeliveryRunner implements SmartLifecycle {
    private static final Logger log=LoggerFactory.getLogger(AccountDeliveryRunner.class);
    private final VerificationDeliveryWorker worker;
    private final int batchSize;
    private final long pollMillis;
    private final int shutdownSeconds;
    private volatile boolean running;
    private ScheduledExecutorService executor;
    private ScheduledFuture<?> polling;

    public AccountDeliveryRunner(VerificationDeliveryWorker worker,VerificationMailSender sender,TokenDeliveryCipher cipher,
            @Value("${collector.delivery.batch-size:10}") int batchSize,
            @Value("${collector.delivery.poll-ms:1000}") long pollMillis,
            @Value("${collector.delivery.shutdown-seconds:10}") int shutdownSeconds) {
        if(batchSize<1 || batchSize>50 || pollMillis<100 || pollMillis>60000 || shutdownSeconds<1 || shutdownSeconds>30)
            throw new IllegalStateException("Invalid account delivery worker configuration.");
        cipher.requireConfigured();
        if(!sender.available())throw new IllegalStateException("Account delivery requires an explicitly configured mail adapter.");
        this.worker=worker;this.batchSize=batchSize;this.pollMillis=pollMillis;this.shutdownSeconds=shutdownSeconds;
    }
    @Override public synchronized void start() {
        if(running)return;
        executor=Executors.newSingleThreadScheduledExecutor(task->{
            var thread=new Thread(task,"account-delivery");thread.setDaemon(true);return thread;
        });
        running=true;
        polling=executor.scheduleWithFixedDelay(this::poll, pollMillis,pollMillis,TimeUnit.MILLISECONDS);
    }
    private void poll() {
        try {
            for(int count=0;running && !Thread.currentThread().isInterrupted() && count<batchSize;count++)
                if(!worker.dispatchOne())break;
        } catch(RuntimeException failure) {
            // Database/provider exceptions can contain payloads: never log exception text/cause.
            log.warn("Account delivery poll failed; durable job state will be inspected on the next poll.");
        }
    }
    @Override public boolean isRunning(){return running;}
    @Override public int getPhase(){return Integer.MAX_VALUE;}
    @Override @PreDestroy public synchronized void stop() {
        running=false;
        if(executor==null)return;
        polling.cancel(false); // Stop claiming; give an in-flight delivery time to finish and acknowledge.
        executor.shutdown();
        try {
            if(!executor.awaitTermination(shutdownSeconds,TimeUnit.SECONDS))executor.shutdownNow();
        } catch(InterruptedException interrupted){executor.shutdownNow();Thread.currentThread().interrupt();}
        // A forcibly interrupted/unacknowledged send is held as UNKNOWN after its lease expires.
        executor=null;
    }
}

package com.ayaantrix.collector.export.worker;

import com.ayaantrix.collector.attachment.storage.PrivateObjectStorage;
import com.ayaantrix.collector.export.repository.ExportRepository;
import com.ayaantrix.collector.export.repository.ExportRepository.Job;
import com.ayaantrix.collector.export.service.ExportService;

import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.file.*;
import java.time.*;

@Component
public class ExportWorker {
    private final ExportRepository jobs;
    private final ExportRenderer renderer;
    private final PrivateObjectStorage storage;
    private final Clock clock;
    private final TransactionTemplate tx;

    public ExportWorker(
            ExportRepository jobs,
            ExportRenderer renderer,
            PrivateObjectStorage storage,
            Clock clock,
            PlatformTransactionManager manager) {
        this.jobs = jobs;
        this.renderer = renderer;
        this.storage = storage;
        this.clock = clock;
        this.tx = new TransactionTemplate(manager);
    }

    public boolean dispatchOne() {
        if (!storage.enabled()) return false;
        var optional = tx.execute(s -> jobs.claim(clock.instant()));
        if (optional == null || optional.isEmpty()) return false;
        var j = optional.get();
        Path temp = null;
        String key = key(j, j.attempts());
        boolean published = false;
        try {
            var directory = Path.of(System.getProperty("java.io.tmpdir"), "collector-exports");
            Files.createDirectories(directory);
            if (Files.isSymbolicLink(directory))
                throw new java.io.IOException("Unsafe temporary directory");
            temp = Files.createTempFile(directory, "collector-export-", ".tmp");
            final Instant[] last = {clock.instant()};
            Runnable heartbeat =
                    () -> {
                        if (Duration.between(last[0], clock.instant()).getSeconds() >= 20) {
                            if (!Boolean.TRUE.equals(
                                    tx.execute(s -> jobs.renew(j, clock.instant()))))
                                throw new IllegalStateException("Export lease lost");
                            last[0] = clock.instant();
                        }
                    };
            renderer.generate(j, temp, heartbeat);
            heartbeat.run();
            storage.putFile(key, temp, "application/octet-stream");
            long bytes = Files.size(temp);
            published =
                    Boolean.TRUE.equals(
                            tx.execute(s -> jobs.ready(j, key, bytes, clock.instant())));
        } catch (Exception failed) {
            String code =
                    failed instanceof ExportRenderer.TooLarge
                            ? "EXPORT_TOO_LARGE"
                            : "EXPORT_GENERATION_FAILED";
            tx.executeWithoutResult(
                    s ->
                            jobs.fail(
                                    j,
                                    code,
                                    failed instanceof ExportRenderer.TooLarge,
                                    clock.instant()));
        } finally {
            if (!published) {
                try {
                    // A lost commit acknowledgment must never delete a committed READY artifact.
                    boolean unreferenced =
                            Boolean.TRUE.equals(
                                    tx.execute(
                                            s ->
                                                    jobs.find(j.workspace(), j.project(), j.id())
                                                            .map(
                                                                    current ->
                                                                            !key.equals(
                                                                                    current.key()))
                                                            .orElse(false)));
                    if (unreferenced) storage.deletePrivate(key);
                } catch (RuntimeException ignored) {
                    /* Expiry cleanup retries deterministic attempt keys. */
                }
            }
            if (temp != null)
                try {
                    Files.deleteIfExists(temp);
                } catch (java.io.IOException ignored) {
                    /* Stale files are retried by bounded temporary-file cleanup. */
                }
        }
        return true;
    }

    public void cleanup() {
        if (!storage.enabled()) return;
        cleanupTemporaryFiles();
        tx.executeWithoutResult(
                s -> {
                    for (var j : jobs.expired(clock.instant())) {
                        try {
                            for (int attempt = 1; attempt <= 3; attempt++)
                                storage.deletePrivate(key(j, attempt));
                            jobs.cleaned(j, clock.instant());
                        } catch (RuntimeException ignored) {
                            /* Retry at the next cleanup; never mark a failed deletion clean. */
                        }
                    }
                });
    }

    /** Crash leftovers are older than every valid job; never follow links or recurse. */
    void cleanupTemporaryFiles() {
        var directory = Path.of(System.getProperty("java.io.tmpdir"), "collector-exports");
        if (!Files.isDirectory(directory, LinkOption.NOFOLLOW_LINKS)) return;
        try (var files = Files.newDirectoryStream(directory, "collector-export-*.tmp")) {
            int inspected = 0;
            for (var file : files) {
                if (++inspected > 100) break;
                if (Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)
                        && Files.getLastModifiedTime(file, LinkOption.NOFOLLOW_LINKS)
                                .toInstant()
                                .isBefore(clock.instant().minus(Duration.ofHours(24))))
                    Files.deleteIfExists(file);
            }
        } catch (java.io.IOException ignored) {
            // Retry next sweep; the operating system retains ownership of temporary files.
        }
    }

    private static String key(Job j, int attempt) {
        return "exports/"
                + j.workspace()
                + "/"
                + j.project()
                + "/"
                + j.id()
                + "/attempt-"
                + attempt
                + ExportService.extension(j.format());
    }
}

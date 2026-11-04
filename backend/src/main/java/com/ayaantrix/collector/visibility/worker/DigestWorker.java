package com.ayaantrix.collector.visibility.worker;

import com.ayaantrix.collector.reminder.service.EmailSender;
import com.ayaantrix.collector.visibility.repository.DigestRepository;
import com.ayaantrix.collector.visibility.service.DigestService;
import com.ayaantrix.collector.workspace.repository.WorkspaceRepository;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.*;

@Component
public class DigestWorker {
    private final DigestRepository repo;
    private final DigestService service;
    private final WorkspaceRepository workspaces;
    private final EmailSender sender;
    private final Clock clock;
    private final TransactionTemplate tx;
    private final boolean enabled;

    public DigestWorker(
            DigestRepository repo,
            DigestService service,
            WorkspaceRepository workspaces,
            EmailSender sender,
            Clock clock,
            PlatformTransactionManager manager,
            @Value("${collector.visibility.digest-worker-enabled:false}") boolean enabled) {
        this.repo = repo;
        this.service = service;
        this.workspaces = workspaces;
        this.sender = sender;
        this.clock = clock;
        this.tx = new TransactionTemplate(manager);
        this.enabled = enabled;
    }

    public synchronized boolean dispatchOne() {
        if (!sender.available()) return false;
        var claim =
                tx.execute(
                        t -> {
                            repo.enqueueDue(clock.instant());
                            return repo.claim(clock.instant());
                        });
        if (claim == null || claim.isEmpty()) return false;
        var j = claim.get();
        var message =
                tx.execute(
                        t -> {
                            workspaces.lockInvitationWorkspace(j.workspace());
                            if (!repo.current(j)) return null;
                            var r = repo.recipient(j.workspace(), j.member());
                            if (r.isEmpty()
                                    || !repo.enabled(j.workspace(), j.member())
                                    || !j.date()
                                            .equals(
                                                    clock.instant()
                                                            .atZone(ZoneId.of(r.get().timezone()))
                                                            .toLocalDate())) {
                                repo.finish(
                                        j,
                                        "CANCELLED",
                                        null,
                                        "DIGEST_NOT_ELIGIBLE",
                                        clock.instant());
                                return null;
                            }
                            var projects = service.projects(r.get());
                            if (projects.isEmpty()) {
                                repo.finish(
                                        j,
                                        "CANCELLED",
                                        null,
                                        "NO_ASSIGNED_PROJECTS",
                                        clock.instant());
                                return null;
                            }
                            var body = new StringBuilder("Daily project digest\n\n");
                            for (var p : projects)
                                body.append(p.alias())
                                        .append("\nAwaiting review: ")
                                        .append(p.awaitingReview())
                                        .append("\nAwaiting client action: ")
                                        .append(p.clientAction())
                                        .append("\n")
                                        .append(p.url())
                                        .append("\n\n");
                            if (!repo.prepared(j, clock.instant())) return null;
                            return new EmailSender.Message(
                                    j.id(),
                                    r.get().email(),
                                    r.get().email(),
                                    "Your daily project digest",
                                    body.toString(),
                                    true);
                        });
        if (message == null) return true;
        EmailSender.Result result;
        try {
            result = sender.send(message);
        } catch (RuntimeException unknown) {
            result = new EmailSender.Result("UNKNOWN", null, "SEND_OUTCOME_UNKNOWN");
        }
        var outcome = result;
        String state =
                java.util.Set.of("ACCEPTED", "DELIVERED").contains(outcome.state())
                        ? "ACCEPTED"
                        : outcome.state().equals("FAILED") ? "FAILED" : "UNKNOWN";
        tx.executeWithoutResult(
                t ->
                        repo.finish(
                                j,
                                state,
                                outcome.providerId(),
                                state.equals("UNKNOWN")
                                        ? "SEND_OUTCOME_UNKNOWN"
                                        : state.equals("FAILED") ? "DELIVERY_FAILED" : null,
                                clock.instant()));
        service.reconcile(j.id());
        return true;
    }

    @Scheduled(fixedDelayString = "${collector.visibility.digest-poll-ms:60000}")
    public void tick() {
        if (enabled) for (int n = 0; n < 10 && dispatchOne(); n++) {}
    }
}

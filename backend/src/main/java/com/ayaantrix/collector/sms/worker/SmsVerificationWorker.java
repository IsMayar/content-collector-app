package com.ayaantrix.collector.sms.worker;

import com.ayaantrix.collector.auth.delivery.TokenDeliveryCipher;
import com.ayaantrix.collector.clientaccess.security.ClientAccessAuthorization;
import com.ayaantrix.collector.sms.provider.SmsSender;
import com.ayaantrix.collector.sms.repository.SmsRepository;
import com.ayaantrix.collector.sms.service.*;
import com.ayaantrix.collector.workspace.repository.WorkspaceSubscriptionRepository;

import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.*;
import java.util.*;

@Component
public class SmsVerificationWorker {
    private final SmsRepository repo;
    private final com.ayaantrix.collector.reminder.service.DeliveryReconciliationService
            reconciliation;
    private final SmsSender sender;
    private final SmsService service;
    private final TokenDeliveryCipher cipher;
    private final ClientAccessAuthorization clients;
    private final WorkspaceSubscriptionRepository plans;
    private final Clock clock;
    private final TransactionTemplate tx;
    private final com.ayaantrix.collector.workspace.repository.WorkspaceRepository workspaces;

    public SmsVerificationWorker(
            SmsRepository repo,
            com.ayaantrix.collector.reminder.service.DeliveryReconciliationService reconciliation,
            SmsSender sender,
            SmsService service,
            TokenDeliveryCipher cipher,
            ClientAccessAuthorization clients,
            WorkspaceSubscriptionRepository plans,
            Clock clock,
            PlatformTransactionManager manager,
            com.ayaantrix.collector.workspace.repository.WorkspaceRepository workspaces) {
        this.workspaces = workspaces;
        this.repo = repo;
        this.reconciliation = reconciliation;
        this.sender = sender;
        this.service = service;
        this.cipher = cipher;
        this.clients = clients;
        this.plans = plans;
        this.clock = clock;
        tx = new TransactionTemplate(manager);
    }

    private record Prepared(UUID id, String phone, String body) {
        @Override
        public String toString() {
            return "SmsVerification[" + id + "]";
        }
    }

    public boolean dispatchOne() {
        if (!service.available()) return false;
        for (UUID w : repo.cancelledWorkspaces())
            tx.executeWithoutResult(
                    t -> {
                        workspaces.lockInvitationWorkspace(w);
                        repo.releaseCancelled(w);
                        repo.settleDeliveries(w);
                    });
        var claimed =
                tx.execute(
                        t -> {
                            repo.expire(clock.instant());
                            return repo.claim(clock.instant());
                        });
        if (claimed == null || claimed.isEmpty()) return false;
        var r = claimed.get();
        UUID id = (UUID) r.get("id"),
                w = (UUID) r.get("workspace_id"),
                p = (UUID) r.get("project_id"),
                c = (UUID) r.get("contact_id");
        Prepared prepared;
        try {
            prepared =
                    tx.execute(
                            t -> {
                                var a = clients.available(w, p, c, true);
                                var consent = repo.consent(w, p, c);
                                if (!repo.liveVerification(
                                        id, (UUID) r.get("lease_id"), clock.instant())) return null;
                                if (a.isEmpty()
                                        || !a.get().project().state().name().equals("ACTIVE")
                                        || plans.lockedForWorkspace(w)
                                                .filter(s -> s.writable(clock.instant()))
                                                .isEmpty()
                                        || consent.isEmpty()
                                        || !id.equals(consent.get().verification())
                                        || !consent.get().hash().equals(r.get("phone_hash"))
                                        || !consent.get().status().equals("UNVERIFIED")
                                        || !repo.canVerify(sender.scope(), consent.get().hash())
                                        || !clock.instant()
                                                .isBefore(
                                                        ((java.sql.Timestamp) r.get("expires_at"))
                                                                .toInstant())) {
                                    repo.outcome(id, "FAILED", null, clock.instant());
                                    return null;
                                }
                                repo.destination(
                                        sender.scope(), consent.get().hash(), clock.instant());
                                return new Prepared(
                                        id,
                                        consent.get().phone(),
                                        cipher.decrypt(
                                                (byte[]) r.get("encrypted_payload"),
                                                r.get("encryption_key_id").toString(),
                                                id,
                                                id));
                            });
        } catch (RuntimeException e) {
            tx.executeWithoutResult(t -> repo.outcome(id, "FAILED", null, clock.instant()));
            return true;
        }
        if (prepared == null) return true;
        com.ayaantrix.collector.reminder.service.EmailSender.Result result;
        try {
            result = sender.send(id, prepared.phone(), prepared.body());
        } catch (RuntimeException e) {
            result =
                    new com.ayaantrix.collector.reminder.service.EmailSender.Result(
                            "UNKNOWN", null, "SMS_OUTCOME_UNKNOWN");
        }
        var outcome = result;
        tx.executeWithoutResult(
                t -> {
                    repo.outcome(
                            id,
                            outcome.state().equals("ACCEPTED")
                                    ? "SENT"
                                    : outcome.state().equals("UNKNOWN") ? "UNKNOWN" : "FAILED",
                            outcome.providerId(),
                            clock.instant());
                    reconciliation.storedAttempt(id);
                });
        return true;
    }
}

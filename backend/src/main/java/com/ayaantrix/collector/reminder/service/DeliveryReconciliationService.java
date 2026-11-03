package com.ayaantrix.collector.reminder.service;

import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.repository.*;
import com.ayaantrix.collector.project.repository.ProjectRepository;
import com.ayaantrix.collector.reminder.repository.*;
import com.ayaantrix.collector.reminder.repository.DeliveryReconciliationRepository.Subject;
import com.ayaantrix.collector.sms.provider.SmsSender;
import com.ayaantrix.collector.sms.repository.SmsRepository;
import com.ayaantrix.collector.workspace.repository.WorkspaceRepository;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.*;

@Service
@Transactional
public class DeliveryReconciliationService {
    private final DeliveryReconciliationRepository repo;
    private final ReminderRepository reminders;
    private final SmsRepository sms;
    private final SmsSender sender;
    private final WorkspaceRepository workspaces;
    private final ProjectRepository projects;
    private final AuditRepository audit;
    private final Clock clock;

    public DeliveryReconciliationService(
            DeliveryReconciliationRepository repo,
            ReminderRepository reminders,
            SmsRepository sms,
            SmsSender sender,
            WorkspaceRepository workspaces,
            ProjectRepository projects,
            AuditRepository audit,
            Clock clock) {
        this.repo = repo;
        this.reminders = reminders;
        this.sms = sms;
        this.sender = sender;
        this.workspaces = workspaces;
        this.projects = projects;
        this.audit = audit;
        this.clock = clock;
    }

    private Optional<Subject> scoped(Subject s) {
        if (workspaces.lockInvitationWorkspace(s.workspace()).isEmpty()
                || projects.lockForStructure(s.workspace(), s.project()).isEmpty())
            return Optional.empty();
        return repo.lock(s);
    }

    private boolean destination(Subject s, String recipient) {
        if (recipient == null || recipient.isBlank()) return false;
        String key =
                s.verification()
                        ? IdempotencyRepository.hash(recipient)
                        : s.channel().equals("EMAIL")
                                ? IdempotencyRepository.hash(
                                        recipient.strip().toLowerCase(Locale.ROOT))
                                : IdempotencyRepository.hash(sender.scope() + ":" + recipient);
        return key.equals(s.recipient());
    }

    public static String normalized(String channel, String event) {
        return switch (channel + ":" + event) {
            case "EMAIL:email.sent", "SMS:accepted", "SMS:queued", "SMS:sending", "SMS:sent" ->
                    "ACCEPTED";
            case "EMAIL:email.delivered", "SMS:delivered" -> "DELIVERED";
            case "EMAIL:email.bounced" -> "BOUNCED";
            case "EMAIL:email.complained", "EMAIL:email.suppressed" -> "SUPPRESSED";
            case "EMAIL:email.failed", "SMS:failed", "SMS:undelivered", "SMS:canceled" -> "FAILED";
            default -> null;
        };
    }

    /** Caller must first verify the existing provider signature and canonical URL. */
    public void evidence(
            UUID attempt, String channel, String provider, String recipient, String state) {
        var candidate = attempt == null ? repo.provider(provider, channel) : repo.find(attempt);
        if (candidate.isEmpty()) {
            if (attempt != null) throw mismatch();
            return;
        }
        var locked = scoped(candidate.get());
        if (locked.isEmpty()) return;
        var s = locked.get();
        if (!s.channel().equals(channel)
                || !s.prepared()
                || (attempt != null && !destination(s, recipient))
                || (recipient != null && !recipient.isBlank() && !destination(s, recipient))
                || (s.provider() != null && !s.provider().equals(provider))) throw mismatch();
        if (!Set.of(
                        "SENDING",
                        "UNKNOWN",
                        "ACCEPTED",
                        "SENT",
                        "DELIVERED",
                        "BOUNCED",
                        "SUPPRESSED",
                        "FAILED")
                .contains(s.state())) throw mismatch();
        if (s.provider() == null) {
            if (!repo.bind(s, provider, clock.instant())) return;
            audit.writeAnonymous(
                    s.workspace(),
                    s.project(),
                    s.contact(),
                    "PROVIDER_RECEIPT_BOUND",
                    s.id(),
                    clock.instant());
            s = repo.lock(s).orElseThrow();
        }
        if (state != null) apply(s, state, null, "WEBHOOK");
    }

    public void lookup(Subject claim, Optional<EmailSender.Receipt> receipt) {
        var locked = scoped(claim);
        if (locked.isEmpty()) return;
        var current = locked.get();
        if (!current.state().equals("UNKNOWN") || !Objects.equals(current.lease(), claim.lease()))
            return;
        if (receipt.isEmpty()) {
            repo.unavailable(claim, "PROVIDER_EVIDENCE_UNAVAILABLE", clock.instant());
            return;
        }
        var r = receipt.get();
        if (!Objects.equals(current.provider(), r.providerId())
                || !destination(current, r.recipient())
                || !Set.of("ACCEPTED", "DELIVERED", "BOUNCED", "SUPPRESSED", "FAILED")
                        .contains(r.state())) {
            repo.unavailable(claim, "PROVIDER_EVIDENCE_MISMATCH", clock.instant());
            return;
        }
        apply(current, r.state(), claim.lease(), "LOOKUP");
    }

    private void apply(Subject s, String state, UUID lease, String source) {
        String target =
                s.verification()
                        ? (Set.of("ACCEPTED", "DELIVERED").contains(state) ? "SENT" : "FAILED")
                        : state;
        if (!repo.resolve(s, target, lease, clock.instant())) return;
        audit.writeAnonymous(
                s.workspace(),
                s.project(),
                s.contact(),
                "DELIVERY_RECONCILED_" + source + "_" + target,
                s.id(),
                clock.instant());
        if (!s.verification()
                && s.channel().equals("EMAIL")
                && Set.of("BOUNCED", "SUPPRESSED").contains(state))
            reminders.event(
                    "lookup:" + s.id() + ":" + state,
                    IdempotencyRepository.hash(s.id() + ":" + state),
                    s.provider(),
                    state.equals("BOUNCED") ? "email.bounced" : "email.complained",
                    clock.instant(),
                    clock.instant());
        if (!s.verification() && s.channel().equals("SMS")) sms.settleDeliveries(s.workspace());
    }

    private static ApiException mismatch() {
        return new ApiException(
                HttpStatus.BAD_REQUEST,
                "PROVIDER_EVIDENCE_MISMATCH",
                "Provider evidence does not match the delivery.");
    }

    public boolean stored(Subject claim) {
        var locked = scoped(claim);
        if (locked.isEmpty()) return false;
        var s = locked.get();
        if (!s.state().equals("UNKNOWN") || !Objects.equals(s.lease(), claim.lease())) return false;
        for (String event : repo.events(s)) {
            String state = normalized(s.channel(), event);
            if (state != null) {
                apply(s, state, claim.lease(), "WEBHOOK");
                return true;
            }
        }
        return false;
    }

    public void storedAttempt(UUID id) {
        var candidate = repo.find(id);
        if (candidate.isEmpty()) return;
        var locked = scoped(candidate.get());
        if (locked.isEmpty()) return;
        var s = locked.get();
        if (!s.state().equals("UNKNOWN") || s.provider() == null) return;
        for (String event : repo.events(s)) {
            String state = normalized(s.channel(), event);
            if (state != null) {
                apply(s, state, null, "WEBHOOK");
                return;
            }
        }
    }
}

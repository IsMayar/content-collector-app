package com.ayaantrix.collector.reminder.worker;

import com.ayaantrix.collector.auth.delivery.TokenDeliveryCipher;
import com.ayaantrix.collector.auth.entity.TokenPurpose;
import com.ayaantrix.collector.auth.repository.AccountTokenRepository;
import com.ayaantrix.collector.clientaccess.service.ClientAccessService;
import com.ayaantrix.collector.project.repository.ProjectRepository;
import com.ayaantrix.collector.reminder.repository.ReminderRepository;
import com.ayaantrix.collector.reminder.service.*;
import com.ayaantrix.collector.workspace.repository.*;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.json.JsonMapper;

import java.time.*;
import java.util.*;

@Component
public class ReminderWorker {
    private final ReminderRepository repo;
    private final ReminderService service;
    private final ProjectRepository projects;
    private final WorkspaceRepository workspaces;
    private final WorkspaceSubscriptionRepository plans;
    private final ClientAccessService access;
    private final TokenDeliveryCipher cipher;
    private final AccountTokenRepository tokens;
    private final EmailSender sender;
    private final com.ayaantrix.collector.sms.service.SmsService sms;
    private final JsonMapper json;
    private final Clock clock;
    private final TransactionTemplate tx;
    private final String base;
    private UUID cursor = new UUID(0, 0);

    public ReminderWorker(
            ReminderRepository repo,
            ReminderService service,
            ProjectRepository projects,
            WorkspaceRepository workspaces,
            WorkspaceSubscriptionRepository plans,
            ClientAccessService access,
            TokenDeliveryCipher cipher,
            AccountTokenRepository tokens,
            EmailSender sender,
            com.ayaantrix.collector.sms.service.SmsService sms,
            JsonMapper json,
            Clock clock,
            PlatformTransactionManager transactions,
            @Value("${collector.delivery.app-base-url:http://localhost:5173}") String base) {
        this.repo = repo;
        this.service = service;
        this.projects = projects;
        this.workspaces = workspaces;
        this.plans = plans;
        this.access = access;
        this.cipher = cipher;
        this.tokens = tokens;
        this.sender = sender;
        this.sms = sms;
        this.json = json;
        this.clock = clock;
        tx = new TransactionTemplate(transactions);
        var uri = java.net.URI.create(base);
        if (!"https".equals(uri.getScheme())
                && !("http".equals(uri.getScheme())
                        && Set.of("localhost", "127.0.0.1", "[::1]").contains(uri.getHost())))
            throw new IllegalStateException("Reminder links require HTTPS.");
        if (uri.getRawQuery() != null || uri.getRawFragment() != null || uri.getUserInfo() != null)
            throw new IllegalStateException("Invalid reminder application URL.");
        this.base = base.replaceAll("/+$", "");
    }

    private boolean lock(UUID w, UUID p) {
        return workspaces
                        .lockInvitationWorkspace(w)
                        .filter(x -> x.state().name().equals("ACTIVE"))
                        .isPresent()
                && projects.lockForStructure(w, p).isPresent()
                && plans.lockedForWorkspace(w).filter(x -> x.writable(clock.instant())).isPresent();
    }

    public synchronized void schedule() {
        if (!sender.available() && !sms.available()) return;
        var batch = repo.projects(cursor);
        if (batch.isEmpty()) {
            cursor = new UUID(0, 0);
            return;
        }
        for (var ids : batch) {
            UUID w = ids.get("workspace"), p = ids.get("project");
            tx.executeWithoutResult(
                    t -> {
                        if (!lock(w, p)) {
                            repo.cancel(w, p, null, "PROJECT_UNAVAILABLE", clock.instant());
                            return;
                        }
                        var project = projects.lockForStructure(w, p).orElseThrow();
                        var policy = service.policy(project);
                        for (String channel : List.of("EMAIL", "SMS")) {
                            if (channel.equals("EMAIL") ? !sender.available() : !sms.available())
                                continue;
                            var channelPolicy =
                                    new com.ayaantrix.collector.reminder.dto.ReminderDtos.Policy(
                                            policy.version(),
                                            policy.enabled(),
                                            policy.paused(),
                                            policy.timezone(),
                                            policy.rules().stream()
                                                    .filter(r -> r.channel().equals(channel))
                                                    .toList());
                            for (var c : repo.contacts(w, p)) {
                                if (!service.reasons(project, policy, c, channel, new UUID(0, 0))
                                        .isEmpty()) continue;
                                for (var o :
                                        ReminderCalendar.plan(
                                                project.dueDate(),
                                                channelPolicy,
                                                c.timezone(),
                                                clock.instant())) {
                                    if (repo.exists(
                                            w, p, c.id(), policy.version(), o.rule(), o.date()))
                                        continue;
                                    var dispatch =
                                            o.due().isBefore(clock.instant())
                                                    ? clock.instant()
                                                            .atZone(ZoneId.of(o.timezone()))
                                                            .toLocalDate()
                                                    : o.date();
                                    if (!repo.dayAvailable(
                                            w,
                                            service.recipient(w, p, c, channel),
                                            dispatch,
                                            new UUID(0, 0),
                                            clock.instant())) continue;
                                    var monday =
                                            (o.due().isBefore(clock.instant())
                                                            ? clock.instant()
                                                            : o.due())
                                                    .atZone(ZoneId.of(policy.timezone()))
                                                    .toLocalDate()
                                                    .with(
                                                            java.time.temporal.TemporalAdjusters
                                                                    .previousOrSame(
                                                                            DayOfWeek.MONDAY));
                                    var z = ZoneId.of(policy.timezone());
                                    if (!repo.weekAvailable(
                                            w,
                                            p,
                                            monday.atStartOfDay(z).toInstant(),
                                            monday.plusWeeks(1).atStartOfDay(z).toInstant(),
                                            new UUID(0, 0))) continue;
                                    repo.enqueue(
                                            channel,
                                            w,
                                            p,
                                            c.id(),
                                            policy.version(),
                                            o.rule(),
                                            false,
                                            o.date(),
                                            dispatch,
                                            o.timezone(),
                                            service.recipient(w, p, c, channel),
                                            o.due(),
                                            clock.instant());
                                }
                            }
                        }
                    });
            cursor = p;
        }
    }

    public boolean dispatchOne() {
        if (!sender.available() && !sms.available()) return false;
        var claimed =
                tx.execute(
                        t -> {
                            return repo.claim(clock.instant(), sender.available(), sms.available());
                        });
        if (claimed == null || claimed.isEmpty()) return false;
        var d = claimed.get();
        EmailSender.Message message;
        try {
            message =
                    tx.execute(
                            t -> {
                                if (!lock(d.workspace(), d.project())) {
                                    repo.finish(
                                            d,
                                            "SUPPRESSED",
                                            null,
                                            "PROJECT_UNAVAILABLE",
                                            clock.instant());
                                    return null;
                                }
                                var p =
                                        projects.lockForStructure(d.workspace(), d.project())
                                                .orElseThrow();
                                if (!repo.liveLease(d, clock.instant())) return null;
                                var policy = service.policy(p);
                                var c =
                                        repo.contact(d.workspace(), d.project(), d.contact())
                                                .orElseThrow();
                                if (d.channel().equals("SMS"))
                                    sms.lockDestination(d.workspace(), d.project(), d.contact());
                                var reasons = service.reasons(p, policy, c, d.channel(), d.id());
                                if (d.channel().equals("SMS")
                                        && !d.recipientKey()
                                                .equals(
                                                        service.recipient(
                                                                d.workspace(),
                                                                d.project(),
                                                                c,
                                                                "SMS")))
                                    reasons.add("SMS_DESTINATION_CHANGED");
                                var rule =
                                        policy.rules().stream()
                                                .filter(r -> r.id().equals(d.rule()))
                                                .findFirst();
                                if (!d.manual()
                                        && ReminderCalendar.plan(
                                                        p.dueDate(),
                                                        new com.ayaantrix.collector.reminder.dto
                                                                .ReminderDtos.Policy(
                                                                policy.version(),
                                                                policy.enabled(),
                                                                policy.paused(),
                                                                policy.timezone(),
                                                                policy.rules().stream()
                                                                        .filter(
                                                                                r ->
                                                                                        r.channel()
                                                                                                .equals(
                                                                                                        d
                                                                                                                .channel()))
                                                                        .toList()),
                                                        c.timezone(),
                                                        clock.instant())
                                                .stream()
                                                .noneMatch(
                                                        o ->
                                                                o.rule().equals(d.rule())
                                                                        && o.date()
                                                                                .equals(
                                                                                        d
                                                                                                .occurrence())))
                                    reasons.add("OBSOLETE_OCCURRENCE");
                                var local = clock.instant().atZone(ZoneId.of(d.timezone()));
                                if (!d.manual()
                                        && rule.isPresent()
                                        && rule.get().weekdaysOnly()
                                        && local.getDayOfWeek().getValue() > 5) {
                                    repo.defer(
                                            d,
                                            local.toLocalDate()
                                                    .with(
                                                            java.time.temporal.TemporalAdjusters
                                                                    .next(DayOfWeek.MONDAY))
                                                    .atTime(LocalTime.parse(rule.get().localTime()))
                                                    .atZone(local.getZone())
                                                    .toInstant(),
                                            clock.instant());
                                    return null;
                                }
                                boolean smsQuiet = reasons.remove("SMS_QUIET_WINDOW");
                                if (policy.version() != d.policy()) reasons.add("POLICY_CHANGED");
                                if (!reasons.isEmpty()) {
                                    repo.finish(
                                            d,
                                            "SUPPRESSED",
                                            null,
                                            reasons.getFirst(),
                                            clock.instant());
                                    return null;
                                }
                                if (d.channel().equals("SMS") && smsQuiet) {
                                    repo.defer(
                                            d,
                                            com.ayaantrix.collector.sms.service.SmsRules
                                                    .nextAllowed(clock.instant(), d.timezone()),
                                            clock.instant());
                                    return null;
                                }
                                if (d.encrypted() != null) {
                                    if (tokens.findById(d.token())
                                            .filter(
                                                    token ->
                                                            token.isUsableFor(
                                                                    TokenPurpose.CLIENT_INVITE,
                                                                    clock.instant()))
                                            .isEmpty()) {
                                        repo.finish(
                                                d,
                                                "SUPPRESSED",
                                                null,
                                                "LINK_UNAVAILABLE",
                                                clock.instant());
                                        return null;
                                    }
                                    return json.readValue(
                                            cipher.decrypt(
                                                    d.encrypted(), d.keyId(), d.id(), d.token()),
                                            EmailSender.Message.class);
                                }
                                var link =
                                        access.reminderInvitation(
                                                d.workspace(), d.project(), d.contact());
                                String url = base + "/client/access#token=" + link.raw();
                                var prepared =
                                        new EmailSender.Message(
                                                d.id(),
                                                d.channel().equals("SMS")
                                                        ? sms.consent(
                                                                        d.workspace(),
                                                                        d.project(),
                                                                        d.contact())
                                                                .orElseThrow()
                                                                .phone()
                                                        : c.email(),
                                                d.channel().equals("SMS")
                                                        ? ""
                                                        : repo.replyTo(d.workspace()),
                                                "Your content for "
                                                        + p.title()
                                                        + " is still needed",
                                                "Please complete "
                                                        + service.missing(
                                                                d.workspace(), d.project())
                                                        + " required content items for "
                                                        + p.title()
                                                        + ".\nOpen your project: "
                                                        + url
                                                        + "\n"
                                                        + "Reminder preferences (secure sign-in"
                                                        + " required): "
                                                        + url
                                                        + "&preferences=1");
                                if (d.channel().equals("SMS")) {
                                    prepared =
                                            new EmailSender.Message(
                                                    d.id(),
                                                    prepared.recipient(),
                                                    "",
                                                    "",
                                                    sms.reminderBody(
                                                            p.title(),
                                                            service.missing(
                                                                    d.workspace(), d.project()),
                                                            url));
                                    sms.reserveDelivery(d.workspace(), d.id(), prepared.body());
                                }
                                repo.prepare(
                                        d,
                                        link.token().getId(),
                                        cipher.encrypt(
                                                json.writeValueAsString(prepared),
                                                d.id(),
                                                link.token().getId()),
                                        cipher.keyId(),
                                        clock.instant()
                                                .atZone(ZoneId.of(d.timezone()))
                                                .toLocalDate(),
                                        clock.instant());
                                return prepared;
                            });
        } catch (RuntimeException e) {
            tx.executeWithoutResult(
                    t ->
                            repo.finish(
                                    d,
                                    d.attempts() < 3 ? "QUEUED" : "FAILED",
                                    null,
                                    "PREPARATION_FAILED",
                                    clock.instant()));
            return true;
        }
        if (message == null) return true;
        EmailSender.Result result;
        try {
            result =
                    d.channel().equals("SMS")
                            ? sms.send(d.id(), message.recipient(), message.body())
                            : sender.send(message);
        } catch (RuntimeException e) {
            result = new EmailSender.Result("UNKNOWN", null, "PROVIDER_OUTCOME_UNKNOWN");
        }
        var finalResult = result;
        tx.executeWithoutResult(
                t -> {
                    workspaces.lockInvitationWorkspace(d.workspace());
                    projects.lockForStructure(d.workspace(), d.project());
                    String state =
                            Set.of("ACCEPTED", "UNKNOWN", "FAILED", "QUEUED")
                                            .contains(finalResult.state())
                                    ? finalResult.state()
                                    : "UNKNOWN";
                    if (state.equals("QUEUED") && d.attempts() >= 3) state = "FAILED";
                    repo.finish(
                            d,
                            state,
                            finalResult.providerId(),
                            finalResult.failureCode(),
                            clock.instant());
                    repo.applyEvents(finalResult.providerId(), clock.instant());
                    sms.receipt(finalResult.providerId());
                    sms.settle(d.workspace());
                });
        return true;
    }
}

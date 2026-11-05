package com.ayaantrix.collector.reminder.service;

import com.ayaantrix.collector.clientaccess.security.ClientAccessAuthorization;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.repository.*;
import com.ayaantrix.collector.project.entity.Project;
import com.ayaantrix.collector.project.repository.*;
import com.ayaantrix.collector.project.security.ProjectAuthorization;
import com.ayaantrix.collector.reminder.dto.ReminderDtos.*;
import com.ayaantrix.collector.reminder.repository.ReminderRepository;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;

@Service
@Transactional
public class ReminderService {
    private static final UUID NONE = new UUID(0, 0);
    private final ProjectAuthorization agency;
    private final ProjectRepository projects;
    private final ProjectStructureRepository structure;
    private final ClientAccessAuthorization clients;
    private final ReminderRepository repo;
    private final AuditRepository audit;
    private final IdempotencyRepository requests;
    private final Clock clock;
    private final com.ayaantrix.collector.sms.service.SmsService sms;

    public ReminderService(
            ProjectAuthorization agency,
            ProjectRepository projects,
            ProjectStructureRepository structure,
            ClientAccessAuthorization clients,
            ReminderRepository repo,
            AuditRepository audit,
            IdempotencyRepository requests,
            Clock clock,
            com.ayaantrix.collector.sms.service.SmsService sms) {
        this.sms = sms;
        this.agency = agency;
        this.projects = projects;
        this.structure = structure;
        this.clients = clients;
        this.repo = repo;
        this.audit = audit;
        this.requests = requests;
        this.clock = clock;
    }

    private Project owner(UUID w, UUID p, boolean write) {
        var a = agency.access(w, true);
        if (write) agency.writable(a);
        return projects.lockForStructure(w, p).orElseThrow(ProjectAuthorization::missing);
    }

    public Policy policy(UUID w, UUID p) {
        return policy(owner(w, p, false));
    }

    public Policy policy(Project p) {
        return repo.ensure(p.workspaceId(), p.id(), p.timezone(), p.dueDate(), clock.instant());
    }

    public Policy update(UUID w, UUID p, Update input) {
        var project = owner(w, p, true);
        var previous = policy(project);
        zone(input.timezone());
        var ids = new HashSet<UUID>();
        for (var r : input.rules()) {
            if (!Set.of("EMAIL", "SMS").contains(r.channel()) || !ids.add(r.id())) throw invalid();
            try {
                LocalTime.parse(r.localTime());
            } catch (DateTimeException e) {
                throw invalid();
            }
        }
        if (previous.version() != input.expectedVersion())
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "REMINDER_POLICY_CONFLICT",
                    "Reload the reminder policy before saving.");
        repo.update(
                w,
                p,
                input,
                input.enabled() == null ? previous.enabled() : input.enabled(),
                clock.instant());
        audit.write(
                w,
                p,
                agency.access(w, true).member().userId(),
                "REMINDER_POLICY_UPDATED",
                "PROJECT",
                p,
                Map.of("version", previous.version() + 1),
                clock.instant());
        return policy(project);
    }

    public Preview preview(UUID w, UUID p, Send input) {
        var project = owner(w, p, false);
        var policy = policy(project);
        var c = repo.contact(w, p, input.contactId()).orElseThrow(ProjectAuthorization::missing);
        var reasons = reasons(project, policy, c, input.channel(), NONE);
        long missing = missing(w, p);
        return new Preview(
                input.channel(),
                input.channel().equals("SMS")
                        ? null
                        : "Your content for " + project.title() + " is still needed",
                input.channel().equals("SMS")
                        ? sms.previewBody(project.title(), missing)
                        : "Please complete "
                                + missing
                                + " required content items for "
                                + project.title()
                                + ". A fresh secure project link and reminder preferences link will"
                                + " be included when sent.",
                reasons.isEmpty(),
                reasons,
                input.channel().equals("SMS")
                        ? com.ayaantrix.collector.sms.service.SmsRules.segments(
                                sms.previewBody(project.title(), missing))
                        : null);
    }

    public UUID send(UUID w, UUID p, Send input, String key) {
        var project = owner(w, p, true);
        var actor = agency.access(w, true).member().userId();
        var now = clock.instant();
        String route = "reminder-send:" + p, hash = IdempotencyRepository.hash(input.toString());
        var replay = requests.replay(w, actor, route, key, hash, now);
        if (replay.isPresent()) return UUID.fromString(replay.get().replace("\"", ""));
        var pol = policy(project);
        var c = repo.contact(w, p, input.contactId()).orElseThrow(ProjectAuthorization::missing);
        var reasons = reasons(project, pol, c, input.channel(), NONE);
        if (!reasons.isEmpty())
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "REMINDER_INELIGIBLE",
                    "Reminder unavailable: " + String.join(", ", reasons));
        var zone = zone(c.timezone() == null ? pol.timezone() : c.timezone());
        var day = now.atZone(zone).toLocalDate();
        var id =
                repo.enqueue(
                        input.channel(),
                        w,
                        p,
                        c.id(),
                        pol.version(),
                        UUID.randomUUID(),
                        true,
                        day,
                        day,
                        zone.getId(),
                        recipient(w, p, c, input.channel()),
                        now,
                        now);
        requests.remember(w, actor, route, key, hash, "\"" + id + "\"", 202, now);
        audit.write(
                w, p, actor, "REMINDER_QUEUED", "DELIVERY", id, Map.of("channel", "EMAIL"), now);
        return id;
    }

    public List<String> reasons(
            Project project,
            Policy policy,
            ReminderRepository.Contact c,
            String channel,
            UUID except) {
        var r = new ArrayList<String>();
        UUID w = project.workspaceId(), p = project.id();
        if (!Set.of("EMAIL", "SMS").contains(channel)) r.add("CHANNEL_UNAVAILABLE");
        if (channel.equals("SMS"))
            r.addAll(
                    sms.reasons(
                            w,
                            p,
                            c.id(),
                            com.ayaantrix.collector.sms.service.SmsRules.segments(
                                    sms.previewBody(project.title(), missing(w, p))),
                            !except.equals(NONE) && sms.reserved(except)));
        if (!"ACTIVE".equals(project.state().name())) r.add("PROJECT_NOT_ACTIVE");
        if (!policy.enabled() || policy.paused()) r.add("POLICY_PAUSED");
        if (clients.available(w, p, c.id(), true).isEmpty()) r.add("GRANT_UNAVAILABLE");
        if (channel.equals("EMAIL") && !c.emailEnabled()) r.add("EMAIL_DISABLED");
        if (channel.equals("EMAIL") && c.suppression() != null) r.add("EMAIL_SUPPRESSED");
        if (missing(w, p) == 0) r.add("NO_CLIENT_ACTION");
        var now = clock.instant();
        var zone = zone(c.timezone() == null ? policy.timezone() : c.timezone());
        if (!repo.dayAvailable(
                w, recipient(w, p, c, channel), now.atZone(zone).toLocalDate(), except, now))
            r.add("DAILY_LIMIT");
        var monday =
                now.atZone(zone(policy.timezone()))
                        .toLocalDate()
                        .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        if (!repo.weekAvailable(
                w,
                p,
                monday.atStartOfDay(zone(policy.timezone())).toInstant(),
                monday.plusWeeks(1).atStartOfDay(zone(policy.timezone())).toInstant(),
                except)) r.add("WEEKLY_LIMIT");
        return r;
    }

    public long missing(UUID w, UUID p) {
        return structure.progress(w, List.of(p)).get(p).clientActionRequired();
    }

    public static String recipient(ReminderRepository.Contact c) {
        return IdempotencyRepository.hash(c.email().toLowerCase(Locale.ROOT));
    }

    public String recipient(UUID w, UUID p, ReminderRepository.Contact c, String channel) {
        return channel.equals("SMS") ? sms.numberKey(w, p, c.id()) : recipient(c);
    }

    public Map<String, Object> history(UUID w, UUID p, int page, int size) {
        owner(w, p, false);
        if (page < 0 || size < 1 || size > 100 || page > 100000) throw invalid();
        var data = repo.history(w, p, page, size);
        return Map.of(
                "data",
                data,
                "page",
                Map.of("page", page, "size", size, "totalElements", repo.historyCount(w, p)));
    }

    public Preferences preferences(String cookie, UUID p) {
        var a = clients.notificationSession(cookie, p);
        return prefs(
                a.grant().workspace(),
                p,
                a.grant().contact(),
                repo.contact(a.grant().workspace(), p, a.grant().contact())
                        .orElseThrow(ProjectAuthorization::missing));
    }

    public Preferences preferences(String cookie, UUID p, ChangePreferences input) {
        var a = clients.notificationSession(cookie, p);
        if (input.timezone() != null) zone(input.timezone());
        repo.preferences(a.grant().workspace(), p, a.grant().contact(), input, clock.instant());
        sms.timezoneChanged(a.grant().workspace(), p, a.grant().contact(), input.timezone());
        audit.writeClient(
                a.grant().workspace(),
                p,
                a.grant().contact(),
                "REMINDER_PREFERENCES_UPDATED",
                a.grant().contact(),
                clock.instant());
        return prefs(
                a.grant().workspace(),
                p,
                a.grant().contact(),
                repo.contact(a.grant().workspace(), p, a.grant().contact())
                        .orElseThrow(ProjectAuthorization::missing));
    }

    private Preferences prefs(UUID w, UUID p, UUID contact, ReminderRepository.Contact c) {
        return new Preferences(
                c.emailEnabled(),
                c.timezone(),
                sms.status(w, p, contact),
                c.suppression(),
                sms.available(),
                com.ayaantrix.collector.sms.service.SmsService.CONSENT_VERSION,
                sms.usage(w));
    }

    public static ZoneId zone(String zone) {
        try {
            return ZoneId.of(zone);
        } catch (Exception e) {
            throw invalid();
        }
    }

    private static ApiException invalid() {
        return new ApiException(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_FAILED",
                "Reminder settings are invalid; only email rules are supported.");
    }
}

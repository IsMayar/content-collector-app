package com.ayaantrix.collector.sms.service;

import com.ayaantrix.collector.auth.delivery.TokenDeliveryCipher;
import com.ayaantrix.collector.auth.service.AccountRequestLimiter;
import com.ayaantrix.collector.clientaccess.security.ClientAccessAuthorization;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.repository.*;
import com.ayaantrix.collector.reminder.service.EmailSender.Result;
import com.ayaantrix.collector.sms.dto.SmsDtos.*;
import com.ayaantrix.collector.sms.provider.SmsSender;
import com.ayaantrix.collector.sms.repository.SmsRepository;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;

@Service
@Transactional
public class SmsService {
    public static final String CONSENT_VERSION = "2026-11-03";
    private final SmsRepository repo;
    private final SmsSender sender;
    private final ClientAccessAuthorization clients;
    private final TokenDeliveryCipher cipher;
    private final AccountRequestLimiter limits;
    private final IdempotencyRepository requests;
    private final AuditRepository audit;
    private final Clock clock;
    private final byte[] pepper;
    private final int trial;
    private final long rate, budget;
    private final String base;
    private final com.ayaantrix.collector.workspace.repository.WorkspaceSubscriptionRepository
            plans;

    public SmsService(
            SmsRepository repo,
            SmsSender sender,
            ClientAccessAuthorization clients,
            TokenDeliveryCipher cipher,
            AccountRequestLimiter limits,
            IdempotencyRepository requests,
            AuditRepository audit,
            Clock clock,
            @Value("${collector.auth.token-hash-pepper:}") String pepper,
            @Value("${collector.workspace.trial-sms-segments:0}") int trial,
            @Value("${collector.sms.segment-cost-microusd:0}") long rate,
            @Value("${collector.sms.monthly-budget-microusd:0}") long budget,
            @Value("${collector.delivery.app-base-url:http://127.0.0.1:5173}") String base,
            com.ayaantrix.collector.workspace.repository.WorkspaceSubscriptionRepository plans) {
        this.plans = plans;
        this.repo = repo;
        this.base = base.replaceAll("/+$", "");
        this.sender = sender;
        this.clients = clients;
        this.cipher = cipher;
        this.limits = limits;
        this.requests = requests;
        this.audit = audit;
        this.clock = clock;
        this.pepper = pepper.isBlank() ? new byte[0] : Base64.getDecoder().decode(pepper);
        this.trial = trial;
        this.rate = rate;
        this.budget = budget;
    }

    public boolean available() {
        return sender.available() && pepper.length >= 32 && rate > 0 && budget > 0;
    }

    public String scope() {
        return sender.scope();
    }

    public SmsRepository.Budget budget(UUID w) {
        return repo.budget(w, trial, budget);
    }

    public String digest(UUID id, String code) {
        try {
            var mac = javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(new javax.crypto.spec.SecretKeySpec(pepper, "HmacSHA256"));
            return HexFormat.of()
                    .formatHex(mac.doFinal((id + ":" + code).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("SMS verification unavailable.");
        }
    }

    public UUID start(String cookie, UUID p, Start input, String key) {
        var access = clients.require(cookie, p);
        UUID w = access.grant().workspace(), c = access.grant().contact();
        var now = clock.instant();
        String route = "sms-verification:" + p,
                hash =
                        IdempotencyRepository.hash(
                                input.phoneE164()
                                        + ":"
                                        + input.consentTextVersion()
                                        + ":"
                                        + input.consent());
        var replay = requests.replay(w, c, route, key, hash, now);
        if (replay.isPresent()) return UUID.fromString(replay.get().replace("\"", ""));
        if (plans.lockedForWorkspace(w).filter(s -> s.writable(now)).isEmpty())
            throw error("WORKSPACE_READ_ONLY", "SMS changes are unavailable.");
        if (!available()) throw error("SMS_UNAVAILABLE", "SMS reminders are unavailable.");
        if (!input.consent() || !CONSENT_VERSION.equals(input.consentTextVersion()))
            throw error(
                    "SMS_CONSENT_REQUIRED", "Accept the current project reminder consent text.");
        String phone;
        try {
            phone = SmsRules.usPhone(input.phoneE164());
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", e.getMessage());
        }
        if (!access.project().state().name().equals("ACTIVE"))
            throw error("PROJECT_NOT_ACTIVE", "SMS verification requires an active project.");
        String zone = timezone(w, p, c);
        if (zone == null)
            throw error(
                    "SMS_TIMEZONE_REQUIRED",
                    "Save and confirm your timezone before verifying your phone.");
        String destination = IdempotencyRepository.hash(phone);
        repo.destination(scope(), destination, now);
        if (!repo.canVerify(scope(), destination))
            throw error(
                    "SMS_SUPPRESSED",
                    "Reply START to the messaging service, then request a new verification.");
        limits.check("SMS_VERIFY_CONTACT", c.toString(), 1);
        limits.check("SMS_VERIFY_PHONE", scope() + ":" + destination, 1);
        if (repoCount(w, c, now) >= 5)
            throw error(
                    "SMS_VERIFICATION_LIMIT",
                    "Too many verification requests; try again tomorrow.");
        UUID id = UUID.randomUUID();
        String code = String.format(Locale.ROOT, "%06d", new SecureRandom().nextInt(1000000));
        String body =
                "Content Collector: "
                        + code
                        + " is your verification code. It expires in 10 minutes. Do not share this"
                        + " code.";
        int segments = SmsRules.segments(body);
        long cost = Math.multiplyExact(rate, segments);
        var b = budget(w);
        if (!repo.reserve(w, b, segments, cost))
            throw error(
                    "SMS_ALLOWANCE_EXHAUSTED",
                    "SMS allowance or spending limit reached; email preferences are unchanged.");
        repo.consent(
                w, p, c, phone, destination, scope(), zone, input.consentTextVersion(), id, now);
        repo.verification(
                id,
                w,
                p,
                c,
                destination,
                digest(id, code),
                cipher.encrypt(body, id, id),
                cipher.keyId(),
                b,
                segments,
                cost,
                now);
        repo.event(
                "consent:" + id,
                w,
                p,
                c,
                scope(),
                destination,
                "CONSENT_CAPTURED",
                null,
                input.consentTextVersion(),
                now);
        audit.writeClient(w, p, c, "SMS_VERIFICATION_REQUESTED", id, now);
        requests.remember(w, c, route, key, hash, "\"" + id + "\"", 202, now);
        return id;
    }

    private int repoCount(UUID w, UUID c, Instant now) {
        return repo.recent(w, c, now);
    }

    private String timezone(UUID w, UUID p, UUID c) {
        return repo.timezone(w, p, c);
    }

    public String confirm(String cookie, UUID p, Confirm input) {
        var a = clients.require(cookie, p);
        var g = a.grant();
        var now = clock.instant();
        var consent =
                repo.consent(g.workspace(), p, g.contact())
                        .orElseThrow(
                                () ->
                                        error(
                                                "SMS_VERIFICATION_UNAVAILABLE",
                                                "Request a new verification."));
        repo.destination(scope(), consent.hash(), now);
        var r = repo.verification(g.workspace(), p, g.contact(), input.verificationId());
        if (!input.verificationId().equals(consent.verification())
                || r.isEmpty()
                || !"SENT".equals(r.get("state"))
                || !now.isBefore(((java.sql.Timestamp) r.get("expires_at")).toInstant())
                || !consent.hash().equals(r.get("phone_hash"))
                || !repo.canVerify(scope(), consent.hash())
                || !repo.freshConsent(scope(), consent.hash(), consent.consented())
                || !a.project().state().name().equals("ACTIVE"))
            throw error("SMS_VERIFICATION_UNAVAILABLE", "Request a new verification.");
        if (!repo.attempt(input.verificationId()))
            throw error("SMS_VERIFICATION_LIMIT", "Request a new verification.");
        if (!MessageDigest.isEqual(
                digest(input.verificationId(), input.code()).getBytes(StandardCharsets.US_ASCII),
                r.get("code_hash").toString().getBytes(StandardCharsets.US_ASCII)))
            return "INVALID_CODE";
        repo.verified(
                g.workspace(),
                p,
                g.contact(),
                input.verificationId(),
                scope(),
                consent.hash(),
                now);
        repo.event(
                "verified:" + input.verificationId(),
                g.workspace(),
                p,
                g.contact(),
                scope(),
                consent.hash(),
                "PHONE_VERIFIED",
                null,
                CONSENT_VERSION,
                now);
        audit.writeClient(
                g.workspace(), p, g.contact(), "SMS_CONSENT_VERIFIED", input.verificationId(), now);
        return "VERIFIED_OPTED_IN";
    }

    public void withdraw(String cookie, UUID p) {
        var a = clients.notificationSession(cookie, p);
        repo.withdraw(a.grant().workspace(), p, a.grant().contact(), clock.instant());
        repo.event(
                "withdraw:" + UUID.randomUUID(),
                a.grant().workspace(),
                p,
                a.grant().contact(),
                scope(),
                null,
                "WITHDRAWN",
                null,
                CONSENT_VERSION,
                clock.instant());
        audit.writeClient(
                a.grant().workspace(),
                p,
                a.grant().contact(),
                "SMS_CONSENT_WITHDRAWN",
                a.grant().contact(),
                clock.instant());
    }

    public String status(UUID w, UUID p, UUID c) {
        var consent = repo.consent(w, p, c);
        if (consent.isEmpty()) return available() ? "NOT_CONFIGURED" : "UNAVAILABLE";
        var s = consent.get();
        if (repo.suppressed(s.scope(), s.hash(), s.verified())) return "OPTED_OUT";
        return available() ? s.status() : "UNAVAILABLE";
    }

    public Optional<SmsRepository.Consent> consent(UUID w, UUID p, UUID c) {
        return repo.consent(w, p, c);
    }

    public List<String> reasons(UUID w, UUID p, UUID c, int segments, boolean reserved) {
        var r = new ArrayList<String>();
        if (!available()) r.add("SMS_UNAVAILABLE");
        var optional = repo.consent(w, p, c);
        if (optional.isEmpty()) {
            r.add("SMS_NOT_VERIFIED");
            return r;
        }
        var s = optional.get();
        if (!s.scope().equals(scope()) || !status(w, p, c).equals("VERIFIED_OPTED_IN"))
            r.add("SMS_NOT_VERIFIED");
        String zone = timezone(w, p, c);
        if (zone == null || !zone.equals(s.timezone())) r.add("SMS_TIMEZONE_RECONFIRM");
        if (SmsRules.quiet(clock.instant(), s.timezone())) r.add("SMS_QUIET_WINDOW");
        if (!reserved
                && !repo.available(w, budget(w), segments, Math.multiplyExact(rate, segments)))
            r.add("SMS_ALLOWANCE_EXHAUSTED");
        return r;
    }

    public Map<String, Object> preferences(UUID w, UUID p, UUID c) {
        return Map.of(
                "smsAvailable",
                available(),
                "smsConsentTextVersion",
                CONSENT_VERSION,
                "smsUsage",
                repo.usage(w, budget(w)));
    }

    public static ApiException error(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message);
    }

    public boolean reserved(UUID id) {
        return repo.hasReservation(id);
    }

    public void reserveDelivery(UUID w, UUID id, String body) {
        int segments = SmsRules.segments(body);
        if (!repo.reserveDelivery(w, id, budget(w), segments, Math.multiplyExact(rate, segments)))
            throw error("SMS_ALLOWANCE_EXHAUSTED", "SMS allowance or spending limit reached.");
    }

    public void settle(UUID workspace) {
        repo.settleDeliveries(workspace);
    }

    public Result send(UUID id, String phone, String body) {
        return sender.send(id, phone, body);
    }

    public String numberKey(UUID w, UUID p, UUID c) {
        return repo.consent(w, p, c)
                .map(x -> IdempotencyRepository.hash(x.scope() + ":" + x.phone()))
                .orElse("sms-unavailable:" + c);
    }

    public String reminderBody(String title, long missing, String url) {
        return "Content Collector: "
                + title
                + " needs "
                + missing
                + " required content items. Open your secure project: "
                + url
                + " Reply STOP to opt out. HELP for help.";
    }

    public void receipt(String sid) {
        repo.replayStatus(sid, clock.instant());
    }

    public void timezoneChanged(UUID w, UUID p, UUID c, String zone) {
        repo.timezoneChanged(w, p, c, zone);
    }

    public void lockDestination(UUID w, UUID p, UUID c) {
        repo.consent(w, p, c)
                .ifPresent(s -> repo.destination(s.scope(), s.hash(), clock.instant()));
    }

    public Map<String, Object> usage(UUID w) {
        return repo.usage(w, budget(w));
    }

    public String previewBody(String title, long missing) {
        return reminderBody(title, missing, base + "/client/access#token=" + "X".repeat(43));
    }
}

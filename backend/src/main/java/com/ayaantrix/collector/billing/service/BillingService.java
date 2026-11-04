package com.ayaantrix.collector.billing.service;

import com.ayaantrix.collector.auth.delivery.TokenDeliveryCipher;
import com.ayaantrix.collector.billing.repository.BillingRepository;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.repository.IdempotencyRepository;
import com.ayaantrix.collector.project.security.ProjectAuthorization;
import com.ayaantrix.collector.workspace.entity.*;
import com.ayaantrix.collector.workspace.repository.*;
import com.ayaantrix.collector.workspace.service.WorkspaceService;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;

@Service
public class BillingService {
    private final BillingRepository repo;
    private final ProjectAuthorization auth;
    private final WorkspaceService workspaces;
    private final WorkspaceRepository workspaceRepo;
    private final WorkspaceMemberRepository members;
    private final WorkspaceInvitationRepository invitations;
    private final BillingProvider provider;
    private final TokenDeliveryCipher cipher;
    private final Clock clock;
    private final TransactionTemplate tx;

    public BillingService(
            BillingRepository repo,
            ProjectAuthorization auth,
            WorkspaceService workspaces,
            WorkspaceRepository workspaceRepo,
            WorkspaceMemberRepository members,
            WorkspaceInvitationRepository invitations,
            BillingProvider provider,
            TokenDeliveryCipher cipher,
            Clock clock,
            PlatformTransactionManager manager) {
        this.repo = repo;
        this.auth = auth;
        this.workspaces = workspaces;
        this.workspaceRepo = workspaceRepo;
        this.members = members;
        this.invitations = invitations;
        this.provider = provider;
        this.cipher = cipher;
        this.clock = clock;
        tx = new TransactionTemplate(manager);
    }

    public Map<String, Object> read(UUID w) {
        return tx.execute(
                s -> {
                    auth.access(w, true);
                    var row = repo.subscription(w);
                    var dto = new LinkedHashMap<String, Object>();
                    dto.put("planKey", row.get("plan_key"));
                    dto.put("state", effectiveState(row, clock.instant()));
                    dto.put("currentPeriodStart", instant(row, "current_period_start"));
                    dto.put("currentPeriodEnd", instant(row, "current_period_end"));
                    dto.put("cancelAtPeriodEnd", row.get("cancel_at_period_end"));
                    dto.put("graceEndsAt", instant(row, "grace_ends_at"));
                    dto.put("readOnlyEndsAt", instant(row, "read_only_ends_at"));
                    return Map.of(
                            "subscription", dto, "entitlements", workspaces.read(w).entitlements());
                });
    }

    private record Intent(UUID id, UUID actor, String customer, String url) {}

    public String hosted(UUID w, PlanKey plan, String key) {
        IdempotencyRepository.validKey(key);
        String kind = plan == null ? "PORTAL" : "CHECKOUT";
        String hash = IdempotencyRepository.hash(kind + ":" + plan);
        Intent intent =
                tx.execute(
                        s -> {
                            var access = auth.access(w, true);
                            if (!Set.of(Workspace.State.ACTIVE, Workspace.State.READ_ONLY)
                                    .contains(access.workspace().state()))
                                throw conflict("BILLING_UNAVAILABLE");
                            UUID actor = access.member().userId();
                            Instant now = clock.instant();
                            repo.ensure(w, now);
                            var account = repo.account(w);
                            var previous = repo.operation(w, actor, kind, key);
                            if (!previous.isEmpty()) {
                                var op = previous.getFirst();
                                if (!hash.equals(op.get("request_hash")))
                                    throw conflict("IDEMPOTENCY_KEY_REUSED");
                                UUID id = (UUID) op.get("id");
                                if (op.get("encrypted_url") != null
                                        && now.isBefore(instant(op, "url_expires_at")))
                                    return new Intent(
                                            id,
                                            actor,
                                            null,
                                            cipher.decrypt(
                                                    (byte[]) op.get("encrypted_url"),
                                                    (String) op.get("encryption_key_id"),
                                                    id,
                                                    w));
                                if (op.get("url_expires_at") != null)
                                    throw conflict("BILLING_SESSION_EXPIRED");
                                if (now.isBefore(instant(op, "lease_until")))
                                    throw conflict("BILLING_OPERATION_RUNNING");
                                if (!now.isBefore(
                                        instant(op, "created_at").plus(Duration.ofHours(23))))
                                    throw conflict("BILLING_RECONCILIATION_REQUIRED");
                                repo.lease(id, now);
                                return new Intent(
                                        id, actor, (String) account.get("customer_id"), null);
                            }
                            if (plan != null) {
                                seats(w, plan, now);
                                if (repo.checkoutPending(w, now))
                                    throw conflict("BILLING_CHECKOUT_PENDING");
                            }
                            if (plan == null && account.get("customer_id") == null)
                                throw conflict("BILLING_CUSTOMER_REQUIRED");
                            var attempted = instant(account, "customer_attempted_at");
                            if (account.get("customer_id") == null
                                    && attempted != null
                                    && !now.isBefore(attempted.plus(Duration.ofHours(23))))
                                throw conflict("BILLING_RECONCILIATION_REQUIRED");
                            UUID id = UUID.randomUUID();
                            repo.operation(
                                    id,
                                    w,
                                    actor,
                                    kind,
                                    plan == null ? null : plan.name(),
                                    key,
                                    hash,
                                    now);
                            if (account.get("customer_id") == null) repo.attemptedCustomer(w, now);
                            return new Intent(id, actor, (String) account.get("customer_id"), null);
                        });
        if (intent.url() != null) return intent.url();
        try {
            String customer = intent.customer() == null ? provider.customer(w) : intent.customer();
            if (customer == null || !customer.matches("cus_[A-Za-z0-9]+"))
                throw StripeBillingProvider.unavailable();
            tx.executeWithoutResult(
                    s -> {
                        auth.access(w, true);
                        repo.account(w);
                        repo.customer(w, customer, clock.instant());
                    });
            if (plan != null) {
                var existing = provider.current(customer);
                if (existing != null
                        && !Set.of("canceled", "incomplete_expired").contains(existing.state()))
                    throw conflict("BILLING_SUBSCRIPTION_EXISTS");
            }
            String url =
                    plan == null
                            ? provider.portal(w, intent.id(), customer)
                            : provider.checkout(w, intent.id(), customer, plan);
            return tx.execute(
                    s -> {
                        var access = auth.access(w, true);
                        if (!Set.of(Workspace.State.ACTIVE, Workspace.State.READ_ONLY)
                                .contains(access.workspace().state()))
                            throw conflict("BILLING_UNAVAILABLE");
                        if (!intent.actor().equals(access.member().userId()))
                            throw conflict("ACCESS_DENIED");
                        repo.account(w);
                        if (plan != null) seats(w, plan, clock.instant());
                        repo.complete(
                                intent.id(),
                                cipher.encrypt(url, intent.id(), w),
                                cipher.keyId(),
                                clock.instant());
                        return url;
                    });
        } catch (RuntimeException failure) {
            tx.executeWithoutResult(s -> repo.release(intent.id(), clock.instant()));
            throw failure;
        }
    }

    private void seats(UUID w, PlanKey plan, Instant now) {
        if (members.countByWorkspaceIdAndState(w, WorkspaceMember.State.ACTIVE)
                        + invitations.reserved(w, now)
                > plan.seats()) throw conflict("PLAN_SEAT_CONFLICT");
    }

    /** Durable, fenced claim; provider reads hold no database transaction or tenant locks. */
    public void reconcile(UUID w) {
        UUID lease = UUID.randomUUID();
        var claim = tx.execute(s -> repo.claim(w, lease, clock.instant()));
        if (claim == null) return;
        String customer = (String) claim.get("customer_id");
        long watermark = (Long) claim.get("watermark");
        try {
            var snapshot = provider.current(customer);
            tx.executeWithoutResult(
                    s -> {
                        workspaceRepo.lockInvitationWorkspace(w).orElseThrow();
                        var account = repo.account(w);
                        Instant now = clock.instant();
                        if (!lease.equals(account.get("lease_id"))
                                || !now.isBefore(instant(account, "lease_until"))) return;
                        if (snapshot != null) {
                            if (!w.equals(snapshot.workspace())
                                    || !repo.checkoutMatches(
                                            w, snapshot.checkout(), snapshot.plan().name())
                                    || !snapshot.end().isAfter(snapshot.start()))
                                throw StripeBillingProvider.unavailable();
                            var old = repo.subscription(w);
                            String state;
                            Instant start = snapshot.start(),
                                    end = snapshot.end(),
                                    grace = null,
                                    readOnly = null,
                                    delinquent = null;
                            switch (snapshot.state()) {
                                case "active" -> {
                                    if (!snapshot.paid()) throw StripeBillingProvider.unavailable();
                                    state = "ACTIVE";
                                }
                                case "trialing" -> {
                                    if (Duration.between(start, end).compareTo(Duration.ofDays(14))
                                            > 0) throw StripeBillingProvider.unavailable();
                                    state = "TRIALING";
                                }
                                case "past_due" -> {
                                    if (account.get("fingerprint") == null)
                                        throw StripeBillingProvider.unavailable();
                                    start = instant(old, "current_period_start");
                                    end = instant(old, "current_period_end");
                                    delinquent = instant(account, "delinquent_since");
                                    if (delinquent == null)
                                        delinquent = end.isBefore(now) ? end : now;
                                    grace = delinquent.plus(Duration.ofDays(7));
                                    if (grace.isBefore(end)) grace = end;
                                    state = now.isBefore(grace) ? "PAST_DUE" : "READ_ONLY";
                                    readOnly = grace.plus(Duration.ofDays(30));
                                }
                                case "canceled", "unpaid", "paused", "incomplete_expired" -> {
                                    state = "READ_ONLY";
                                    readOnly = end.plus(Duration.ofDays(30));
                                }
                                case "incomplete" -> {
                                    repo.reconciled(w, customer, watermark, now);
                                    return;
                                }
                                default -> throw StripeBillingProvider.unavailable();
                            }
                            seats(w, snapshot.plan(), now);
                            String fingerprint =
                                    IdempotencyRepository.hash(
                                            snapshot.id()
                                                    + ":"
                                                    + snapshot.plan()
                                                    + ":"
                                                    + state
                                                    + ":"
                                                    + start
                                                    + ":"
                                                    + end
                                                    + ":"
                                                    + grace
                                                    + ":"
                                                    + snapshot.cancelAtPeriodEnd());
                            if (!fingerprint.equals(account.get("fingerprint")))
                                repo.apply(
                                        w,
                                        snapshot.plan().name(),
                                        state,
                                        start,
                                        end,
                                        grace,
                                        readOnly,
                                        snapshot.cancelAtPeriodEnd(),
                                        delinquent,
                                        fingerprint,
                                        now);
                        }

                        repo.reconciled(w, customer, watermark, now);
                    });
        } catch (RuntimeException failure) {
            tx.executeWithoutResult(s -> repo.retry(w, lease, clock.instant()));
            throw failure;
        }
    }

    public void tick() {
        var due = tx.execute(s -> repo.due(clock.instant()));
        for (UUID w : due)
            try {
                reconcile(w);
            } catch (RuntimeException failure) {
                // The fenced reconcile failure already scheduled its bounded retry.
            }
        tx.executeWithoutResult(s -> repo.cleanup(clock.instant()));
    }

    private static String effectiveState(Map<String, Object> row, Instant now) {
        String state = (String) row.get("state");
        Instant until =
                instant(row, state.equals("PAST_DUE") ? "grace_ends_at" : "current_period_end");
        return Set.of("TRIALING", "ACTIVE", "PAST_DUE").contains(state)
                        && (until == null || !now.isBefore(until))
                ? "READ_ONLY"
                : state;
    }

    public static Instant instant(Map<String, Object> row, String key) {
        return row.get(key) == null ? null : ((Timestamp) row.get(key)).toInstant();
    }

    private static ApiException conflict(String code) {
        return new ApiException(
                HttpStatus.CONFLICT,
                code,
                "Billing state changed. Refresh or contact your workspace owner.");
    }
}

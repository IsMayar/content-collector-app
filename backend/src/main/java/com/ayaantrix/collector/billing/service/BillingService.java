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
    private final WorkspaceSubscriptionRepository plans;
    private final com.ayaantrix.collector.billing.repository.PlanChangeRepository changes;

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
            PlatformTransactionManager manager,
            WorkspaceSubscriptionRepository plans,
            com.ayaantrix.collector.billing.repository.PlanChangeRepository changes) {
        this.changes = changes;
        this.repo = repo;
        this.auth = auth;
        this.workspaces = workspaces;
        this.workspaceRepo = workspaceRepo;
        this.members = members;
        this.invitations = invitations;
        this.provider = provider;
        this.cipher = cipher;
        this.clock = clock;
        this.plans = plans;
        tx = new TransactionTemplate(manager);
    }

    public Map<String, Object> read(UUID w) {
        return tx.execute(
                s -> {
                    auth.access(w, true);
                    var plan = plans.findByWorkspaceId(w).orElseThrow();
                    var row = repo.subscription(w);
                    var dto = new LinkedHashMap<String, Object>();
                    boolean free=plan.effectiveState(clock.instant())==WorkspaceSubscription.State.FREE;
                    dto.put("planKey", plan.effectivePlan(clock.instant()));
                    dto.put("state", plan.effectiveState(clock.instant()));
                    dto.put("currentPeriodStart", free?null:instant(row, "current_period_start"));
                    dto.put("currentPeriodEnd", free?null:instant(row, "current_period_end"));
                    dto.put("cancelAtPeriodEnd", !free && Boolean.TRUE.equals(row.get("cancel_at_period_end")));
                    dto.put("pendingChange", changes.pending(w).map(c -> Map.of("planKey", c.target(), "effectiveAt", c.effectiveAt(), "state", c.state())).orElse(null));
                    dto.put("graceEndsAt", instant(row, "grace_ends_at"));
                    dto.put(
                            "readOnlyEndsAt",
                            plan.effectiveState(clock.instant())
                                            == WorkspaceSubscription.State.READ_ONLY
                                    ? plan.readOnlyDeadline()
                                    : instant(row, "read_only_ends_at"));
                    return Map.of(
                            "subscription", dto, "entitlements", workspaces.read(w).entitlements());
                });
    }

    public com.ayaantrix.collector.billing.dto.BillingDtos.Usage usage(UUID w) {
        return tx.execute(
                s -> {
                    auth.access(w, true);
                    var now = clock.instant();
                    var month =
                            now.atZone(ZoneOffset.UTC)
                                    .withDayOfMonth(1)
                                    .toLocalDate()
                                    .atStartOfDay(ZoneOffset.UTC);
                    var counters = repo.usage(w, month.toInstant());
                    var period = repo.subscription(w);
                    var limits = workspaces.read(w).entitlements();
                    return new com.ayaantrix.collector.billing.dto.BillingDtos.Usage(
                            limits.planKey()==PlanKey.FREE?month.toInstant():instant(period, "current_period_start"),
                            limits.planKey()==PlanKey.FREE?month.plusMonths(1).toInstant():instant(period, "current_period_end"),
                            number(counters, "storage_used_bytes"),
                            number(counters, "storage_reserved_bytes"),
                            limits.storageLimitBytes(),
                            number(counters, "ai_used"),
                            limits.aiDraftAllowance(),
                            number(counters, "sms_used"),
                            limits.smsSegmentAllowance(),
                            members.countByWorkspaceIdAndState(w, WorkspaceMember.State.ACTIVE),
                            invitations.reserved(w, now),
                            limits.seats(),
                            number(counters, "ai_reserved"),
                            number(counters, "sms_reserved"),
                            month.toInstant(),
                            month.plusMonths(1).toInstant(),
                            auth.entitlements().projects(w),
                            limits.activeProjectLimit(),
                            auth.entitlements().contacts(w),
                            limits.clientContactLimit());
                });
    }

    private static long number(Map<String, Object> row, String key) {
        return ((Number) row.get(key)).longValue();
    }

    private record Intent(UUID id, UUID actor, String customer, String url) {}

    public String hosted(UUID w, PlanKey plan, String key) {
        if(plan==PlanKey.FREE)throw conflict("FREE_REQUIRES_NO_CHECKOUT");
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
                                if (changes.pending(w).isPresent()) throw conflict("BILLING_PLAN_CHANGE_PENDING");
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
        auth.entitlements().validateTarget(w, plan);
        if (members.countByWorkspaceIdAndState(w, WorkspaceMember.State.ACTIVE)
                        + invitations.reserved(w, now)
                > plan.seats()) throw conflict("PLAN_SEAT_CONFLICT");
    }

    public Map<String,Object> retryPlanChange(UUID w) {
        var pending = tx.execute(s -> {
            var access = auth.access(w, true);
            repo.account(w);
            var change = changes.pending(w).orElseThrow(() -> conflict("BILLING_PLAN_CHANGE_NOT_FOUND"));
            if (!change.actor().equals(access.member().userId()))
                throw conflict("BILLING_RECONCILIATION_REQUIRED");
            return change;
        });
        return changePlan(w, pending.target(), pending.effectiveAt(), pending.key());
    }

    public Map<String,Object> changePlan(UUID w, PlanKey target, Instant expectedRenewal, String key) {
        if(target == PlanKey.FREE) throw conflict("USE_PERIOD_END_CANCELLATION");
        IdempotencyRepository.validKey(key);
        String customer = tx.execute(s -> {
            auth.access(w,true);
            repo.ensure(w,clock.instant());
            String value=(String)repo.account(w).get("customer_id");
            if(value==null)throw conflict("BILLING_CUSTOMER_REQUIRED");
            return value;
        });
        var source=provider.current(customer);
        var change=tx.execute(s -> {
            var access=auth.access(w,true);
            if(access.workspace().state()!=Workspace.State.ACTIVE)throw conflict("BILLING_UNAVAILABLE");
            var now=clock.instant();
            var account=repo.account(w);
            var local=repo.subscription(w);
            if(!"ACTIVE".equals(local.get("state")))throw conflict("BILLING_SUBSCRIPTION_CHANGED");
            if(!customer.equals(account.get("customer_id")))throw conflict("BILLING_RECONCILIATION_REQUIRED");
            var previous=changes.replay(w,access.member().userId(),key);
            if(previous.isPresent()) {
                var c=previous.get();
                if(c.target()!=target || !c.effectiveAt().equals(expectedRenewal))throw conflict("IDEMPOTENCY_KEY_REUSED");
                if(!c.state().equals("REQUESTED"))return c;
                if(now.isBefore(c.lease()))throw conflict("BILLING_OPERATION_RUNNING");
                if(!now.isBefore(c.createdAt().plus(Duration.ofHours(23))))throw conflict("BILLING_RECONCILIATION_REQUIRED");
            } else if(changes.pending(w).isPresent())throw conflict("BILLING_PLAN_CHANGE_PENDING");
            if(source==null || !w.equals(source.workspace()) || !"active".equals(source.state())
                    || !source.paid() || source.cancelAtPeriodEnd() || source.plan()==target
                    || !source.end().equals(expectedRenewal) || !now.isBefore(source.end())
                    || !source.plan().name().equals(local.get("plan_key"))
                    || !repo.checkoutMatches(w,source.checkout(),source.plan().name())
                        && !changes.matches(w,source.checkout(),source.id(),source.plan(),source.start()))
                throw conflict("BILLING_SUBSCRIPTION_CHANGED");
            seats(w,target,now);
            if(previous.isPresent()) {
                var c=previous.get();
                if(!c.subscription().equals(source.id()) || !c.checkout().equals(source.checkout()))throw conflict("BILLING_SUBSCRIPTION_CHANGED");
                changes.lease(w,c.id(),now);
                return c;
            }
            var c=new com.ayaantrix.collector.billing.repository.PlanChangeRepository.Change(UUID.randomUUID(),access.member().userId(),key,target,source.id(),source.checkout(),source.end(),"REQUESTED",null,now.plusSeconds(90),now);
            changes.create(w,c,now);
            return c;
        });
        if(!change.state().equals("REQUESTED"))return Map.of("planKey",change.target(),"effectiveAt",change.effectiveAt(),"state",change.state());
        try {
            String schedule=provider.schedule(w,change.id(),customer,source,target);
            if(schedule==null || !schedule.matches("sub_sched_[A-Za-z0-9]+"))throw StripeBillingProvider.unavailable();
            tx.executeWithoutResult(s -> {
                var access=auth.access(w,true);
                repo.account(w);
                if(!access.member().userId().equals(change.actor()))throw conflict("ACCESS_DENIED");
                if (!changes.scheduled(w,change.id(),schedule,clock.instant()))
                    throw conflict("BILLING_SUBSCRIPTION_CHANGED");
            });
            return Map.of("planKey",target,"effectiveAt",change.effectiveAt(),"state","SCHEDULED");
        } catch(RuntimeException failure) {
            // Keep the intent and reduced admission limits until the unknown outcome is reconciled.
            tx.executeWithoutResult(s -> changes.release(w,change.id(),clock.instant()));
            throw failure;
        }
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
                                    || (!repo.checkoutMatches(w, snapshot.checkout(), snapshot.plan().name())
                                        && !changes.matches(w,snapshot.checkout(),snapshot.id(),snapshot.plan(),snapshot.start()))
                                    || !snapshot.end().isAfter(snapshot.start()))
                                throw StripeBillingProvider.unavailable();
                            var old = repo.subscription(w);
                            // Provider reconciliation cannot lift an administrative suspension.
                            if("SUSPENDED".equals(old.get("state"))){repo.reconciled(w,customer,watermark,now);return;}
                            String state;
                            PlanKey effectivePlan=snapshot.plan();
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
                                    effectivePlan=PlanKey.valueOf((String)old.get("plan_key"));
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
                                case "canceled" -> {
                                    // Preserve an already paid period; never extend it from local time.
                                    if(snapshot.paid() && now.isBefore(end)) state="ACTIVE";
                                    else {state="FREE";effectivePlan=PlanKey.FREE;}
                                }
                                case "incomplete_expired" -> {
                                    state="FREE";
                                    effectivePlan=PlanKey.FREE;
                                }
                                case "unpaid", "paused" -> {
                                    state = "READ_ONLY";
                                    readOnly = end.plus(Duration.ofDays(30));
                                }
                                case "incomplete" -> {
                                    repo.reconciled(w, customer, watermark, now);
                                    return;
                                }
                                default -> throw StripeBillingProvider.unavailable();
                            }
                            // Reconciliation never deletes collaborators or refuses a confirmed cancellation.
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
                                        effectivePlan.name(),
                                        state,
                                        start,
                                        end,
                                        grace,
                                        readOnly,
                                        state.equals("FREE")?false:snapshot.cancelAtPeriodEnd(),
                                        delinquent,
                                        fingerprint,
                                        now);
                            if("ACTIVE".equals(state) && snapshot.paid()) changes.applied(w,snapshot.checkout(),now);
                            if("FREE".equals(state)) changes.cancelled(w,snapshot.id(),now);
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

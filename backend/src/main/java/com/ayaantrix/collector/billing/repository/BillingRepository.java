package com.ayaantrix.collector.billing.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.*;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;

@Repository
@Transactional(propagation = Propagation.MANDATORY)
public class BillingRepository {
    private final JdbcTemplate jdbc;

    public BillingRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public static Timestamp time(Instant t) {
        return Timestamp.from(t);
    }

    public void ensure(UUID w, Instant now) {
        jdbc.update(
                "insert into collector.billing_accounts(workspace_id,next_reconcile_at,created_at)"
                        + " values(?,?,?) on conflict do nothing",
                w,
                time(now),
                time(now));
    }

    public Map<String, Object> account(UUID w) {
        return jdbc.queryForMap(
                "select * from collector.billing_accounts where workspace_id=? for update", w);
    }

    public Map<String, Object> subscription(UUID w) {
        return jdbc.queryForMap(
                "select"
                    + " plan_key,state,current_period_start,current_period_end,grace_ends_at,read_only_ends_at,cancel_at_period_end"
                    + " from collector.subscriptions where workspace_id=?",
                w);
    }

    public List<Map<String, Object>> operation(UUID w, UUID actor, String kind, String key) {
        return jdbc.queryForList(
                "select * from collector.billing_operations where workspace_id=? and actor_id=? and"
                        + " kind=? and idempotency_key=? for update",
                w,
                actor,
                kind,
                key);
    }

    public void operation(
            UUID id,
            UUID w,
            UUID actor,
            String kind,
            String plan,
            String key,
            String hash,
            Instant now) {
        jdbc.update(
                "insert into"
                    + " collector.billing_operations(id,workspace_id,actor_id,kind,plan_key,idempotency_key,request_hash,lease_until,created_at)"
                    + " values(?,?,?,?,?,?,?,?,?)",
                id,
                w,
                actor,
                kind,
                plan,
                key,
                hash,
                time(now.plusSeconds(90)),
                time(now));
    }

    public void lease(UUID id, Instant now) {
        jdbc.update(
                "update collector.billing_operations set lease_until=? where id=?",
                time(now.plusSeconds(90)),
                id);
    }

    public boolean checkoutPending(UUID w, Instant now) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        "select exists(select 1 from collector.billing_operations where"
                                + " workspace_id=? and kind='CHECKOUT' and created_at>?)",
                        Boolean.class,
                        w,
                        time(now.minus(Duration.ofHours(24)))));
    }

    public void attemptedCustomer(UUID w, Instant now) {
        jdbc.update(
                "update collector.billing_accounts set"
                        + " customer_attempted_at=coalesce(customer_attempted_at,?) where"
                        + " workspace_id=?",
                time(now),
                w);
    }

    public void customer(UUID w, String customer, Instant now) {
        jdbc.update(
                "update collector.billing_accounts set customer_id=?,next_reconcile_at=? where"
                        + " workspace_id=?",
                customer,
                time(now),
                w);
    }

    public void complete(UUID id, byte[] encrypted, String key, Instant now) {
        jdbc.update(
                "update collector.billing_operations set"
                        + " encrypted_url=?,encryption_key_id=?,url_expires_at=case when"
                        + " kind='CHECKOUT' then created_at+interval '23 hours' else ?"
                        + " end,lease_until=? where id=?",
                encrypted,
                key,
                time(now.plusSeconds(180)),
                time(now),
                id);
    }

    public void release(UUID id, Instant now) {
        jdbc.update(
                "update collector.billing_operations set lease_until=? where id=? and encrypted_url"
                        + " is null",
                time(now),
                id);
    }

    public boolean checkoutMatches(UUID w, UUID id, String plan) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        "select exists(select 1 from collector.billing_operations where"
                                + " workspace_id=? and id=? and kind='CHECKOUT' and plan_key=?)",
                        Boolean.class,
                        w,
                        id,
                        plan));
    }

    public String event(String id, String hash, String type, String customer, Instant now) {
        int added =
                jdbc.update(
                        "insert into"
                            + " collector.billing_events(event_id,body_hash,event_type,customer_id,received_at)"
                            + " values(?,?,?,?,?) on conflict do nothing",
                        id,
                        hash,
                        type,
                        customer,
                        time(now));
        if (added == 0)
            return jdbc.queryForObject(
                    "select body_hash from collector.billing_events where event_id=?",
                    String.class,
                    id);
        jdbc.update(
                "update collector.billing_accounts set next_reconcile_at=least(next_reconcile_at,?)"
                        + " where customer_id=?",
                time(now),
                customer);
        return hash;
    }

    public List<UUID> due(Instant now) {
        return jdbc.queryForList(
                "select workspace_id from collector.billing_accounts where customer_id is not null"
                    + " and next_reconcile_at<=? and (lease_until is null or lease_until<=?) order"
                    + " by next_reconcile_at limit 20",
                UUID.class,
                time(now),
                time(now));
    }

    public Map<String, Object> claim(UUID w, UUID lease, Instant now) {
        var rows =
                jdbc.queryForList(
                        "select * from collector.billing_accounts where workspace_id=? and"
                            + " customer_id is not null and next_reconcile_at<=? and (lease_until"
                            + " is null or lease_until<=?) for update skip locked",
                        w,
                        time(now),
                        time(now));
        if (rows.isEmpty()) return null;
        var row = rows.getFirst();
        jdbc.update(
                "update collector.billing_accounts set lease_id=?,lease_until=? where"
                        + " workspace_id=?",
                lease,
                time(now.plusSeconds(60)),
                w);
        row.put(
                "watermark",
                jdbc.queryForObject(
                        "select coalesce(max(sequence),0) from collector.billing_events where"
                                + " customer_id=?",
                        Long.class,
                        row.get("customer_id")));
        return row;
    }

    public void retry(UUID w, UUID lease, Instant now) {
        jdbc.update(
                "update collector.billing_accounts set"
                    + " failure_code='BILLING_RECONCILIATION_FAILED',next_reconcile_at=?,lease_id=null,lease_until=null"
                    + " where workspace_id=? and lease_id=?",
                time(now.plusSeconds(300)),
                w,
                lease);
    }

    public void apply(
            UUID w,
            String plan,
            String state,
            Instant start,
            Instant end,
            Instant grace,
            Instant readOnly,
            boolean cancel,
            Instant delinquent,
            String fingerprint,
            Instant now) {
        jdbc.update(
                "update collector.subscriptions set"
                    + " plan_key=?,state=?,current_period_start=?,current_period_end=?,grace_ends_at=?,read_only_ends_at=?,cancel_at_period_end=?,updated_at=?"
                    + " where workspace_id=?",
                plan,
                state,
                time(start),
                time(end),
                grace == null ? null : time(grace),
                readOnly == null ? null : time(readOnly),
                cancel,
                time(now),
                w);
        jdbc.update(
                "update collector.billing_accounts set delinquent_since=?,fingerprint=? where"
                        + " workspace_id=?",
                delinquent == null ? null : time(delinquent),
                fingerprint,
                w);
        jdbc.update(
                "insert into"
                    + " collector.audit_logs(id,workspace_id,actor_kind,action,resource_kind,resource_id,metadata_json,created_at,updated_at)"
                    + " select"
                    + " ?,workspace_id,'SYSTEM','SUBSCRIPTION_RECONCILED','SUBSCRIPTION',id,jsonb_build_object('state',state,'planKey',plan_key),?,?"
                    + " from collector.subscriptions where workspace_id=?",
                UUID.randomUUID(),
                time(now),
                time(now),
                w);
    }

    public void reconciled(UUID w, String customer, long watermark, Instant now) {
        jdbc.update(
                "update collector.billing_accounts set"
                    + " failure_code=null,lease_id=null,lease_until=null,next_reconcile_at=case"
                    + " when exists(select 1 from collector.billing_events where customer_id=? and"
                    + " processed_at is null and sequence>?) then ?::timestamptz else"
                    + " ?::timestamptz end where workspace_id=?",
                customer,
                watermark,
                time(now),
                time(now.plusSeconds(900)),
                w);
        jdbc.update(
                "update collector.billing_events set processed_at=? where customer_id=? and"
                        + " sequence<=? and processed_at is null",
                time(now),
                customer,
                watermark);
    }

    public void cleanup(Instant now) {
        jdbc.update(
                "update collector.billing_operations set encrypted_url=null,encryption_key_id=null"
                        + " where url_expires_at<=? and encrypted_url is not null",
                time(now));
        jdbc.update(
                "delete from collector.billing_events where received_at<?",
                time(now.minus(Duration.ofDays(30))));
    }
}

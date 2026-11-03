package com.ayaantrix.collector.sms.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;

@Repository
public class SmsRepository {
    private final JdbcTemplate jdbc;

    public SmsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Consent(
            UUID workspace,
            UUID project,
            UUID contact,
            String phone,
            String hash,
            String scope,
            String status,
            String timezone,
            UUID verification,
            Instant consented,
            Instant verified) {
        @Override
        public String toString() {
            return "SmsConsent[" + contact + "]";
        }
    }

    public Optional<Consent> consent(UUID w, UUID p, UUID c) {
        return jdbc
                .query(
                        "select * from collector.sms_consents where workspace_id=? and project_id=?"
                                + " and contact_id=?",
                        (r, n) ->
                                new Consent(
                                        w,
                                        p,
                                        c,
                                        r.getString("phone_e164"),
                                        r.getString("phone_hash"),
                                        r.getString("sender_scope"),
                                        r.getString("status"),
                                        r.getString("timezone"),
                                        r.getObject("active_verification_id", UUID.class),
                                        r.getTimestamp("consented_at").toInstant(),
                                        r.getTimestamp("verified_at") == null
                                                ? null
                                                : r.getTimestamp("verified_at").toInstant()),
                        w,
                        p,
                        c)
                .stream()
                .findFirst();
    }

    public boolean suppressed(String scope, String hash, Instant verified) {
        return jdbc.queryForObject(
                "select exists(select 1 from collector.sms_destinations where sender_scope=? and"
                        + " phone_hash=? and (suppressed or (?::timestamptz is not null and"
                        + " last_stop_at>=?)))",
                Boolean.class,
                scope,
                hash,
                ts(verified),
                ts(verified));
    }

    public boolean canVerify(String scope, String hash) {
        return !jdbc.queryForObject(
                "select exists(select 1 from collector.sms_destinations where sender_scope=? and"
                        + " phone_hash=? and suppressed and (start_seen_at is null or"
                        + " start_seen_at<=last_stop_at))",
                Boolean.class,
                scope,
                hash);
    }

    public void destination(String scope, String hash, Instant now) {
        jdbc.update(
                "insert into collector.sms_destinations(sender_scope,phone_hash,updated_at)"
                        + " values(?,?,?) on conflict do nothing",
                scope,
                hash,
                ts(now));
        jdbc.queryForObject(
                "select phone_hash from collector.sms_destinations where sender_scope=? and"
                        + " phone_hash=? for update",
                String.class,
                scope,
                hash);
    }

    public void consent(
            UUID w,
            UUID p,
            UUID c,
            String phone,
            String hash,
            String scope,
            String zone,
            String version,
            UUID verification,
            Instant now) {
        jdbc.update(
                "insert into"
                    + " collector.sms_consents(workspace_id,project_id,contact_id,active_verification_id,phone_e164,phone_hash,sender_scope,status,timezone,consent_text_version,purpose,consented_at,updated_at)"
                    + " values(?,?,?,?,?,?,?,'UNVERIFIED',?,?,'PROJECT_REMINDERS',?,?) on"
                    + " conflict(contact_id) do update set"
                    + " active_verification_id=excluded.active_verification_id,phone_e164=excluded.phone_e164,phone_hash=excluded.phone_hash,sender_scope=excluded.sender_scope,status='UNVERIFIED',timezone=excluded.timezone,consent_text_version=excluded.consent_text_version,consented_at=excluded.consented_at,verified_at=null,withdrawn_at=null,updated_at=excluded.updated_at",
                w,
                p,
                c,
                verification,
                phone,
                hash,
                scope,
                zone,
                version,
                ts(now),
                ts(now));
        cancel(w, p, c, now);
        jdbc.update(
                "update collector.sms_verifications set"
                    + " state='REVOKED',encrypted_payload=null,updated_at=? where workspace_id=?"
                    + " and project_id=? and contact_id=? and state in ('QUEUED','SENT')",
                ts(now),
                w,
                p,
                c);
    }

    public void event(
            String key,
            UUID w,
            UUID p,
            UUID c,
            String scope,
            String hash,
            String type,
            String provider,
            String version,
            Instant now) {
        jdbc.update(
                "insert into"
                    + " collector.sms_events(event_key,workspace_id,project_id,contact_id,sender_scope,phone_hash,event_type,provider_id,consent_text_version,purpose,created_at)"
                    + " values(?,?,?,?,?,?,?,?,?,'PROJECT_REMINDERS',?) on conflict do nothing",
                key,
                w,
                p,
                c,
                scope,
                hash,
                type,
                provider,
                version,
                ts(now));
    }

    public void cancel(UUID w, UUID p, UUID c, Instant now) {
        jdbc.update(
                "update collector.reminder_deliveries set"
                    + " state='CANCELLED',failure_code='SMS_CONSENT_CHANGED',encrypted_payload=null,updated_at=?"
                    + " where workspace_id=? and project_id=? and contact_id=? and channel='SMS'"
                    + " and state='QUEUED'",
                ts(now),
                w,
                p,
                c);
    }

    public void withdraw(UUID w, UUID p, UUID c, Instant now) {
        jdbc.update(
                "update collector.sms_consents set status='OPTED_OUT',withdrawn_at=?,updated_at=?"
                        + " where workspace_id=? and project_id=? and contact_id=?",
                ts(now),
                ts(now),
                w,
                p,
                c);
        jdbc.update(
                "update collector.sms_verifications set"
                    + " state='REVOKED',encrypted_payload=null,updated_at=? where workspace_id=?"
                    + " and project_id=? and contact_id=? and state in ('QUEUED','SENT')",
                ts(now),
                w,
                p,
                c);
        cancel(w, p, c, now);
    }

    public record Budget(LocalDate period, int allowance, long limit) {}

    public Budget budget(UUID w, int trial, long limit) {
        return jdbc.queryForObject(
                "select current_period_start,plan_key,state from collector.subscriptions where"
                        + " workspace_id=?",
                (r, n) ->
                        new Budget(
                                r.getTimestamp(1).toInstant().atZone(ZoneOffset.UTC).toLocalDate(),
                                r.getString(3).equals("TRIALING")
                                        ? trial
                                        : com.ayaantrix.collector.workspace.entity.PlanKey.valueOf(
                                                        r.getString(2))
                                                .smsSegments(),
                                limit),
                w);
    }

    public boolean reserve(UUID w, Budget b, int segments, long cost) {
        jdbc.update(
                "insert into collector.sms_usage(workspace_id,period) values(?,?) on conflict do"
                        + " nothing",
                w,
                b.period());
        return jdbc.update(
                        "update collector.sms_usage set"
                            + " reserved_segments=reserved_segments+?,reserved_microusd=reserved_microusd+?"
                            + " where workspace_id=? and period=? and"
                            + " used_segments+reserved_segments+?<=? and"
                            + " spent_microusd+reserved_microusd+?<=?",
                        segments,
                        cost,
                        w,
                        b.period(),
                        segments,
                        b.allowance(),
                        cost,
                        b.limit())
                == 1;
    }

    public boolean available(UUID w, Budget b, int segments, long cost) {
        return jdbc.queryForObject(
                "select coalesce((select used_segments+reserved_segments+?<=? and"
                        + " spent_microusd+reserved_microusd+?<=? from collector.sms_usage where"
                        + " workspace_id=? and period=?),?<=? and ?<=?)",
                Boolean.class,
                segments,
                b.allowance(),
                cost,
                b.limit(),
                w,
                b.period(),
                segments,
                b.allowance(),
                cost,
                b.limit());
    }

    public void settle(UUID w, LocalDate period, int segments, long cost, boolean charged) {
        jdbc.update(
                "update collector.sms_usage set"
                    + " reserved_segments=reserved_segments-?,reserved_microusd=reserved_microusd-?,used_segments=used_segments+?,spent_microusd=spent_microusd+?"
                    + " where workspace_id=? and period=?",
                segments,
                cost,
                charged ? segments : 0,
                charged ? cost : 0,
                w,
                period);
    }

    public void verification(
            UUID id,
            UUID w,
            UUID p,
            UUID c,
            String hash,
            String digest,
            byte[] encrypted,
            String key,
            Budget budget,
            int segments,
            long cost,
            Instant now) {
        jdbc.update(
                "insert into"
                    + " collector.sms_verifications(id,workspace_id,project_id,contact_id,phone_hash,code_hash,encrypted_payload,encryption_key_id,state,expires_at,usage_period,segments,reserved_cost,created_at,updated_at)"
                    + " values(?,?,?,?,?,?,?,?,'QUEUED',?,?,?,?,?,?)",
                id,
                w,
                p,
                c,
                hash,
                digest,
                encrypted,
                key,
                ts(now.plusSeconds(600)),
                budget.period(),
                segments,
                cost,
                ts(now),
                ts(now));
    }

    public Map<String, Object> verification(UUID w, UUID p, UUID c, UUID id) {
        return jdbc
                .queryForList(
                        "select * from collector.sms_verifications where workspace_id=? and"
                                + " project_id=? and contact_id=? and id=? for update",
                        w,
                        p,
                        c,
                        id)
                .stream()
                .findFirst()
                .orElse(Map.of());
    }

    public Optional<Map<String, Object>> claim(Instant now) {
        var rows =
                jdbc.queryForList(
                        "select * from collector.sms_verifications where state='QUEUED' order by"
                                + " created_at for update skip locked limit 1");
        if (rows.isEmpty()) return Optional.empty();
        var r = rows.getFirst();
        jdbc.update(
                "update collector.sms_verifications set"
                        + " state='SENDING',lease_id=?,lease_until=?,updated_at=? where id=?",
                UUID.randomUUID(),
                ts(now.plusSeconds(120)),
                ts(now),
                r.get("id"));
        return Optional.of(
                jdbc.queryForMap(
                        "select * from collector.sms_verifications where id=?", r.get("id")));
    }

    public void outcome(UUID id, String state, String provider, Instant now) {
        var rows =
                jdbc.queryForList(
                        "update collector.sms_verifications set"
                            + " state=?,provider_id=?,encrypted_payload=null,settled=true,lease_id=null,lease_until=null,updated_at=?"
                            + " where id=? and state='SENDING' and not settled returning"
                            + " workspace_id,usage_period,segments,reserved_cost",
                        state,
                        provider,
                        ts(now),
                        id);
        for (var r : rows)
            settle(
                    (UUID) r.get("workspace_id"),
                    ((java.sql.Date) r.get("usage_period")).toLocalDate(),
                    (int) r.get("segments"),
                    (long) r.get("reserved_cost"),
                    Set.of("SENT", "UNKNOWN").contains(state));
    }

    public void expire(Instant now) {
        var rows =
                jdbc.queryForList(
                        "select id from collector.sms_verifications where state='SENDING' and"
                                + " lease_until<=? for update skip locked",
                        ts(now));
        for (var r : rows) outcome((UUID) r.get("id"), "UNKNOWN", null, now);
    }

    public boolean attempt(UUID id) {
        return jdbc.update(
                        "update collector.sms_verifications set attempts=attempts+1 where id=? and"
                                + " attempts<5",
                        id)
                == 1;
    }

    public void verified(UUID w, UUID p, UUID c, UUID id, String scope, String hash, Instant now) {
        jdbc.update(
                "update collector.sms_verifications set"
                        + " state='VERIFIED',encrypted_payload=null,updated_at=? where id=?",
                ts(now),
                id);
        jdbc.update(
                "update collector.sms_consents set"
                    + " status='VERIFIED_OPTED_IN',verified_at=?,updated_at=? where workspace_id=?"
                    + " and project_id=? and contact_id=?",
                ts(now),
                ts(now),
                w,
                p,
                c);
        jdbc.update(
                "update collector.sms_destinations set suppressed=false,updated_at=? where"
                        + " sender_scope=? and phone_hash=? and (last_stop_at is null or"
                        + " start_seen_at>last_stop_at)",
                ts(now),
                scope,
                hash);
    }

    public void inbound(String sid, String scope, String hash, String type, Instant now) {
        destination(scope, hash, now);
        if (jdbc.queryForObject(
                "select exists(select 1 from collector.sms_events where event_key=?)",
                Boolean.class,
                "inbound:" + sid)) return;
        event("inbound:" + sid, null, null, null, scope, hash, type, sid, null, now);
        if (type.equals("STOP")) {
            jdbc.update(
                    "update collector.sms_destinations set"
                        + " suppressed=true,last_stop_at=?,updated_at=? where sender_scope=? and"
                        + " phone_hash=?",
                    ts(now),
                    ts(now),
                    scope,
                    hash);
            jdbc.update(
                    "update collector.reminder_deliveries d set"
                        + " state='SUPPRESSED',failure_code='SMS_STOP',encrypted_payload=null,updated_at=?"
                        + " where d.channel='SMS' and d.state='QUEUED' and exists(select 1 from"
                        + " collector.sms_consents c where c.workspace_id=d.workspace_id and"
                        + " c.project_id=d.project_id and c.contact_id=d.contact_id and"
                        + " c.sender_scope=? and c.phone_hash=?)",
                    ts(now),
                    scope,
                    hash);
        } else if (type.equals("START"))
            jdbc.update(
                    "update collector.sms_destinations set start_seen_at=?,updated_at=? where"
                            + " sender_scope=? and phone_hash=?",
                    ts(now),
                    ts(now),
                    scope,
                    hash);
    }

    public Map<String, Object> usage(UUID w, Budget b) {
        var rows =
                jdbc.queryForList(
                        "select used_segments,reserved_segments,spent_microusd,reserved_microusd"
                                + " from collector.sms_usage where workspace_id=? and period=?",
                        w,
                        b.period());
        return Map.of(
                "allowance",
                b.allowance(),
                "spendingLimitMicrousd",
                b.limit(),
                "usedSegments",
                rows.isEmpty() ? 0 : rows.getFirst().get("used_segments"),
                "reservedSegments",
                rows.isEmpty() ? 0 : rows.getFirst().get("reserved_segments"));
    }

    public static Timestamp ts(Instant t) {
        return t == null ? null : Timestamp.from(t);
    }

    public String timezone(UUID w, UUID p, UUID c) {
        return jdbc.queryForObject(
                "select timezone from collector.project_contacts where workspace_id=? and"
                        + " project_id=? and id=?",
                String.class,
                w,
                p,
                c);
    }

    public int recent(UUID w, UUID c, Instant now) {
        return jdbc.queryForObject(
                "select count(*) from collector.sms_verifications where workspace_id=? and"
                        + " contact_id=? and created_at>?",
                Integer.class,
                w,
                c,
                ts(now.minusSeconds(86400)));
    }

    public void releaseCancelled(UUID workspace) {
        var rows =
                jdbc.queryForList(
                        "update collector.sms_verifications set settled=true,encrypted_payload=null"
                            + " where state in ('REVOKED','EXPIRED','FAILED') and not settled and"
                            + " workspace_id=? returning"
                            + " workspace_id,usage_period,segments,reserved_cost",
                        workspace);
        for (var r : rows)
            settle(
                    (UUID) r.get("workspace_id"),
                    ((java.sql.Date) r.get("usage_period")).toLocalDate(),
                    (int) r.get("segments"),
                    (long) r.get("reserved_cost"),
                    false);
    }

    public void status(String sid, String state, Instant now) {
        if (!Set.of("delivered", "undelivered", "failed", "sent", "queued", "accepted")
                .contains(state)) return;
        String key = "status:" + sid + ":" + state;
        if (jdbc.queryForObject(
                "select exists(select 1 from collector.sms_events where event_key=?)",
                Boolean.class,
                key)) return;
        event(key, null, null, null, "provider", null, state, sid, null, now);
        if (state.equals("delivered"))
            jdbc.update(
                    "update collector.reminder_deliveries set state='DELIVERED',updated_at=? where"
                        + " channel='SMS' and provider_id=? and state in ('ACCEPTED','UNKNOWN')",
                    ts(now),
                    sid);
        else if (Set.of("failed", "undelivered").contains(state))
            jdbc.update(
                    "update collector.reminder_deliveries set"
                        + " state='FAILED',failure_code='SMS_UNDELIVERED',updated_at=? where"
                        + " channel='SMS' and provider_id=? and state in ('ACCEPTED','UNKNOWN')",
                    ts(now),
                    sid);
    }

    public boolean liveVerification(UUID id, UUID lease, Instant now) {
        return jdbc.queryForObject(
                "select exists(select 1 from collector.sms_verifications where id=? and lease_id=?"
                        + " and state='SENDING' and lease_until>?)",
                Boolean.class,
                id,
                lease,
                ts(now));
    }

    public boolean hasReservation(UUID id) {
        return jdbc.queryForObject(
                "select sms_period is not null from collector.reminder_deliveries where id=?",
                Boolean.class,
                id);
    }

    public boolean reserveDelivery(UUID w, UUID id, Budget b, int segments, long cost) {
        if (hasReservation(id)) return true;
        if (!reserve(w, b, segments, cost)) return false;
        jdbc.update(
                "update collector.reminder_deliveries set"
                    + " sms_period=?,sms_segments=?,sms_reserved_cost=? where workspace_id=? and"
                    + " id=? and channel='SMS'",
                b.period(),
                segments,
                cost,
                w,
                id);
        return true;
    }

    public void settleDeliveries(UUID workspace) {
        var rows =
                jdbc.queryForList(
                        "update collector.reminder_deliveries set sms_settled=true where"
                            + " channel='SMS' and sms_period is not null and not sms_settled and"
                            + " workspace_id=? and state not in ('QUEUED','SENDING') returning"
                            + " workspace_id,sms_period,sms_segments,sms_reserved_cost,state,provider_id",
                        workspace);
        for (var r : rows)
            settle(
                    (UUID) r.get("workspace_id"),
                    ((java.sql.Date) r.get("sms_period")).toLocalDate(),
                    (int) r.get("sms_segments"),
                    (long) r.get("sms_reserved_cost"),
                    r.get("provider_id") != null
                            || Set.of("ACCEPTED", "DELIVERED", "UNKNOWN").contains(r.get("state")));
    }

    public void replayStatus(String sid, Instant now) {
        if (sid == null) return;
        var events =
                jdbc.queryForList(
                        "select event_type from collector.sms_events where provider_id=? and"
                                + " event_key like 'status:%' order by created_at",
                        String.class, sid);
        for (String state : events) {
            if (state.equals("delivered"))
                jdbc.update(
                        "update collector.reminder_deliveries set state='DELIVERED',updated_at=?"
                                + " where channel='SMS' and provider_id=? and state in"
                                + " ('ACCEPTED','UNKNOWN')",
                        ts(now),
                        sid);
            else if (Set.of("failed", "undelivered").contains(state))
                jdbc.update(
                        "update collector.reminder_deliveries set"
                            + " state='FAILED',failure_code='SMS_UNDELIVERED',updated_at=? where"
                            + " channel='SMS' and provider_id=? and state in"
                            + " ('ACCEPTED','UNKNOWN')",
                        ts(now),
                        sid);
        }
    }

    public void timezoneChanged(UUID w, UUID p, UUID c, String zone) {
        if (zone != null)
            jdbc.update(
                    "update collector.sms_consents set timezone=? where workspace_id=? and"
                            + " project_id=? and contact_id=?",
                    zone,
                    w,
                    p,
                    c);
    }

    public List<UUID> cancelledWorkspaces() {
        return jdbc.queryForList(
                "select distinct workspace_id from collector.sms_verifications where state in"
                        + " ('REVOKED','EXPIRED','FAILED') and not settled union select distinct"
                        + " workspace_id from collector.reminder_deliveries where channel='SMS' and"
                        + " sms_period is not null and not sms_settled and state not in"
                        + " ('QUEUED','SENDING') limit 25",
                UUID.class);
    }

    public boolean freshConsent(String scope, String hash, Instant consented) {
        return !jdbc.queryForObject(
                "select exists(select 1 from collector.sms_destinations where sender_scope=? and"
                    + " phone_hash=? and last_stop_at>=?)",
                Boolean.class,
                scope,
                hash,
                ts(consented));
    }
}

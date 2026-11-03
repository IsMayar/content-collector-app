package com.ayaantrix.collector.reminder.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;

/** Internal provider-evidence projections only; never an agency/client lookup by global ID. */
@Repository
public class DeliveryReconciliationRepository {
    private final JdbcTemplate jdbc;

    public DeliveryReconciliationRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Subject(
            boolean verification,
            UUID id,
            UUID workspace,
            UUID project,
            UUID contact,
            String channel,
            String recipient,
            String provider,
            String state,
            UUID lease,
            int attempts,
            boolean prepared) {
        @Override
        public String toString() {
            return "Reconciliation[" + id + "]";
        }
    }

    private String table(boolean verification) {
        return verification ? "collector.sms_verifications" : "collector.reminder_deliveries";
    }

    private Subject row(java.sql.ResultSet r, boolean verification) throws java.sql.SQLException {
        return new Subject(
                verification,
                r.getObject("id", UUID.class),
                r.getObject("workspace_id", UUID.class),
                r.getObject("project_id", UUID.class),
                r.getObject("contact_id", UUID.class),
                verification ? "SMS" : r.getString("channel"),
                r.getString(verification ? "phone_hash" : "recipient_key"),
                r.getString("provider_id"),
                r.getString("state"),
                r.getObject("reconcile_lease", UUID.class),
                r.getInt("reconciliation_count"),
                verification || r.getTimestamp("sent_at") != null);
    }

    public Optional<Subject> find(UUID id) {
        for (boolean v : List.of(false, true)) {
            var rows =
                    jdbc.query(
                            "select * from " + table(v) + " where id=?", (r, n) -> row(r, v), id);
            if (!rows.isEmpty()) return Optional.of(rows.getFirst());
        }
        return Optional.empty();
    }

    public Optional<Subject> provider(String provider, String channel) {
        for (boolean v : List.of(false, true)) {
            if (v && !channel.equals("SMS")) continue;
            var rows =
                    jdbc.query(
                            "select * from "
                                    + table(v)
                                    + " where provider_id=?"
                                    + (v ? "" : " and channel=?"),
                            (r, n) -> row(r, v),
                            v ? new Object[] {provider} : new Object[] {provider, channel});
            if (!rows.isEmpty()) return Optional.of(rows.getFirst());
        }
        return Optional.empty();
    }

    public Optional<Subject> lock(Subject s) {
        return jdbc
                .query(
                        "select * from "
                                + table(s.verification())
                                + " where workspace_id=? and project_id=? and contact_id=? and id=?"
                                + " for update",
                        (r, n) -> row(r, s.verification()),
                        s.workspace(),
                        s.project(),
                        s.contact(),
                        s.id())
                .stream()
                .findFirst();
    }

    public Optional<Subject> claim(
            boolean email, boolean sms, boolean verificationFirst, Instant now) {
        for (boolean v : verificationFirst ? List.of(true, false) : List.of(false, true)) {
            if (v && !sms) continue;
            var rows =
                    jdbc.query(
                            "select * from "
                                    + table(v)
                                    + " where state='UNKNOWN' and provider_id is not null and"
                                    + " reconciliation_count<8 and (reconciliation_count=0 or"
                                    + " reconcile_after<=?) and (reconcile_until is null or"
                                    + " reconcile_until<=?)"
                                    + (v
                                            ? ""
                                            : " and ((channel='EMAIL' and ?) or (channel='SMS' and"
                                                    + " ?))")
                                    + " order by reconcile_after,id for update skip locked limit 1",
                            (r, n) -> row(r, v),
                            v
                                    ? new Object[] {ts(now), ts(now)}
                                    : new Object[] {ts(now), ts(now), email, sms});
            if (rows.isEmpty()) continue;
            var s = rows.getFirst();
            jdbc.update(
                    "update "
                            + table(v)
                            + " set reconcile_lease=?,reconcile_until=?,reconcile_after=?,reconciliation_count=reconciliation_count+1"
                            + " where id=?",
                    UUID.randomUUID(),
                    ts(now.plusSeconds(60)),
                    ts(now),
                    s.id());
            return lock(s);
        }
        return Optional.empty();
    }

    public boolean bind(Subject s, String provider, Instant now) {
        return jdbc.update(
                        "update "
                                + table(s.verification())
                                + " set provider_id=?,updated_at=? where workspace_id=? and"
                                + " project_id=? and id=? and provider_id is null and state in"
                                + " ('SENDING','UNKNOWN')",
                        provider,
                        ts(now),
                        s.workspace(),
                        s.project(),
                        s.id())
                == 1;
    }

    public boolean resolve(Subject s, String state, UUID lease, Instant now) {
        return jdbc.update(
                        "update "
                                + table(s.verification())
                                + " set state=?,"
                                + (s.verification() ? "" : "failure_code=null,")
                                + "encrypted_payload=null,reconcile_lease=null,reconcile_until=null,reconciliation_failure=null,updated_at=?"
                                + " where workspace_id=? and project_id=? and contact_id=? and id=?"
                                + " and state='UNKNOWN' and provider_id=?"
                                + (lease == null
                                        ? ""
                                        : " and reconcile_lease=? and reconcile_until>?"),
                        lease == null
                                ? new Object[] {
                                    state,
                                    ts(now),
                                    s.workspace(),
                                    s.project(),
                                    s.contact(),
                                    s.id(),
                                    s.provider()
                                }
                                : new Object[] {
                                    state,
                                    ts(now),
                                    s.workspace(),
                                    s.project(),
                                    s.contact(),
                                    s.id(),
                                    s.provider(),
                                    lease,
                                    ts(now)
                                })
                == 1;
    }

    public void unavailable(Subject s, String code, Instant now) {
        jdbc.update(
                "update "
                        + table(s.verification())
                        + " set reconcile_after=?,reconcile_lease=null,reconcile_until=null,reconciliation_failure=?"
                        + " where id=? and state='UNKNOWN' and reconcile_lease=?",
                ts(now.plusSeconds(Math.min(3600, 60L << Math.min(s.attempts(), 6)))),
                s.attempts() >= 8 ? "LOOKUP_LIMIT_REACHED" : code,
                s.id(),
                s.lease());
    }

    private static Timestamp ts(Instant t) {
        return Timestamp.from(t);
    }

    public List<String> events(Subject s) {
        return s.channel().equals("EMAIL")
                ? jdbc.queryForList(
                        "select event_type from collector.email_webhook_events where provider_id=?"
                                + " order by occurred_at desc,created_at desc limit 50",
                        String.class,
                        s.provider())
                : jdbc.queryForList(
                        "select event_type from collector.sms_events where provider_id=? and"
                                + " event_key like 'status:%' order by created_at desc limit 50",
                        String.class, s.provider());
    }
}

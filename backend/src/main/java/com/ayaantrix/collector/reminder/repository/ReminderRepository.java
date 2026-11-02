package com.ayaantrix.collector.reminder.repository;

import com.ayaantrix.collector.reminder.dto.ReminderDtos.*;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import tools.jackson.databind.json.JsonMapper;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;

@Repository
public class ReminderRepository {
    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    private final com.ayaantrix.collector.common.repository.AuditRepository audit;

    public ReminderRepository(
            JdbcTemplate jdbc,
            JsonMapper json,
            com.ayaantrix.collector.common.repository.AuditRepository audit) {
        this.audit = audit;
        this.jdbc = jdbc;
        this.json = json;
    }

    public record Contact(
            UUID id, String email, boolean emailEnabled, String timezone, String suppression) {
        @Override
        public String toString() {
            return "ReminderContact[" + id + "]";
        }
    }

    public record Delivery(
            UUID id,
            UUID workspace,
            UUID project,
            UUID contact,
            long policy,
            UUID rule,
            boolean manual,
            LocalDate occurrence,
            LocalDate dispatch,
            String timezone,
            String recipientKey,
            Instant due,
            String state,
            int attempts,
            UUID lease,
            UUID token,
            byte[] encrypted,
            String keyId,
            String provider,
            Instant sent) {
        @Override
        public String toString() {
            return "ReminderDelivery[" + id + "," + state + "]";
        }
    }

    public Policy ensure(UUID w, UUID p, String zone, LocalDate deadline, Instant now) {
        var rules =
                List.of(-3, 0, 3).stream()
                        .map(
                                d ->
                                        new Rule(
                                                UUID.nameUUIDFromBytes(
                                                        (p + ":EMAIL:" + d)
                                                                .getBytes(
                                                                        java.nio.charset
                                                                                .StandardCharsets
                                                                                .UTF_8)),
                                                "EMAIL",
                                                d,
                                                "10:00",
                                                true))
                        .toList();
        jdbc.update(
                "insert into"
                    + " collector.reminder_policies(workspace_id,project_id,timezone,rules_json,source_due_date,updated_at)"
                    + " values(?,?,?,?::jsonb,?,?) on conflict(project_id) do nothing",
                w,
                p,
                zone,
                json.writeValueAsString(rules),
                deadline,
                Timestamp.from(now));
        int changed =
                jdbc.update(
                        "update collector.reminder_policies set"
                                + " version=version+1,source_due_date=?,updated_at=? where"
                                + " workspace_id=? and project_id=? and source_due_date<>?",
                        deadline,
                        Timestamp.from(now),
                        w,
                        p,
                        deadline);
        if (changed > 0) cancel(w, p, null, "DUE_DATE_CHANGED", now);
        return jdbc.queryForObject(
                "select * from collector.reminder_policies where workspace_id=? and project_id=?",
                (rs, n) ->
                        new Policy(
                                rs.getLong("version"),
                                rs.getBoolean("enabled"),
                                rs.getBoolean("paused"),
                                rs.getString("timezone"),
                                json.readValue(
                                        rs.getString("rules_json"),
                                        new tools.jackson.core.type.TypeReference<
                                                List<Rule>>() {})),
                w,
                p);
    }

    public void update(UUID w, UUID p, Update input, boolean enabled, Instant now) {
        jdbc.update(
                "update collector.reminder_policies set"
                    + " version=version+1,enabled=?,paused=?,timezone=?,rules_json=?::jsonb,updated_at=?"
                    + " where workspace_id=? and project_id=? and version=?",
                enabled,
                input.paused(),
                input.timezone(),
                json.writeValueAsString(input.rules()),
                Timestamp.from(now),
                w,
                p,
                input.expectedVersion());
        cancel(w, p, null, "POLICY_CHANGED", now);
    }

    public List<Contact> contacts(UUID w, UUID p) {
        return jdbc.query(
                "select * from collector.project_contacts where workspace_id=? and project_id=?"
                        + " order by id",
                (rs, n) ->
                        new Contact(
                                rs.getObject("id", UUID.class),
                                rs.getString("email_normalized"),
                                rs.getBoolean("email_reminders_enabled"),
                                rs.getString("timezone"),
                                rs.getString("email_suppression_code")),
                w,
                p);
    }

    public Optional<Contact> contact(UUID w, UUID p, UUID c) {
        return contacts(w, p).stream().filter(x -> x.id().equals(c)).findFirst();
    }

    public void preferences(UUID w, UUID p, UUID c, ChangePreferences input, Instant now) {
        jdbc.update(
                "update collector.project_contacts set"
                    + " email_reminders_enabled=?,timezone=?,updated_at=? where workspace_id=? and"
                    + " project_id=? and id=?",
                input.emailEnabled(),
                input.timezone(),
                Timestamp.from(now),
                w,
                p,
                c);
        cancel(w, p, c, "PREFERENCE_CHANGED", now);
    }

    public boolean dayAvailable(UUID w, String key, LocalDate date, UUID except, Instant now) {
        return jdbc.queryForObject(
                        "select count(*) from collector.reminder_deliveries where workspace_id=?"
                                + " and recipient_key=? and id<>? and state not in"
                                + " ('CANCELLED','SUPPRESSED') and (dispatch_date=? or sent_at>?)",
                        Integer.class,
                        w,
                        key,
                        except,
                        date,
                        Timestamp.from(now.minus(Duration.ofHours(24))))
                == 0;
    }

    public boolean weekAvailable(UUID w, UUID p, Instant week, Instant end, UUID except) {
        return jdbc.queryForObject(
                        "select count(*) from collector.reminder_deliveries where workspace_id=?"
                                + " and project_id=? and id<>? and state not in"
                                + " ('CANCELLED','SUPPRESSED') and (due_at>=? and due_at<? or"
                                + " sent_at>=? and sent_at<?)",
                        Integer.class,
                        w,
                        p,
                        except,
                        Timestamp.from(week),
                        Timestamp.from(end),
                        Timestamp.from(week),
                        Timestamp.from(end))
                < 5;
    }

    public boolean exists(UUID w, UUID p, UUID c, long version, UUID rule, LocalDate day) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        "select exists(select 1 from collector.reminder_deliveries where"
                                + " workspace_id=? and project_id=? and contact_id=? and"
                                + " policy_version=? and rule_id=? and occurrence_date=? and"
                                + " state<>'CANCELLED')",
                        Boolean.class,
                        w,
                        p,
                        c,
                        version,
                        rule,
                        day));
    }

    public UUID enqueue(
            UUID w,
            UUID p,
            UUID c,
            long version,
            UUID rule,
            boolean manual,
            LocalDate date,
            LocalDate dispatch,
            String zone,
            String recipient,
            Instant due,
            Instant now) {
        UUID id = UUID.randomUUID();
        jdbc.update(
                "insert into"
                    + " collector.reminder_deliveries(id,workspace_id,project_id,contact_id,channel,policy_version,rule_id,manual,occurrence_date,dispatch_date,timezone,recipient_key,due_at,available_at,state,created_at,updated_at)"
                    + " values(?,?,?,?,'EMAIL',?,?,?,?,?,?,?,?,?,'QUEUED',?,?)",
                id,
                w,
                p,
                c,
                version,
                rule,
                manual,
                date,
                dispatch,
                zone,
                recipient,
                Timestamp.from(due),
                Timestamp.from(due.isAfter(now) ? due : now),
                Timestamp.from(now),
                Timestamp.from(now));
        return id;
    }

    private Delivery row(java.sql.ResultSet r, int n) throws java.sql.SQLException {
        return new Delivery(
                r.getObject("id", UUID.class),
                r.getObject("workspace_id", UUID.class),
                r.getObject("project_id", UUID.class),
                r.getObject("contact_id", UUID.class),
                r.getLong("policy_version"),
                r.getObject("rule_id", UUID.class),
                r.getBoolean("manual"),
                r.getObject("occurrence_date", LocalDate.class),
                r.getObject("dispatch_date", LocalDate.class),
                r.getString("timezone"),
                r.getString("recipient_key"),
                r.getTimestamp("due_at").toInstant(),
                r.getString("state"),
                r.getInt("attempt_count"),
                r.getObject("lease_id", UUID.class),
                r.getObject("token_id", UUID.class),
                r.getBytes("encrypted_payload"),
                r.getString("encryption_key_id"),
                r.getString("provider_id"),
                r.getTimestamp("sent_at") == null ? null : r.getTimestamp("sent_at").toInstant());
    }

    public List<Delivery> queued(UUID w, UUID p) {
        return jdbc.query(
                "select * from collector.reminder_deliveries where workspace_id=? and project_id=?"
                        + " and state='QUEUED' order by due_at",
                this::row,
                w,
                p);
    }

    public Optional<Delivery> find(UUID id) {
        return jdbc
                .query("select * from collector.reminder_deliveries where id=?", this::row, id)
                .stream()
                .findFirst();
    }

    public Optional<Delivery> claim(Instant now) {
        jdbc.update(
                "update collector.reminder_deliveries set"
                    + " state='UNKNOWN',failure_code='DELIVERY_OUTCOME_UNKNOWN',encrypted_payload=null,lease_id=null,lease_until=null,updated_at=?"
                    + " where state='SENDING' and lease_until<=?",
                Timestamp.from(now),
                Timestamp.from(now));
        var list =
                jdbc.query(
                        "select * from collector.reminder_deliveries where state='QUEUED' and"
                                + " available_at<=? order by due_at for update skip locked limit 1",
                        this::row,
                        Timestamp.from(now));
        if (list.isEmpty()) return Optional.empty();
        var d = list.getFirst();
        jdbc.update(
                "update collector.reminder_deliveries set"
                    + " state='SENDING',lease_id=?,lease_until=?,attempt_count=attempt_count+1,updated_at=?"
                    + " where id=?",
                UUID.randomUUID(),
                Timestamp.from(now.plusSeconds(120)),
                Timestamp.from(now),
                d.id());
        return find(d.id());
    }

    public void prepare(
            Delivery d, UUID token, byte[] encrypted, String keyId, LocalDate day, Instant now) {
        int changed =
                jdbc.update(
                        "update collector.reminder_deliveries set"
                            + " token_id=?,encrypted_payload=?,encryption_key_id=?,dispatch_date=?,sent_at=?,updated_at=?"
                            + " where id=? and lease_id=? and state='SENDING' and lease_until>?",
                        token,
                        encrypted,
                        keyId,
                        day,
                        Timestamp.from(now),
                        Timestamp.from(now),
                        d.id(),
                        d.lease(),
                        Timestamp.from(now));
        if (changed != 1) throw new IllegalStateException("Reminder lease is unavailable.");
    }

    public void finish(Delivery d, String state, String provider, String failure, Instant now) {
        int changed =
                jdbc.update(
                        "update collector.reminder_deliveries set"
                            + " state=?,provider_id=coalesce(?,provider_id),failure_code=?,encrypted_payload=case"
                            + " when ?='QUEUED' then encrypted_payload else null"
                            + " end,lease_id=null,lease_until=null,available_at=?,updated_at=?"
                            + " where id=? and lease_id=? and state='SENDING'",
                        state,
                        provider,
                        failure,
                        state,
                        Timestamp.from(now.plusSeconds(30L * d.attempts())),
                        Timestamp.from(now),
                        d.id(),
                        d.lease());
        if (changed == 1)
            audit.writeAnonymous(
                    d.workspace(), d.project(), d.contact(), "REMINDER_" + state, d.id(), now);
    }

    public void cancel(UUID w, UUID p, UUID contact, String reason, Instant now) {
        jdbc.update(
                "update collector.reminder_deliveries set"
                    + " state='CANCELLED',failure_code=?,encrypted_payload=null,updated_at=? where"
                    + " workspace_id=? and project_id=? and (?::uuid is null or contact_id=?) and"
                    + " state='QUEUED'",
                reason,
                Timestamp.from(now),
                w,
                p,
                contact,
                contact);
    }

    public void cancel(Delivery d, String reason, Instant now) {
        jdbc.update(
                "update collector.reminder_deliveries set"
                    + " state='CANCELLED',failure_code=?,encrypted_payload=null,updated_at=? where"
                    + " id=? and state='QUEUED'",
                reason,
                Timestamp.from(now),
                d.id());
    }

    public List<Map<String, Object>> history(UUID w, UUID p, int page, int size) {
        return jdbc.query(
                "select * from collector.reminder_deliveries where workspace_id=? and project_id=?"
                        + " order by created_at desc,id limit ? offset ?",
                (rs, n) -> {
                    var m = new LinkedHashMap<String, Object>();
                    m.put("id", rs.getObject("id", UUID.class));
                    m.put("channel", "EMAIL");
                    m.put("dueAt", rs.getTimestamp("due_at").toInstant());
                    m.put("state", rs.getString("state"));
                    m.put("failureCode", rs.getString("failure_code"));
                    return m;
                },
                w,
                p,
                size,
                page * size);
    }

    public List<Map<String, UUID>> projects(UUID after) {
        return jdbc.query(
                "select p.workspace_id,p.id from collector.projects p where (p.state='ACTIVE' or"
                    + " exists(select 1 from collector.reminder_deliveries d where"
                    + " d.workspace_id=p.workspace_id and d.project_id=p.id and d.state='QUEUED'))"
                    + " and p.id>? order by p.id limit 100",
                (rs, n) ->
                        Map.of(
                                "workspace",
                                rs.getObject(1, UUID.class),
                                "project",
                                rs.getObject(2, UUID.class)),
                after);
    }

    public String replyTo(UUID workspace) {
        return jdbc.queryForObject(
                "select u.email_normalized from collector.workspace_members m join collector.users"
                        + " u on u.id=m.user_id where m.workspace_id=? and m.role='OWNER' and"
                        + " m.state='ACTIVE' and u.verified_at is not null and u.state='ACTIVE'",
                String.class,
                workspace);
    }

    public void event(
            String id, String hash, String provider, String type, Instant occurred, Instant now) {
        jdbc.update(
                "insert into collector.email_webhook_events values(?,?,?,?,?,?) on"
                        + " conflict(event_id) do nothing",
                id,
                hash,
                provider,
                type,
                Timestamp.from(occurred),
                Timestamp.from(now));
        applyEvents(provider, now);
    }

    public void applyEvents(String provider, Instant now) {
        if (provider == null) return;
        var events =
                jdbc.queryForList(
                        "select event_type,occurred_at from collector.email_webhook_events where"
                                + " provider_id=? order by occurred_at",
                        provider);
        for (var e : events) {
            String type = (String) e.get("event_type");
            String state =
                    switch (type) {
                        case "email.delivered" -> "DELIVERED";
                        case "email.bounced" -> "BOUNCED";
                        case "email.complained" -> "SUPPRESSED";
                        default -> null;
                    };
            if (state == null) continue;
            jdbc.update(
                    "update collector.reminder_deliveries set"
                        + " state=?,failure_code=?,provider_event_at=?,updated_at=? where"
                        + " provider_id=? and (provider_event_at is null or provider_event_at<=?)"
                        + " and (state not in ('BOUNCED','SUPPRESSED') or ? in"
                        + " ('BOUNCED','SUPPRESSED'))",
                    state,
                    state.equals("DELIVERED") ? null : type,
                    e.get("occurred_at"),
                    Timestamp.from(now),
                    provider,
                    e.get("occurred_at"),
                    state);
            if (!state.equals("DELIVERED")) {
                jdbc.update(
                        "update collector.project_contacts c set email_suppression_code=? where"
                            + " exists(select 1 from collector.reminder_deliveries d where"
                            + " d.provider_id=? and d.workspace_id=c.workspace_id and"
                            + " d.recipient_key=encode(sha256(convert_to(c.email_normalized,'UTF8')),'hex'))",
                        type,
                        provider);
                jdbc.update(
                        "update collector.reminder_deliveries d set"
                            + " state='SUPPRESSED',failure_code='EMAIL_SUPPRESSED',encrypted_payload=null,updated_at=?"
                            + " where d.state='QUEUED' and exists(select 1 from"
                            + " collector.project_contacts c where c.workspace_id=d.workspace_id"
                            + " and c.project_id=d.project_id and c.id=d.contact_id and"
                            + " c.email_suppression_code is not null)",
                        Timestamp.from(now));
            }
        }
    }

    public long historyCount(UUID w, UUID p) {
        return jdbc.queryForObject(
                "select count(*) from collector.reminder_deliveries where workspace_id=? and"
                        + " project_id=?",
                Long.class,
                w,
                p);
    }

    public Optional<Delivery> provider(String provider) {
        return jdbc
                .query(
                        "select * from collector.reminder_deliveries where provider_id=?",
                        this::row,
                        provider)
                .stream()
                .findFirst();
    }

    public void defer(Delivery d, Instant due, Instant now) {
        jdbc.update(
                "update collector.reminder_deliveries set"
                    + " state='QUEUED',available_at=?,attempt_count=attempt_count-1,lease_id=null,lease_until=null,updated_at=?"
                    + " where id=? and lease_id=? and state='SENDING'",
                Timestamp.from(due),
                Timestamp.from(now),
                d.id(),
                d.lease());
    }

    public boolean liveLease(Delivery d, Instant now) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        "select exists(select 1 from collector.reminder_deliveries where id=? and"
                            + " lease_id=? and state='SENDING' and lease_until>?)",
                        Boolean.class,
                        d.id(),
                        d.lease(),
                        Timestamp.from(now)));
    }
}

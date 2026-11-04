package com.ayaantrix.collector.visibility.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.*;

import java.time.*;
import java.util.*;

@Repository
@Transactional(propagation = Propagation.MANDATORY)
public class DigestRepository {
    public record Recipient(
            UUID workspace, UUID member, UUID user, String email, String timezone, String role) {
        @Override
        public String toString() {
            return "DigestRecipient[redacted]";
        }
    }

    public record Job(UUID id, UUID workspace, UUID member, LocalDate date, UUID lease) {}

    public record ProjectRow(UUID id, String alias) {}

    private final JdbcTemplate jdbc;

    public DigestRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Recipient> recipient(UUID w, UUID m) {
        return jdbc
                .query(
                        "select m.workspace_id,m.id,m.user_id,u.email_normalized,w.timezone,m.role"
                            + " from collector.workspace_members m join collector.users u on"
                            + " u.id=m.user_id join collector.workspaces w on w.id=m.workspace_id"
                            + " where m.workspace_id=? and m.id=? and m.state='ACTIVE' and"
                            + " u.state='ACTIVE' and u.verified_at is not null and w.state in"
                            + " ('ACTIVE','READ_ONLY')",
                        (r, n) ->
                                new Recipient(
                                        r.getObject(1, UUID.class),
                                        r.getObject(2, UUID.class),
                                        r.getObject(3, UUID.class),
                                        r.getString(4),
                                        r.getString(5),
                                        r.getString(6)),
                        w,
                        m)
                .stream()
                .findFirst();
    }

    public boolean enabled(UUID w, UUID m) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        "select coalesce((select enabled from collector.digest_preferences where"
                            + " workspace_id=? and member_id=?),false)",
                        Boolean.class,
                        w,
                        m));
    }

    public long version(UUID w, UUID m) {
        return jdbc.queryForObject(
                "select coalesce((select version from collector.digest_preferences where"
                    + " workspace_id=? and member_id=?),0)",
                Long.class,
                w,
                m);
    }

    public void preference(UUID w, UUID m, boolean enabled, Instant now) {
        jdbc.update(
                "insert into"
                    + " collector.digest_preferences(workspace_id,member_id,enabled,version,updated_at)"
                    + " values(?,?,?,1,?) on conflict(workspace_id,member_id) do update set"
                    + " enabled=excluded.enabled,version=digest_preferences.version+1,updated_at=excluded.updated_at",
                w,
                m,
                enabled,
                java.sql.Timestamp.from(now));
        if (!enabled)
            jdbc.update(
                    "update collector.digest_jobs set"
                        + " state='CANCELLED',lease_owner=null,lease_until=null,updated_at=? where"
                        + " workspace_id=? and member_id=? and (state='QUEUED' or state='SENDING'"
                        + " and prepared_at is null)",
                    java.sql.Timestamp.from(now),
                    w,
                    m);
    }

    public List<ProjectRow> projects(Recipient recipient, Instant now) {
        return jdbc.query(
                """
                select p.id,coalesce((select s.alias from collector.status_shares s where s.workspace_id=p.workspace_id and s.project_id=p.id and s.revoked_at is null and s.expires_at>? order by s.created_at desc,s.id limit 1),'Project '||left(p.id::text,8)) alias
                from collector.projects p where p.workspace_id=? and p.state in ('ACTIVE','PAUSED') and (?='OWNER' or exists(select 1 from collector.project_members a where a.workspace_id=p.workspace_id and a.project_id=p.id and a.workspace_member_id=?)) order by p.id
                """,
                (r, n) -> new ProjectRow(r.getObject(1, UUID.class), r.getString(2)),
                java.sql.Timestamp.from(now),
                recipient.workspace(),
                recipient.role(),
                recipient.member());
    }

    public void enqueueDue(Instant now) {
        var rows =
                jdbc.queryForList(
                        "select d.workspace_id,d.member_id,w.timezone from"
                            + " collector.digest_preferences d join collector.workspaces w on"
                            + " w.id=d.workspace_id where d.enabled=true and w.state in"
                            + " ('ACTIVE','READ_ONLY')");
        for (var r : rows) {
            var local = now.atZone(ZoneId.of((String) r.get("timezone")));
            if (local.toLocalTime().isBefore(LocalTime.of(9, 0))) continue;
            jdbc.update(
                    "insert into"
                        + " collector.digest_jobs(id,workspace_id,member_id,local_date,state,created_at,updated_at)"
                        + " values(?,?,?,?,'QUEUED',?,?) on"
                        + " conflict(workspace_id,member_id,local_date) do nothing",
                    UUID.randomUUID(),
                    r.get("workspace_id"),
                    r.get("member_id"),
                    local.toLocalDate(),
                    java.sql.Timestamp.from(now),
                    java.sql.Timestamp.from(now));
        }
    }

    public Optional<Job> claim(Instant now) {
        jdbc.update(
                "update collector.digest_jobs set state=case when prepared_at is null then 'QUEUED'"
                    + " else 'UNKNOWN' end,failure_code=case when prepared_at is null then null"
                    + " else 'SEND_OUTCOME_UNKNOWN'"
                    + " end,lease_owner=null,lease_until=null,updated_at=? where state='SENDING'"
                    + " and lease_until<=?",
                java.sql.Timestamp.from(now),
                java.sql.Timestamp.from(now));
        var lease = UUID.randomUUID();
        return jdbc
                .query(
                        """
                        update collector.digest_jobs set state='SENDING',lease_owner=?,lease_until=?,updated_at=? where id=(select id from collector.digest_jobs where state='QUEUED' order by created_at,id for update skip locked limit 1) returning id,workspace_id,member_id,local_date
                        """,
                        (r, n) ->
                                new Job(
                                        r.getObject(1, UUID.class),
                                        r.getObject(2, UUID.class),
                                        r.getObject(3, UUID.class),
                                        r.getObject(4, LocalDate.class),
                                        lease),
                        lease,
                        java.sql.Timestamp.from(now.plusSeconds(60)),
                        java.sql.Timestamp.from(now))
                .stream()
                .findFirst();
    }

    public boolean current(Job j) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        "select exists(select 1 from collector.digest_jobs where id=? and"
                            + " state='SENDING' and lease_owner=?)",
                        Boolean.class,
                        j.id(),
                        j.lease()));
    }

    public boolean prepared(Job j, Instant now) {
        return jdbc.update(
                        "update collector.digest_jobs set prepared_at=? where id=? and"
                            + " state='SENDING' and lease_owner=? and lease_until>?",
                        java.sql.Timestamp.from(now),
                        j.id(),
                        j.lease(),
                        java.sql.Timestamp.from(now))
                > 0;
    }

    public void finish(Job j, String state, String provider, String failure, Instant now) {
        jdbc.update(
                "update collector.digest_jobs set"
                    + " state=?,provider_id=coalesce(?,provider_id),failure_code=?,lease_owner=null,lease_until=null,updated_at=?"
                    + " where id=? and state='SENDING' and lease_owner=?",
                state,
                provider,
                failure,
                java.sql.Timestamp.from(now),
                j.id(),
                j.lease());
    }

    public record ReceiptJob(
            UUID workspace,
            UUID member,
            String provider,
            String state,
            boolean prepared,
            String email) {
        @Override
        public String toString() {
            return "DigestReceipt[redacted]";
        }
    }

    public Optional<ReceiptJob> receiptJob(UUID id) {
        return jdbc
                .query(
                        "select"
                            + " j.workspace_id,j.member_id,j.provider_id,j.state,j.prepared_at,u.email_normalized"
                            + " from collector.digest_jobs j join collector.workspace_members m on"
                            + " m.workspace_id=j.workspace_id and m.id=j.member_id join"
                            + " collector.users u on u.id=m.user_id where j.id=?",
                        (r, n) ->
                                new ReceiptJob(
                                        r.getObject(1, UUID.class),
                                        r.getObject(2, UUID.class),
                                        r.getString(3),
                                        r.getString(4),
                                        r.getTimestamp(5) != null,
                                        r.getString(6)),
                        id)
                .stream()
                .findFirst();
    }

    public void bind(UUID id, String provider, Instant now) {
        jdbc.update(
                "update collector.digest_jobs set provider_id=coalesce(provider_id,?),updated_at=?"
                    + " where id=? and prepared_at is not null",
                provider,
                java.sql.Timestamp.from(now),
                id);
    }

    public void resolve(UUID id, String state, Instant now) {
        jdbc.update(
                "update collector.digest_jobs set"
                    + " state=?,failure_code=null,lease_owner=null,lease_until=null,updated_at=?"
                    + " where id=? and state in ('UNKNOWN','ACCEPTED','FAILED')",
                state,
                java.sql.Timestamp.from(now),
                id);
    }

    public List<String> events(String provider) {
        return jdbc.query(
                "select event_type from collector.email_webhook_events where provider_id=? order by"
                    + " occurred_at,created_at",
                (r, n) -> r.getString(1),
                provider);
    }
}

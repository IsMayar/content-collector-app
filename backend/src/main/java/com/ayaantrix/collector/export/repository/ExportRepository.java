package com.ayaantrix.collector.export.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;

@Repository
public class ExportRepository {
    private final JdbcTemplate jdbc;
    private final JsonMapper json;

    public ExportRepository(JdbcTemplate jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public record Job(
            UUID id,
            UUID workspace,
            UUID project,
            UUID member,
            String format,
            long version,
            JsonNode manifest,
            String state,
            String key,
            long bytes,
            Instant created,
            Instant expires,
            UUID lease,
            int attempts,
            String failure) {
        @Override
        public String toString() {
            return "ExportJob[" + id + "," + state + "]";
        }
    }

    private Job row(java.sql.ResultSet r, int n) throws java.sql.SQLException {
        return new Job(
                r.getObject("id", UUID.class),
                r.getObject("workspace_id", UUID.class),
                r.getObject("project_id", UUID.class),
                r.getObject("requested_by_member_id", UUID.class),
                r.getString("format"),
                r.getLong("project_version"),
                json.readTree(r.getString("manifest_json")),
                r.getString("state"),
                r.getString("object_key"),
                r.getLong("bytes"),
                r.getTimestamp("created_at").toInstant(),
                r.getTimestamp("expires_at").toInstant(),
                r.getObject("lease_id", UUID.class),
                r.getInt("attempt_count"),
                r.getString("failure_code"));
    }

    public void insert(
            UUID id,
            UUID w,
            UUID p,
            UUID member,
            String format,
            long version,
            JsonNode manifest,
            boolean ack,
            Instant now) {
        jdbc.update(
                "insert into"
                    + " collector.export_jobs(id,workspace_id,project_id,requested_by_member_id,format,project_version,manifest_json,partial_acknowledged,state,created_at,updated_at,expires_at,available_at)"
                    + " values(?,?,?,?,?,?,?::jsonb,?,'QUEUED',?,?,?,?)",
                id,
                w,
                p,
                member,
                format,
                version,
                manifest.toString(),
                ack,
                Timestamp.from(now),
                Timestamp.from(now),
                Timestamp.from(now.plus(Duration.ofHours(24))),
                Timestamp.from(now));
    }

    public Optional<Job> find(UUID w, UUID p, UUID id) {
        return jdbc
                .query(
                        "select * from collector.export_jobs where workspace_id=? and project_id=?"
                            + " and id=?",
                        this::row,
                        w,
                        p,
                        id)
                .stream()
                .findFirst();
    }

    public List<Job> list(UUID w, UUID p) {
        return jdbc.query(
                "select * from collector.export_jobs where workspace_id=? and project_id=? order by"
                    + " created_at desc,id limit 100",
                this::row,
                w,
                p);
    }

    public boolean approved(UUID w, UUID p, UUID i, UUID r) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        "select exists(select 1 from collector.review_decisions where"
                            + " workspace_id=? and project_id=? and item_id=? and revision_id=? and"
                            + " decision='APPROVE')",
                        Boolean.class,
                        w,
                        p,
                        i,
                        r));
    }

    public Optional<Job> claim(Instant now) {
        var rows =
                jdbc.query(
                        "select * from collector.export_jobs where expires_at>? and available_at<=?"
                            + " and (state='QUEUED' or state='RUNNING' and lease_until<=?) order by"
                            + " created_at for update skip locked limit 1",
                        this::row,
                        Timestamp.from(now),
                        Timestamp.from(now),
                        Timestamp.from(now));
        if (rows.isEmpty()) return Optional.empty();
        var j = rows.getFirst();
        UUID lease = UUID.randomUUID();
        if (j.attempts() >= 3) {
            jdbc.update(
                    "update collector.export_jobs set"
                        + " state='FAILED',failure_code='EXPORT_GENERATION_FAILED',lease_id=null,lease_until=null,updated_at=?"
                        + " where id=?",
                    Timestamp.from(now),
                    j.id());
            return Optional.empty();
        }
        jdbc.update(
                "update collector.export_jobs set"
                    + " state='RUNNING',attempt_count=attempt_count+1,lease_id=?,lease_until=?,updated_at=?"
                    + " where id=?",
                lease,
                Timestamp.from(now.plusSeconds(120)),
                Timestamp.from(now),
                j.id());
        return find(j.workspace(), j.project(), j.id());
    }

    public boolean renew(Job j, Instant now) {
        return jdbc.update(
                        "update collector.export_jobs set lease_until=?,updated_at=? where id=? and"
                            + " lease_id=? and state='RUNNING' and lease_until>? and expires_at>?",
                        Timestamp.from(now.plusSeconds(120)),
                        Timestamp.from(now),
                        j.id(),
                        j.lease(),
                        Timestamp.from(now),
                        Timestamp.from(now))
                == 1;
    }

    public boolean ready(Job j, String key, long bytes, Instant now) {
        return jdbc.update(
                        "update collector.export_jobs set"
                            + " state='READY',object_key=?,bytes=?,lease_id=null,lease_until=null,failure_code=null,updated_at=?"
                            + " where id=? and lease_id=? and state='RUNNING' and lease_until>? and"
                            + " expires_at>?",
                        key,
                        bytes,
                        Timestamp.from(now),
                        j.id(),
                        j.lease(),
                        Timestamp.from(now),
                        Timestamp.from(now))
                == 1;
    }

    public void fail(Job j, String code, boolean terminal, Instant now) {
        jdbc.update(
                "update collector.export_jobs set"
                    + " state=?,failure_code=?,available_at=?,lease_id=null,lease_until=null,updated_at=?"
                    + " where id=? and lease_id=? and state='RUNNING'",
                terminal || j.attempts() >= 3 ? "FAILED" : "QUEUED",
                code,
                Timestamp.from(now.plusSeconds(10L * j.attempts())),
                Timestamp.from(now),
                j.id(),
                j.lease());
    }

    public List<Job> expired(Instant now) {
        jdbc.update(
                "update collector.export_jobs set state='EXPIRED',updated_at=? where expires_at<=?"
                    + " and state<>'EXPIRED'",
                Timestamp.from(now),
                Timestamp.from(now));
        return jdbc.query(
                "select * from collector.export_jobs where state='EXPIRED' and (cleaned_at is null"
                    + " or cleaned_at<?) and (lease_until is null or lease_until<=?) order by"
                    + " created_at limit 20 for update skip locked",
                this::row,
                Timestamp.from(now.minusSeconds(300)),
                Timestamp.from(now));
    }

    public void cleaned(Job j, Instant now) {
        jdbc.update(
                "update collector.export_jobs set cleaned_at=?,lease_id=null,lease_until=null where"
                    + " id=? and state='EXPIRED'",
                Timestamp.from(now),
                j.id());
    }
}

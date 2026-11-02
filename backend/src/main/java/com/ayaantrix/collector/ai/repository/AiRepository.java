package com.ayaantrix.collector.ai.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;

@Repository
public class AiRepository {
    private final JdbcTemplate jdbc;
    private final JsonMapper json;

    public AiRepository(JdbcTemplate jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public record Job(
            UUID id,
            UUID workspace,
            UUID project,
            UUID item,
            UUID contact,
            UUID period,
            String state,
            long version,
            JsonNode input,
            JsonNode result,
            String model,
            long inputRate,
            long outputRate,
            long inputBound,
            int outputBound,
            long reserved,
            UUID lease,
            Instant expires,
            String failure) {
        @Override
        public String toString() {
            return "AiJob[" + id + "," + state + "]";
        }
    }

    private Job row(java.sql.ResultSet s, int n) throws java.sql.SQLException {
        return new Job(
                s.getObject("id", UUID.class),
                s.getObject("workspace_id", UUID.class),
                s.getObject("project_id", UUID.class),
                s.getObject("item_id", UUID.class),
                s.getObject("contact_id", UUID.class),
                s.getObject("period_id", UUID.class),
                s.getString("state"),
                s.getLong("base_answer_version"),
                s.getString("input_json") == null ? null : json.readTree(s.getString("input_json")),
                s.getString("result_json") == null
                        ? null
                        : json.readTree(s.getString("result_json")),
                s.getString("model"),
                s.getLong("input_rate"),
                s.getLong("output_rate"),
                s.getLong("input_bound"),
                s.getInt("output_bound"),
                s.getLong("reserved_microusd"),
                s.getObject("lease_id", UUID.class),
                s.getTimestamp("expires_at").toInstant(),
                s.getString("failure_code"));
    }

    public Optional<Job> find(UUID w, UUID p, UUID id) {
        return jdbc
                .query(
                        "select * from collector.ai_draft_jobs where workspace_id=? and"
                                + " project_id=? and id=?",
                        this::row,
                        w,
                        p,
                        id)
                .stream()
                .findFirst();
    }

    public Optional<UUID> reserve(UUID w, int limit, long budget, long cost, Instant now) {
        var month =
                now.atZone(ZoneOffset.UTC)
                        .withDayOfMonth(1)
                        .toLocalDate()
                        .atStartOfDay(ZoneOffset.UTC);
        jdbc.update(
                "insert into"
                    + " collector.usage_periods(workspace_id,period_start,period_end,created_at,updated_at)"
                    + " values(?,?,?,?,?) on conflict(workspace_id,period_start) do nothing",
                w,
                Timestamp.from(month.toInstant()),
                Timestamp.from(month.plusMonths(1).toInstant()),
                Timestamp.from(now),
                Timestamp.from(now));
        return jdbc
                .query(
                        "update collector.usage_periods set"
                            + " ai_drafts_reserved=ai_drafts_reserved+1,ai_reserved_microusd=ai_reserved_microusd+?,updated_at=?"
                            + " where workspace_id=? and period_start=? and"
                            + " ai_drafts_used+ai_drafts_reserved<? and"
                            + " ai_cost_microusd+ai_reserved_microusd<=?-? returning id",
                        (s, n) -> s.getObject(1, UUID.class),
                        cost,
                        Timestamp.from(now),
                        w,
                        Timestamp.from(month.toInstant()),
                        limit,
                        budget,
                        cost)
                .stream()
                .findFirst();
    }

    public void insert(
            UUID id,
            UUID w,
            UUID p,
            UUID item,
            UUID contact,
            UUID period,
            long version,
            JsonNode input,
            String model,
            long inRate,
            long outRate,
            long inBound,
            int outBound,
            long cost,
            Instant now) {
        jdbc.update(
                "insert into"
                    + " collector.ai_draft_jobs(id,workspace_id,project_id,item_id,contact_id,period_id,state,base_answer_version,input_json,model,input_rate,output_rate,input_bound,output_bound,reserved_microusd,created_at,updated_at,expires_at)"
                    + " values(?,?,?,?,?,?,'QUEUED',?,?::jsonb,?,?,?,?,?,?,?,?,?)",
                id,
                w,
                p,
                item,
                contact,
                period,
                version,
                input.toString(),
                model,
                inRate,
                outRate,
                inBound,
                outBound,
                cost,
                Timestamp.from(now),
                Timestamp.from(now),
                Timestamp.from(now.plus(Duration.ofDays(30))));
    }

    public Optional<Job> claim(Instant now) {
        var rows =
                jdbc.query(
                        "select * from collector.ai_draft_jobs where state='QUEUED' and"
                            + " expires_at>? order by created_at for update skip locked limit 1",
                        this::row,
                        Timestamp.from(now));
        if (rows.isEmpty()) return Optional.empty();
        var j = rows.getFirst();
        jdbc.update(
                "update collector.ai_draft_jobs set"
                        + " state='RUNNING',lease_id=?,lease_until=?,updated_at=? where id=?",
                UUID.randomUUID(),
                Timestamp.from(now.plusSeconds(75)),
                Timestamp.from(now),
                j.id());
        return find(j.workspace(), j.project(), j.id());
    }

    public boolean finish(
            Job j,
            String state,
            JsonNode result,
            String failure,
            long cost,
            long inTokens,
            long outTokens,
            boolean attempted,
            Instant now) {
        if (jdbc.update(
                        "update collector.ai_draft_jobs set"
                            + " state=?,result_json=?::jsonb,failure_code=?,charged_microusd=?,input_tokens=?,output_tokens=?,lease_id=null,lease_until=null,updated_at=?"
                            + " where id=? and lease_id=? and state='RUNNING' and charged_microusd"
                            + " is null",
                        state,
                        result == null ? null : result.toString(),
                        failure,
                        cost,
                        inTokens,
                        outTokens,
                        Timestamp.from(now),
                        j.id(),
                        j.lease())
                != 1) return false;
        if (jdbc.update(
                        "update collector.usage_periods set"
                            + " ai_drafts_reserved=ai_drafts_reserved-1,ai_reserved_microusd=ai_reserved_microusd-?,ai_drafts_used=ai_drafts_used+?,ai_cost_microusd=ai_cost_microusd+?,updated_at=?"
                            + " where workspace_id=? and id=? and ai_drafts_reserved>0 and"
                            + " ai_reserved_microusd>=?",
                        j.reserved(),
                        attempted ? 1 : 0,
                        cost,
                        Timestamp.from(now),
                        j.workspace(),
                        j.period(),
                        j.reserved())
                != 1) throw new IllegalStateException("AI accounting invariant violated");
        return true;
    }

    public void latency(Job j, long millis) {
        jdbc.update(
                "update collector.ai_draft_jobs set latency_ms=? where id=? and charged_microusd is"
                        + " not null",
                millis,
                j.id());
    }

    public void maintenance(Instant now) {
        for (var j :
                jdbc.query(
                        "select * from collector.ai_draft_jobs where state='RUNNING' and"
                            + " lease_until<=? order by lease_until for update skip locked limit"
                            + " 20",
                        this::row,
                        Timestamp.from(now)))
            finish(j, "FAILED", null, "AI_OUTCOME_UNKNOWN", j.reserved(), 0, 0, true, now);
        for (var j :
                jdbc.query(
                        "select * from collector.ai_draft_jobs where state='QUEUED' and"
                            + " expires_at<=? order by created_at for update skip locked limit 20",
                        this::row,
                        Timestamp.from(now))) {
            jdbc.update(
                    "update collector.ai_draft_jobs set state='RUNNING',lease_id=? where id=?",
                    UUID.randomUUID(),
                    j.id());
            var current = find(j.workspace(), j.project(), j.id()).orElseThrow();
            finish(current, "EXPIRED", null, "AI_EXPIRED", 0, 0, 0, false, now);
        }
        jdbc.update(
                "update collector.ai_draft_jobs set"
                    + " state='EXPIRED',input_json=null,result_json=null,updated_at=? where"
                    + " expires_at<=? and state not in ('RUNNING','QUEUED') and (state<>'EXPIRED'"
                    + " or input_json is not null or result_json is not null)",
                Timestamp.from(now),
                Timestamp.from(now));
    }
}

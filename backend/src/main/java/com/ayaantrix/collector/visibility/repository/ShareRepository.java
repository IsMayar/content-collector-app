package com.ayaantrix.collector.visibility.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.*;

import tools.jackson.databind.json.JsonMapper;

import java.time.*;
import java.util.*;

@Repository
@Transactional(propagation = Propagation.MANDATORY)
public class ShareRepository {
    public record Share(
            UUID id,
            UUID workspace,
            UUID project,
            String alias,
            String hash,
            List<String> origins,
            Instant expires,
            Instant revoked) {}

    private final JdbcTemplate jdbc;
    private final JsonMapper json;

    public ShareRepository(JdbcTemplate jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public Optional<Share> find(UUID id) {
        return jdbc
                .query(
                        "select * from collector.status_shares where id=?",
                        (r, n) ->
                                new Share(
                                        r.getObject("id", UUID.class),
                                        r.getObject("workspace_id", UUID.class),
                                        r.getObject("project_id", UUID.class),
                                        r.getString("alias"),
                                        r.getString("token_hash").trim(),
                                        Arrays.asList(
                                                json.readValue(
                                                        r.getString("allowed_origins_json"),
                                                        String[].class)),
                                        r.getTimestamp("expires_at").toInstant(),
                                        r.getTimestamp("revoked_at") == null
                                                ? null
                                                : r.getTimestamp("revoked_at").toInstant()),
                        id)
                .stream()
                .findFirst();
    }

    public void create(
            UUID id,
            UUID w,
            UUID p,
            String alias,
            String hash,
            List<String> origins,
            Instant expires,
            Instant now) {
        jdbc.update(
                "insert into"
                    + " collector.status_shares(id,workspace_id,project_id,alias,token_hash,allowed_origins_json,expires_at,created_at)"
                    + " values(?,?,?,?,?,?::jsonb,?,?)",
                id,
                w,
                p,
                alias,
                hash,
                json.writeValueAsString(origins),
                java.sql.Timestamp.from(expires),
                java.sql.Timestamp.from(now));
    }

    public boolean revoke(UUID w, UUID p, UUID id, Instant now) {
        return jdbc.update(
                        "update collector.status_shares set revoked_at=coalesce(revoked_at,?) where"
                                + " workspace_id=? and project_id=? and id=?",
                        java.sql.Timestamp.from(now),
                        w,
                        p,
                        id)
                > 0;
    }

    public Instant updatedAt(UUID w, UUID p) {
        return jdbc.queryForObject(
                        "select greatest(p.updated_at,coalesce((select max(i.updated_at) from"
                            + " collector.items i where i.workspace_id=p.workspace_id and"
                            + " i.project_id=p.id),p.updated_at)) from collector.projects p where"
                            + " p.workspace_id=? and p.id=?",
                        java.sql.Timestamp.class,
                        w,
                        p)
                .toInstant();
    }
}

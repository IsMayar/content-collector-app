package com.ayaantrix.collector.submission.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Repository
public class SubmissionRepository {
    private final JdbcTemplate jdbc;
    private final JsonMapper json;

    public SubmissionRepository(JdbcTemplate jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public void event(UUID w, UUID p, UUID i, UUID r, String kind, Instant now) {
        jdbc.update(
                "insert into"
                    + " collector.submission_events(workspace_id,project_id,item_id,revision_id,event_type,occurred_at)"
                    + " values(?,?,?,?,?,?)",
                w,
                p,
                i,
                r,
                kind,
                Timestamp.from(now));
    }

    public int next(UUID w, UUID p, UUID i) {
        return jdbc.queryForObject(
                "select coalesce(max(revision_no),0)+1 from collector.submission_revisions where"
                        + " workspace_id=? and project_id=? and item_id=?",
                Integer.class,
                w,
                p,
                i);
    }

    public void insert(
            UUID w,
            UUID p,
            UUID i,
            UUID r,
            int n,
            long structure,
            long answer,
            UUID contact,
            Instant now,
            JsonNode schema,
            JsonNode value,
            List<JsonNode> sections,
            List<JsonNode> assets) {
        jdbc.update(
                "insert into"
                    + " collector.submission_revisions(id,workspace_id,project_id,item_id,revision_no,structure_version,answer_version,submitted_by_contact_id,submitted_at,schema_snapshot,value_snapshot,structure_snapshot)"
                    + " values(?,?,?,?,?,?,?,?,?,?::jsonb,?::jsonb,?::jsonb)",
                r,
                w,
                p,
                i,
                n,
                structure,
                answer,
                contact,
                Timestamp.from(now),
                schema.toString(),
                value.toString(),
                json.writeValueAsString(sections));
        for (var a : assets)
            jdbc.update(
                    "insert into"
                        + " collector.revision_assets(workspace_id,project_id,item_id,revision_id,asset_id,manifest)"
                        + " values(?,?,?,?,?,?::jsonb)",
                    w,
                    p,
                    i,
                    r,
                    UUID.fromString(a.path("id").asText()),
                    a.toString());
        transition(w, p, i, "SUBMITTED", r, now);
        event(w, p, i, r, "ITEM_SUBMITTED", now);
    }

    public void transition(UUID w, UUID p, UUID i, String state, UUID revision, Instant now) {
        if (jdbc.update(
                        "update collector.items set"
                            + " state=?,current_revision_id=?,version=version+1,updated_at=? where"
                            + " workspace_id=? and project_id=? and id=?",
                        state,
                        revision,
                        Timestamp.from(now),
                        w,
                        p,
                        i)
                != 1) throw new IllegalStateException("Missing locked item");
        jdbc.update(
                "update collector.projects set version=version+1,updated_at=? where workspace_id=?"
                    + " and id=?",
                Timestamp.from(now),
                w,
                p);
    }

    public List<JsonNode> history(UUID w, UUID p, UUID i) {
        return jdbc.query(
                "select r.*,it.item_key from collector.submission_revisions r join collector.items"
                    + " it on it.id=r.item_id where r.workspace_id=? and r.project_id=? and"
                    + " r.item_id=? order by revision_no desc",
                (rs, n) ->
                        json.createObjectNode()
                                .put("revisionId", rs.getString("id"))
                                .put("itemId", rs.getString("item_id"))
                                .put("itemKey", rs.getString("item_key"))
                                .put("revisionNo", rs.getInt("revision_no"))
                                .put(
                                        "submittedAt",
                                        rs.getTimestamp("submitted_at").toInstant().toString())
                                .put("state", "SUBMITTED"),
                w,
                p,
                i);
    }

    public JsonNode detail(UUID w, UUID p, UUID i, UUID r) {
        var rows =
                jdbc.query(
                        "select * from collector.submission_revisions where workspace_id=? and"
                            + " project_id=? and item_id=? and id=?",
                        (rs, n) -> {
                            var node =
                                    json.createObjectNode()
                                            .put("revisionId", r.toString())
                                            .put("itemId", i.toString())
                                            .put("revisionNo", rs.getInt("revision_no"))
                                            .put(
                                                    "submittedAt",
                                                    rs.getTimestamp("submitted_at")
                                                            .toInstant()
                                                            .toString())
                                            .put(
                                                    "submittedByContactId",
                                                    rs.getString("submitted_by_contact_id"))
                                            .put(
                                                    "structureVersion",
                                                    rs.getLong("structure_version"));
                            var schema = json.readTree(rs.getString("schema_snapshot"));
                            node.put("itemKey", schema.path("key").asText());
                            node.set("schemaSnapshot", schema);
                            node.set(
                                    "valueSnapshot", json.readTree(rs.getString("value_snapshot")));

                            node.set(
                                    "assets",
                                    json.valueToTree(
                                            jdbc.query(
                                                    "select manifest::text from"
                                                        + " collector.revision_assets where"
                                                        + " workspace_id=? and project_id=? and"
                                                        + " revision_id=? order by asset_id",
                                                    (a, b) -> json.readTree(a.getString(1)),
                                                    w,
                                                    p,
                                                    r)));
                            return (JsonNode) node;
                        },
                        w,
                        p,
                        i,
                        r);
        return rows.stream()
                .findFirst()
                .orElseThrow(
                        com.ayaantrix.collector.project.security.ProjectAuthorization::missing);
    }

    public List<JsonNode> queue(UUID w, UUID p, int page, int size) {
        return jdbc.query(
                "select r.*,i.item_key from collector.submission_revisions r join collector.items i"
                    + " on i.current_revision_id=r.id and i.state='SUBMITTED' where"
                    + " r.workspace_id=? and r.project_id=? order by r.submitted_at,r.id limit ?"
                    + " offset ?",
                (rs, n) ->
                        (JsonNode)
                                json.createObjectNode()
                                        .put("revisionId", rs.getString("id"))
                                        .put("itemId", rs.getString("item_id"))
                                        .put("itemKey", rs.getString("item_key"))
                                        .put("revisionNo", rs.getInt("revision_no"))
                                        .put(
                                                "submittedAt",
                                                rs.getTimestamp("submitted_at")
                                                        .toInstant()
                                                        .toString()),
                w,
                p,
                size,
                page * size);
    }

    public long queueCount(UUID w, UUID p) {
        return jdbc.queryForObject(
                "select count(*) from collector.submission_revisions r join collector.items i on"
                    + " i.current_revision_id=r.id and i.state='SUBMITTED' where r.workspace_id=?"
                    + " and r.project_id=?",
                Long.class,
                w,
                p);
    }
}

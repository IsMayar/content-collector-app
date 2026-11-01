package com.ayaantrix.collector.review.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Repository
public class ReviewRepository {
    private final JdbcTemplate jdbc;
    private final JsonMapper json;

    public ReviewRepository(JdbcTemplate jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public JsonNode item(UUID w, UUID p, UUID i) {
        return jdbc
                .query(
                        "select id,state,version,current_revision_id from collector.items where"
                            + " workspace_id=? and project_id=? and id=? for update",
                        (rs, n) ->
                                (JsonNode)
                                        json.createObjectNode()
                                                .put("id", rs.getString("id"))
                                                .put("state", rs.getString("state"))
                                                .put("version", rs.getLong("version"))
                                                .put(
                                                        "currentRevisionId",
                                                        rs.getString("current_revision_id")),
                        w,
                        p,
                        i)
                .stream()
                .findFirst()
                .orElseThrow(
                        com.ayaantrix.collector.project.security.ProjectAuthorization::missing);
    }

    public void decide(
            UUID id,
            UUID w,
            UUID p,
            UUID i,
            UUID r,
            UUID member,
            String decision,
            String reason,
            long expected,
            Instant now) {
        jdbc.update(
                "insert into"
                    + " collector.review_decisions(id,workspace_id,project_id,item_id,revision_id,reviewed_by_member_id,decision,reason,expected_item_version,created_at)"
                    + " values(?,?,?,?,?,?,?,?,?,?)",
                id,
                w,
                p,
                i,
                r,
                member,
                decision,
                reason,
                expected,
                Timestamp.from(now));
    }

    public List<JsonNode> decisions(UUID w, UUID p, UUID i, UUID r) {
        return jdbc.query(
                "select d.*,u.display_name from collector.review_decisions d join"
                    + " collector.workspace_members m on m.id=d.reviewed_by_member_id and"
                    + " m.workspace_id=d.workspace_id join collector.users u on u.id=m.user_id"
                    + " where d.workspace_id=? and d.project_id=? and d.item_id=? and"
                    + " d.revision_id=? order by d.created_at,d.id",
                (rs, n) ->
                        (JsonNode)
                                json.createObjectNode()
                                        .put("id", rs.getString("id"))
                                        .put("revisionId", rs.getString("revision_id"))
                                        .put("decision", rs.getString("decision"))
                                        .put("reason", rs.getString("reason"))
                                        .put(
                                                "reviewedAt",
                                                rs.getTimestamp("created_at")
                                                        .toInstant()
                                                        .toString())
                                        .put("reviewerDisplayName", rs.getString("display_name")),
                w,
                p,
                i,
                r);
    }

    public UUID comment(
            UUID w,
            UUID p,
            UUID i,
            UUID r,
            UUID member,
            UUID contact,
            String body,
            String visibility,
            Instant now) {
        UUID id = UUID.randomUUID();
        jdbc.update(
                "insert into"
                    + " collector.comments(id,workspace_id,project_id,item_id,revision_id,author_member_id,author_contact_id,body,visibility,created_at)"
                    + " values(?,?,?,?,?,?,?,?,?,?)",
                id,
                w,
                p,
                i,
                r,
                member,
                contact,
                body,
                visibility,
                Timestamp.from(now));
        return id;
    }

    public List<JsonNode> comments(UUID w, UUID p, UUID i, boolean client) {
        return jdbc.query(
                "select c.*,u.display_name member_name,pc.name contact_name from collector.comments"
                    + " c left join collector.workspace_members m on m.workspace_id=c.workspace_id"
                    + " and m.id=c.author_member_id left join collector.users u on u.id=m.user_id"
                    + " left join collector.project_contacts pc on pc.workspace_id=c.workspace_id"
                    + " and pc.project_id=c.project_id and pc.id=c.author_contact_id where"
                    + " c.workspace_id=? and c.project_id=? and c.item_id=?"
                        + (client ? " and c.visibility='CLIENT'" : "")
                        + " order by c.created_at,c.id",
                (rs, n) -> {
                    var node =
                            json.createObjectNode()
                                    .put("id", rs.getString("id"))
                                    .put("body", rs.getString("body"))
                                    .put(
                                            "authorDisplayName",
                                            rs.getString("member_name") != null
                                                    ? rs.getString("member_name")
                                                    : rs.getString("contact_name"))
                                    .put(
                                            "createdAt",
                                            rs.getTimestamp("created_at").toInstant().toString())
                                    .put("revisionId", rs.getString("revision_id"));
                    if (!client) node.put("visibility", rs.getString("visibility"));
                    return (JsonNode) node;
                },
                w,
                p,
                i);
    }
}

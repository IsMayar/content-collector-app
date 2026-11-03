package com.ayaantrix.collector.analytics.repository;

import com.ayaantrix.collector.analytics.dto.ActivityDtos.*;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.*;

import java.util.*;

@Repository
@Transactional(propagation = Propagation.MANDATORY)
public class ActivityRepository {
    private final JdbcTemplate jdbc;

    public ActivityRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // Deliberately project only fixed metadata, never metadata_json, names, comments or answers.
    public Activity read(UUID w, UUID p, int page, int size) {
        var rows =
                jdbc.query(
                        "select id,action,resource_kind,resource_id,actor_kind,created_at from"
                            + " collector.audit_logs where workspace_id=? and project_id=? order by"
                            + " created_at desc,id desc limit ? offset ?",
                        (r, n) ->
                                new SafeAuditEvent(
                                        r.getObject("id", UUID.class),
                                        r.getString("action"),
                                        r.getString("resource_kind"),
                                        r.getObject("resource_id", UUID.class),
                                        switch (r.getString("actor_kind")) {
                                            case "USER" -> "Agency member";
                                            case "CLIENT" -> "Client";
                                            default -> "System";
                                        },
                                        r.getTimestamp("created_at").toInstant()),
                        w,
                        p,
                        size,
                        (long) page * size);
        return new Activity(
                rows,
                new Page(
                        page,
                        size,
                        jdbc.queryForObject(
                                "select count(*) from collector.audit_logs where workspace_id=? and"
                                    + " project_id=?",
                                Long.class,
                                w,
                                p)));
    }
}

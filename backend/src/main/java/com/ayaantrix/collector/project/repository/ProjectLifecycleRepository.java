package com.ayaantrix.collector.project.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Repository
public class ProjectLifecycleRepository {
    private final JdbcTemplate jdbc;
    private final com.ayaantrix.collector.clientaccess.repository.ClientAccessRepository grants;

    public ProjectLifecycleRepository(
            JdbcTemplate jdbc,
            com.ayaantrix.collector.clientaccess.repository.ClientAccessRepository grants) {
        this.jdbc = jdbc;
        this.grants = grants;
    }

    public boolean contact(UUID w, UUID p, Instant now) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        "select exists(select 1 from collector.project_contacts where"
                            + " workspace_id=? and project_id=? and state='ACTIVE' and"
                            + " access_expires_at>?)",
                        Boolean.class,
                        w,
                        p,
                        Timestamp.from(now)));
    }

    public boolean opened(UUID w, UUID p, UUID i, UUID r) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        "select exists(select 1 from collector.item_reopenings where workspace_id=?"
                            + " and project_id=? and item_id=? and revision_id=?) or exists(select"
                            + " 1 from collector.review_decisions where workspace_id=? and"
                            + " project_id=? and item_id=? and revision_id=? and"
                            + " decision='REQUEST_CHANGES')",
                        Boolean.class,
                        w,
                        p,
                        i,
                        r,
                        w,
                        p,
                        i,
                        r));
    }

    public void opening(UUID w, UUID p, UUID i, UUID r, UUID member, String reason, Instant now) {
        jdbc.update(
                "insert into"
                    + " collector.item_reopenings(workspace_id,project_id,item_id,revision_id,opened_by_member_id,reason,created_at)"
                    + " values(?,?,?,?,?,?,?)",
                w,
                p,
                i,
                r,
                member,
                reason,
                Timestamp.from(now));
    }

    public void stopInvitations(UUID w, UUID p, Instant now) {
        jdbc.query(
                        "select id from collector.project_contacts where workspace_id=? and"
                            + " project_id=?",
                        (rs, n) -> rs.getObject(1, UUID.class),
                        w,
                        p)
                .forEach(
                        id -> {
                            grants.contact(w, p, id)
                                    .ifPresent(g -> grants.revokeInvitations(g, now));
                        });
    }

    public void transition(
            UUID w,
            UUID p,
            UUID member,
            String action,
            String from,
            String to,
            long version,
            String reason,
            Instant now) {
        jdbc.update(
                "insert into"
                    + " collector.project_lifecycle_events(workspace_id,project_id,actor_member_id,action,from_state,to_state,project_version,reason,occurred_at)"
                    + " values(?,?,?,?,?,?,?,?,?)",
                w,
                p,
                member,
                action,
                from,
                to,
                version,
                reason,
                Timestamp.from(now));
    }
}

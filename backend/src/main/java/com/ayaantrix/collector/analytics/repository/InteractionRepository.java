package com.ayaantrix.collector.analytics.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.*;

import java.time.Instant;
import java.util.UUID;

@Repository
@Transactional(propagation = Propagation.MANDATORY)
public class InteractionRepository {
    private final JdbcTemplate jdbc;

    public InteractionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean excluded(UUID w, UUID p) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        "select analytics_excluded from collector.projects where workspace_id=? and"
                            + " id=?",
                        Boolean.class,
                        w,
                        p));
    }

    public int insert(
            UUID w,
            UUID p,
            UUID template,
            String session,
            UUID event,
            String type,
            UUID item,
            Instant received,
            Instant reported) {
        return jdbc.update(
                """
                insert into collector.analytics_events(id,workspace_id,project_id,template_version_id,session_pseudonym,client_event_id,event_type,item_id,item_key,received_at,reported_at)
                select ?,?,?,?, ?,?,?,?,i.item_key,?,? from (select 1) x left join collector.items i on i.workspace_id=? and i.project_id=? and i.id=?
                on conflict do nothing
                """,
                UUID.randomUUID(),
                w,
                p,
                template,
                session,
                event,
                type,
                item,
                java.sql.Timestamp.from(received),
                reported == null ? null : java.sql.Timestamp.from(reported),
                w,
                p,
                item);
    }

    public int purge(Instant before) {
        return jdbc.update(
                "delete from collector.analytics_events where received_at<?",
                java.sql.Timestamp.from(before));
    }
}

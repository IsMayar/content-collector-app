package com.ayaantrix.collector.analytics.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.*;

import java.time.*;
import java.util.*;

@Repository
@Transactional(propagation = Propagation.MANDATORY)
public class AnalyticsRepository {
    public record Observation(
            UUID project,
            UUID item,
            UUID template,
            String key,
            String type,
            String title,
            Instant start,
            Instant firstSubmission) {}

    private final JdbcTemplate jdbc;

    public AnalyticsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Observation> observations(UUID w, UUID project, Instant now) {
        return jdbc.query(
                """
                select e.project_id,e.item_id,e.template_version_id,e.item_key,p.project_type,t.title,e.received_at,
                (select min(r.submitted_at) from collector.submission_revisions r where r.workspace_id=e.workspace_id and r.project_id=e.project_id and r.item_id=e.item_id and r.submitted_at<=?) first_submission
                from collector.analytics_events e
                join collector.projects p on p.workspace_id=e.workspace_id and p.id=e.project_id
                join collector.template_versions v on v.id=e.template_version_id
                join collector.templates t on t.id=v.template_id
                where e.workspace_id=? and (?::uuid is null or e.project_id=?::uuid)
                and not p.analytics_excluded and e.event_type='item_started' and e.received_at>=? and e.received_at<=?
                order by e.template_version_id,e.item_key,p.project_type,e.project_id,e.item_id,e.received_at,e.id
                """,
                (r, n) ->
                        new Observation(
                                r.getObject("project_id", UUID.class),
                                r.getObject("item_id", UUID.class),
                                r.getObject("template_version_id", UUID.class),
                                r.getString("item_key"),
                                r.getString("project_type"),
                                r.getString("title"),
                                r.getTimestamp("received_at").toInstant(),
                                r.getTimestamp("first_submission") == null
                                        ? null
                                        : r.getTimestamp("first_submission").toInstant()),
                java.sql.Timestamp.from(now),
                w,
                project,
                project,
                java.sql.Timestamp.from(now.minus(Duration.ofDays(90))),
                java.sql.Timestamp.from(now));
    }
}

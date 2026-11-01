package com.ayaantrix.collector.attachment.repository;

import com.ayaantrix.collector.attachment.dto.AttachmentDtos.Summary;
import com.ayaantrix.collector.attachment.entity.Attachment;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import tools.jackson.databind.json.JsonMapper;

import java.sql.*;
import java.time.*;
import java.util.*;

@Repository
public class AttachmentRepository {
    private final JdbcTemplate jdbc;
    private final JsonMapper json;

    public AttachmentRepository(JdbcTemplate jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    private static final String SELECT =
            "select a.*,r.id upload_id,r.state reservation_state,r.reserved_bytes,r.expires_at from"
                + " collector.file_assets a join collector.upload_reservations r on r.asset_id=a.id"
                + " ";

    private Attachment map(ResultSet r, int n) throws SQLException {
        return new Attachment(
                r.getObject("id", UUID.class),
                r.getObject("workspace_id", UUID.class),
                r.getObject("project_id", UUID.class),
                r.getObject("item_id", UUID.class),
                r.getObject("uploaded_by_contact_id", UUID.class),
                r.getString("state"),
                r.getString("original_name"),
                r.getString("declared_type"),
                r.getString("detected_type"),
                r.getLong("source_bytes"),
                r.getLong("retained_bytes"),
                r.getBoolean("keep_original"),
                r.getString("staging_key"),
                r.getString("canonical_key"),
                json.readTree(r.getString("variants_json")),
                json.readTree(r.getString("object_keys_json")),
                r.getString("rejection_code"),
                r.getObject("lease_owner", UUID.class),
                r.getTimestamp("lease_until") == null
                        ? null
                        : r.getTimestamp("lease_until").toInstant(),
                r.getInt("attempts"),
                r.getTimestamp("created_at").toInstant(),
                r.getTimestamp("cleanup_after").toInstant(),
                r.getObject("upload_id", UUID.class),
                r.getString("reservation_state"),
                r.getLong("reserved_bytes"),
                r.getTimestamp("expires_at").toInstant());
    }

    public Optional<Attachment> find(UUID w, UUID p, UUID id) {
        return jdbc
                .query(
                        SELECT + "where a.workspace_id=? and a.project_id=? and a.id=?",
                        this::map,
                        w,
                        p,
                        id)
                .stream()
                .findFirst();
    }

    public Optional<Attachment> upload(UUID w, UUID p, UUID id) {
        return jdbc
                .query(
                        SELECT + "where a.workspace_id=? and a.project_id=? and r.id=?",
                        this::map,
                        w,
                        p,
                        id)
                .stream()
                .findFirst();
    }

    public List<Attachment> item(UUID w, UUID p, UUID item) {
        return jdbc.query(
                SELECT
                        + "where a.workspace_id=? and a.project_id=? and a.item_id=? and"
                        + " a.state<>'DELETED' order by a.created_at,a.id",
                this::map,
                w,
                p,
                item);
    }

    public Summary summary(Attachment a) {
        var variants = new ArrayList<String>();
        if (a.state().equals("READY"))
            for (String key : a.variants().propertyNames()) variants.add(key);
        return new Summary(
                a.id(),
                a.item(),
                a.name(),
                a.detectedType(),
                a.state(),
                a.bytes(),
                a.retained(),
                a.keep(),
                List.copyOf(variants),
                a.rejection());
    }

    public List<Summary> summaries(UUID w, UUID p, UUID item) {
        return item(w, p, item).stream().map(this::summary).toList();
    }

    public void reserve(
            UUID w,
            UUID p,
            UUID item,
            UUID contact,
            UUID asset,
            UUID upload,
            String name,
            String type,
            long bytes,
            boolean keep,
            long reservation,
            String key,
            Instant now) {
        int ok =
                jdbc.update(
                        "update collector.workspaces set"
                            + " storage_reserved_bytes=storage_reserved_bytes+? where id=? and"
                            + " storage_used_bytes+storage_reserved_bytes+?<=storage_limit_bytes",
                        reservation,
                        w,
                        reservation);
        if (ok != 1) {
            // The caller holds the workspace lock: these figures describe the same quota decision.
            var quota =
                    jdbc.queryForMap(
                            "select storage_used_bytes, greatest(0,"
                                + " storage_limit_bytes-storage_used_bytes-storage_reserved_bytes)"
                                + " available_bytes from collector.workspaces where id=?",
                            w);
            throw new com.ayaantrix.collector.common.error.StorageQuotaException(
                    ((Number) quota.get("storage_used_bytes")).longValue(),
                    ((Number) quota.get("available_bytes")).longValue());
        }
        var t = Timestamp.from(now);
        jdbc.update(
                "insert into"
                    + " collector.file_assets(id,workspace_id,project_id,item_id,uploaded_by_contact_id,state,original_name,declared_type,source_bytes,keep_original,staging_key,available_at,cleanup_after,created_at,updated_at)"
                    + " values(?,?,?,?,?,'RESERVED',?,?,?,?,?,?,?,?,?)",
                asset,
                w,
                p,
                item,
                contact,
                name,
                type,
                bytes,
                keep,
                key,
                t,
                Timestamp.from(now.plus(Duration.ofHours(24))),
                t,
                t);
        jdbc.update(
                "insert into"
                    + " collector.upload_reservations(id,workspace_id,project_id,asset_id,reserved_bytes,state,expires_at,created_at,updated_at)"
                    + " values(?,?,?,?,?,'RESERVED',?,?,?)",
                upload,
                w,
                p,
                asset,
                reservation,
                Timestamp.from(now.plusSeconds(600)),
                t,
                t);
        // Pending file collection also protects the structure before an answer references a READY
        // asset.
        jdbc.update(
                "update collector.items set state='DRAFT',version=version+1,updated_at=? where"
                        + " workspace_id=? and project_id=? and id=?",
                t,
                w,
                p,
                item);
        jdbc.update(
                "update collector.projects set version=version+1,updated_at=? where workspace_id=?"
                        + " and id=?",
                t,
                w,
                p);
    }

    public void finalizeUpload(Attachment a, Instant now) {
        jdbc.update(
                "update collector.file_assets set state='PROCESSING',available_at=?,updated_at=?"
                        + " where id=? and state='RESERVED'",
                Timestamp.from(now),
                Timestamp.from(now),
                a.id());
        jdbc.update(
                "update collector.upload_reservations set state='FINALIZED',updated_at=? where"
                        + " asset_id=? and state='RESERVED'",
                Timestamp.from(now),
                a.id());
    }

    public void release(Attachment a, String state, String code, Instant now) {
        int changed =
                jdbc.update(
                        "update collector.upload_reservations set"
                            + " state='RELEASED',released_at=?,updated_at=? where asset_id=? and"
                            + " released_at is null",
                        Timestamp.from(now),
                        Timestamp.from(now),
                        a.id());
        if (changed == 1)
            jdbc.update(
                    "update collector.workspaces set"
                            + " storage_reserved_bytes=storage_reserved_bytes-? where id=? and"
                            + " storage_reserved_bytes>=?",
                    a.reserved(),
                    a.workspace(),
                    a.reserved());
        jdbc.update(
                "update collector.file_assets set"
                    + " state=?,rejection_code=?,lease_owner=null,lease_until=null,cleaned_at=null,updated_at=?"
                    + " where id=?",
                state,
                code,
                Timestamp.from(now),
                a.id());
    }

    public List<Attachment> candidates(Instant now) {
        return jdbc.query(
                SELECT
                        + "where a.state='PROCESSING' and a.available_at<=? and (a.lease_until is"
                        + " null or a.lease_until<=?) order by a.available_at,a.id limit 5",
                this::map,
                Timestamp.from(now),
                Timestamp.from(now));
    }

    public Attachment claim(Attachment a, UUID lease, Instant now) {
        String key =
                "objects/"
                        + a.workspace()
                        + "/"
                        + a.project()
                        + "/"
                        + a.id()
                        + "/"
                        + UUID.randomUUID();
        int n =
                jdbc.update(
                        "update collector.file_assets set"
                            + " lease_owner=?,lease_until=?,attempts=attempts+1,object_keys_json=object_keys_json"
                            + " || ?::jsonb,updated_at=? where id=? and state='PROCESSING' and"
                            + " (lease_until is null or lease_until<=?)",
                        lease,
                        Timestamp.from(now.plusSeconds(600)),
                        json.writeValueAsString(List.of(key, key + "-working", key + "-thumbnail")),
                        Timestamp.from(now),
                        a.id(),
                        Timestamp.from(now));
        if (n != 1) return null;
        return find(a.workspace(), a.project(), a.id()).orElseThrow();
    }

    public void retry(Attachment a, String code, Instant now) {
        jdbc.update(
                "update collector.file_assets set"
                    + " rejection_code=?,lease_owner=null,lease_until=null,available_at=?,updated_at=?"
                    + " where id=? and lease_owner=? and state='PROCESSING'",
                code,
                Timestamp.from(now.plusSeconds(Math.min(300, 10L * a.attempts()))),
                Timestamp.from(now),
                a.id(),
                a.lease());
    }

    public void ready(
            Attachment a,
            String canonical,
            String type,
            String sha,
            Map<String, String> variants,
            long actual,
            Instant now) {
        if (actual > a.reserved()) throw new IllegalStateException("Variants exceeded reservation");
        int n =
                jdbc.update(
                        "update collector.file_assets set"
                            + " state='READY',canonical_key=?,detected_type=?,sha256=?,variants_json=?::jsonb,retained_bytes=?,rejection_code=null,lease_owner=null,lease_until=null,updated_at=?"
                            + " where id=? and lease_owner=? and state='PROCESSING'",
                        canonical,
                        type,
                        sha,
                        json.writeValueAsString(variants),
                        actual,
                        Timestamp.from(now),
                        a.id(),
                        a.lease());
        if (n != 1) throw new IllegalStateException("Upload lease changed");
        int released =
                jdbc.update(
                        "update collector.upload_reservations set released_at=?,updated_at=? where"
                                + " asset_id=? and released_at is null",
                        Timestamp.from(now),
                        Timestamp.from(now),
                        a.id());
        if (released != 1) throw new IllegalStateException("Reservation already released");
        jdbc.update(
                "update collector.workspaces set"
                    + " storage_reserved_bytes=storage_reserved_bytes-?,storage_used_bytes=storage_used_bytes+?"
                    + " where id=?",
                a.reserved(),
                actual,
                a.workspace());
    }

    /** Retained historical files consume storage, but not a later draft's empty selection slots. */
    public long blockingSlots(UUID workspace, UUID project, UUID item) {
        return jdbc.queryForObject(
                """
                select count(*) from collector.file_assets a
                where a.workspace_id=? and a.project_id=? and a.item_id=?
                  and (a.state in ('RESERVED','UPLOADED','PROCESSING') or
                    (a.state='READY' and (not exists(select 1 from collector.revision_assets r
                       where r.workspace_id=a.workspace_id and r.project_id=a.project_id and r.asset_id=a.id)
                      or exists(select 1 from collector.answers d where d.workspace_id=a.workspace_id
                       and d.project_id=a.project_id and d.item_id=a.item_id and d.value_json::text like '%'||a.id::text||'%'))))
                """,
                Long.class, workspace, project, item);
    }

    public boolean retained(Attachment a) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        "select exists(select 1 from collector.revision_assets where workspace_id=?"
                                + " and project_id=? and asset_id=?)",
                        Boolean.class,
                        a.workspace(),
                        a.project(),
                        a.id()));
    }

    public boolean referenced(Attachment a) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        "select exists(select 1 from collector.answers where workspace_id=? and"
                            + " project_id=? and value_json::text like ?) or exists(select 1 from"
                            + " collector.revision_assets where workspace_id=? and project_id=? and"
                            + " asset_id=?)",
                        Boolean.class,
                        a.workspace(),
                        a.project(),
                        "%" + a.id() + "%",
                        a.workspace(),
                        a.project(),
                        a.id()));
    }

    public List<Attachment> cleanup(Instant now) {
        return jdbc.query(
                SELECT
                        + "where (a.state='RESERVED' and r.expires_at<=?) or (a.state in"
                        + " ('DELETED','REJECTED','FAILED','READY') and a.cleaned_at is null and"
                        + " a.cleanup_after<=?) order by a.created_at limit 50",
                this::map,
                Timestamp.from(now),
                Timestamp.from(now));
    }

    public List<UUID> workspaces() {
        return jdbc.queryForList("select id from collector.workspaces order by id", UUID.class);
    }

    public void reconcile(UUID w) {
        jdbc.queryForObject(
                "select id from collector.workspaces where id=? for update", UUID.class, w);
        jdbc.update(
                "update collector.workspaces w set storage_used_bytes=(select"
                    + " coalesce(sum(retained_bytes),0) from collector.file_assets where"
                    + " workspace_id=w.id),storage_reserved_bytes=(select"
                    + " coalesce(sum(reserved_bytes),0) from collector.upload_reservations where"
                    + " workspace_id=w.id and released_at is null) where w.id=?",
                w);
    }

    public void lockScope(UUID w, UUID p) {
        jdbc.queryForObject(
                "select id from collector.workspaces where id=? for update", UUID.class, w);
        jdbc.queryForObject(
                "select id from collector.projects where workspace_id=? and id=? for update",
                UUID.class,
                w,
                p);
    }

    public void cleaned(Attachment a, Instant now) {
        int n =
                jdbc.update(
                        "update collector.file_assets set cleaned_at=?,retained_bytes=case when"
                                + " state='READY' then retained_bytes else 0 end where id=? and"
                                + " cleaned_at is null",
                        Timestamp.from(now),
                        a.id());
        if (n == 1 && a.retained() > 0 && !a.state().equals("READY"))
            jdbc.update(
                    "update collector.workspaces set storage_used_bytes=storage_used_bytes-? where"
                            + " id=? and storage_used_bytes>=?",
                    a.retained(),
                    a.workspace(),
                    a.retained());
    }
}

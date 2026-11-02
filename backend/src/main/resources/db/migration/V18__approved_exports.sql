-- Immutable approved snapshots with independently mutable durable execution state.
CREATE TABLE collector.export_jobs (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, project_id uuid NOT NULL,
 requested_by_member_id uuid NOT NULL, format text NOT NULL CHECK(format IN ('APPROVED_ZIP','APPROVED_JSON','APPROVED_MARKDOWN')),
 project_version bigint NOT NULL CHECK(project_version>0), manifest_json jsonb NOT NULL,
 partial_acknowledged boolean NOT NULL, state text NOT NULL CHECK(state IN ('QUEUED','RUNNING','READY','FAILED','EXPIRED','CANCELLED')),
 object_key text UNIQUE, bytes bigint CHECK(bytes>=0), expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 lease_id uuid, lease_until timestamptz, attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
 available_at timestamptz NOT NULL, failure_code text, cleaned_at timestamptz,
 FOREIGN KEY(workspace_id,project_id) REFERENCES collector.projects(workspace_id,id),
 FOREIGN KEY(workspace_id,requested_by_member_id) REFERENCES collector.workspace_members(workspace_id,id),
 CHECK(expires_at=created_at+interval '24 hours'),
 CHECK((state='READY') IS NOT TRUE OR (object_key IS NOT NULL AND bytes IS NOT NULL))
);
CREATE INDEX export_dispatch ON collector.export_jobs(available_at,created_at) WHERE state IN ('QUEUED','RUNNING');
CREATE INDEX export_project_history ON collector.export_jobs(workspace_id,project_id,created_at DESC);
CREATE FUNCTION collector.protect_export_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Export snapshots are immutable'; END IF;
 IF ROW(NEW.id,NEW.workspace_id,NEW.project_id,NEW.requested_by_member_id,NEW.format,NEW.project_version,NEW.manifest_json,NEW.partial_acknowledged,NEW.created_at,NEW.expires_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.workspace_id,OLD.project_id,OLD.requested_by_member_id,OLD.format,OLD.project_version,OLD.manifest_json,OLD.partial_acknowledged,OLD.created_at,OLD.expires_at)
 THEN RAISE EXCEPTION 'Export snapshots are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER export_snapshot_immutable BEFORE UPDATE OR DELETE ON collector.export_jobs FOR EACH ROW EXECUTE FUNCTION collector.protect_export_snapshot();

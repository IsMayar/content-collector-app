-- Append-only item revisions. Lifecycle markers live on items, never on historical payloads.
CREATE TABLE collector.submission_revisions (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,project_id uuid NOT NULL,item_id uuid NOT NULL,
 revision_no integer NOT NULL CHECK(revision_no>0),structure_version bigint NOT NULL CHECK(structure_version>0),
 answer_version bigint NOT NULL CHECK(answer_version>=0),submitted_by_contact_id uuid NOT NULL,submitted_at timestamptz NOT NULL,
 schema_snapshot jsonb NOT NULL CHECK(jsonb_typeof(schema_snapshot)='object' AND schema_snapshot->>'id'=item_id::text),value_snapshot jsonb NOT NULL CHECK(jsonb_typeof(value_snapshot)='object'),structure_snapshot jsonb NOT NULL CHECK(jsonb_typeof(structure_snapshot)='array'),
 UNIQUE(item_id,revision_no),UNIQUE(workspace_id,project_id,item_id,id),
 FOREIGN KEY(workspace_id,project_id,item_id) REFERENCES collector.items(workspace_id,project_id,id),
 FOREIGN KEY(workspace_id,project_id,submitted_by_contact_id) REFERENCES collector.project_contacts(workspace_id,project_id,id)
);
CREATE TABLE collector.revision_assets (
 workspace_id uuid NOT NULL,project_id uuid NOT NULL,item_id uuid NOT NULL,revision_id uuid NOT NULL,asset_id uuid NOT NULL,
 manifest jsonb NOT NULL,PRIMARY KEY(revision_id,asset_id),
 FOREIGN KEY(workspace_id,project_id,item_id,revision_id) REFERENCES collector.submission_revisions(workspace_id,project_id,item_id,id),
 FOREIGN KEY(workspace_id,project_id,item_id,asset_id) REFERENCES collector.file_assets(workspace_id,project_id,item_id,id)
);
CREATE FUNCTION collector.reject_submission_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Submitted history is immutable' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER revision_immutable BEFORE UPDATE OR DELETE ON collector.submission_revisions FOR EACH ROW EXECUTE FUNCTION collector.reject_submission_change();
CREATE TRIGGER revision_assets_immutable BEFORE UPDATE OR DELETE ON collector.revision_assets FOR EACH ROW EXECUTE FUNCTION collector.reject_submission_change();
CREATE INDEX submission_project_queue ON collector.submission_revisions(workspace_id,project_id,submitted_at,id);
CREATE INDEX revision_asset_retention ON collector.revision_assets(workspace_id,project_id,asset_id);
-- Deliberately no FK on legacy current_revision_id: old T11 fixtures and deferred review markers remain valid.

CREATE FUNCTION collector.protect_retained_asset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM collector.revision_assets WHERE asset_id=OLD.id) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Submitted assets are retained' USING ERRCODE='23514'; END IF;
  IF NEW.state<>OLD.state OR NEW.canonical_key IS DISTINCT FROM OLD.canonical_key OR NEW.variants_json<>OLD.variants_json OR NEW.sha256 IS DISTINCT FROM OLD.sha256 THEN
   RAISE EXCEPTION 'Submitted asset bytes are immutable' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER retained_asset_immutable BEFORE UPDATE OR DELETE ON collector.file_assets FOR EACH ROW EXECUTE FUNCTION collector.protect_retained_asset();

CREATE TABLE collector.submission_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL,project_id uuid NOT NULL,item_id uuid NOT NULL,revision_id uuid NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('ITEM_SUBMITTED','ITEM_WITHDRAWN')), occurred_at timestamptz NOT NULL,
 FOREIGN KEY(workspace_id,project_id,item_id,revision_id) REFERENCES collector.submission_revisions(workspace_id,project_id,item_id,id)
);
CREATE INDEX submission_event_delivery ON collector.submission_events(occurred_at,id);
CREATE TRIGGER submission_event_immutable BEFORE UPDATE OR DELETE ON collector.submission_events FOR EACH ROW EXECUTE FUNCTION collector.reject_submission_change();

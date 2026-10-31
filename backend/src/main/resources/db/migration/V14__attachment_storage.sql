CREATE TABLE collector.file_assets (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,project_id uuid NOT NULL,item_id uuid NOT NULL,uploaded_by_contact_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('RESERVED','UPLOADED','PROCESSING','READY','REJECTED','FAILED','DELETED')),
 original_name varchar(250) NOT NULL,declared_type varchar(150) NOT NULL,detected_type varchar(150),source_bytes bigint NOT NULL CHECK(source_bytes>0 AND source_bytes<=104857600),
 retained_bytes bigint NOT NULL DEFAULT 0 CHECK(retained_bytes>=0),keep_original boolean NOT NULL,
 staging_key text NOT NULL UNIQUE,canonical_key text UNIQUE,variants_json jsonb NOT NULL DEFAULT '{}'::jsonb,object_keys_json jsonb NOT NULL DEFAULT '[]'::jsonb,
 sha256 char(64),rejection_code varchar(80),lease_owner uuid,lease_until timestamptz,attempts integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL,
 cleanup_after timestamptz NOT NULL,cleaned_at timestamptz,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,
 FOREIGN KEY(workspace_id,project_id,item_id) REFERENCES collector.items(workspace_id,project_id,id),
 FOREIGN KEY(workspace_id,project_id,uploaded_by_contact_id) REFERENCES collector.project_contacts(workspace_id,project_id,id),
 UNIQUE(workspace_id,project_id,id),UNIQUE(workspace_id,project_id,item_id,id),CHECK((lease_owner IS NULL)=(lease_until IS NULL)),
 CHECK(state<>'READY' OR (canonical_key IS NOT NULL AND detected_type IS NOT NULL AND sha256 IS NOT NULL AND retained_bytes>0))
);
CREATE TABLE collector.upload_reservations (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,project_id uuid NOT NULL,asset_id uuid NOT NULL UNIQUE,
 reserved_bytes bigint NOT NULL CHECK(reserved_bytes>0),state text NOT NULL CHECK(state IN ('RESERVED','FINALIZED','RELEASED','EXPIRED')),
 expires_at timestamptz NOT NULL,released_at timestamptz,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,
 FOREIGN KEY(workspace_id,project_id,asset_id) REFERENCES collector.file_assets(workspace_id,project_id,id),UNIQUE(workspace_id,project_id,id)
);
CREATE INDEX asset_project_item ON collector.file_assets(workspace_id,project_id,item_id,state);
CREATE INDEX asset_processing_jobs ON collector.file_assets(state,available_at,lease_until);
CREATE INDEX asset_cleanup ON collector.file_assets(cleanup_after,cleaned_at);
CREATE INDEX upload_reservation_expiry ON collector.upload_reservations(state,expires_at);

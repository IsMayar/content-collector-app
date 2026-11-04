-- T31: hash-only counts capabilities and opt-in durable daily digests.
CREATE TABLE collector.status_shares (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,project_id uuid NOT NULL,
 alias varchar(80) NOT NULL CHECK(length(btrim(alias)) BETWEEN 1 AND 80),
 token_hash char(64) NOT NULL UNIQUE,allowed_origins_json jsonb NOT NULL CHECK(jsonb_typeof(allowed_origins_json)='array'),
 expires_at timestamptz NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 days'),
 FOREIGN KEY(workspace_id,project_id) REFERENCES collector.projects(workspace_id,id),UNIQUE(workspace_id,project_id,id)
);
CREATE INDEX status_share_project ON collector.status_shares(workspace_id,project_id,created_at);
CREATE TABLE collector.digest_preferences (
 workspace_id uuid NOT NULL,member_id uuid NOT NULL,enabled boolean NOT NULL DEFAULT false,
 version bigint NOT NULL DEFAULT 0 CHECK(version>=0),updated_at timestamptz NOT NULL,
 PRIMARY KEY(workspace_id,member_id),FOREIGN KEY(workspace_id,member_id) REFERENCES collector.workspace_members(workspace_id,id)
);
CREATE TABLE collector.digest_jobs (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,member_id uuid NOT NULL,local_date date NOT NULL,
 state text NOT NULL CHECK(state IN ('QUEUED','SENDING','ACCEPTED','FAILED','UNKNOWN','CANCELLED')),
 lease_owner uuid,lease_until timestamptz,prepared_at timestamptz,provider_id text,failure_code varchar(80),
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,
 FOREIGN KEY(workspace_id,member_id) REFERENCES collector.workspace_members(workspace_id,id),
 UNIQUE(workspace_id,member_id,local_date),CHECK((lease_owner IS NULL)=(lease_until IS NULL))
);
CREATE INDEX digest_job_claim ON collector.digest_jobs(state,created_at,lease_until);

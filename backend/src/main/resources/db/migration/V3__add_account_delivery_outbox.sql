-- Durable verification delivery; no raw token is stored in payload_json.
CREATE TABLE collector.outbox_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type varchar(100) NOT NULL CHECK (job_type = 'VERIFY_EMAIL'),
    payload_json jsonb NOT NULL,
    encrypted_payload bytea,
    encryption_key_id varchar(80) NOT NULL,
    dedupe_key text NOT NULL UNIQUE,
    state text NOT NULL CHECK (state IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','DEAD')),
    available_at timestamptz NOT NULL DEFAULT now(),
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    lease_owner varchar(120),
    lease_expires_at timestamptz,
    last_error_code varchar(100),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (state NOT IN ('SUCCEEDED','DEAD') OR encrypted_payload IS NULL),
    CHECK (state NOT IN ('QUEUED','RUNNING') OR encrypted_payload IS NOT NULL),
    CHECK ((state='RUNNING') = (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL))
);
CREATE INDEX outbox_jobs_available_idx ON collector.outbox_jobs(state,available_at);
CREATE INDEX outbox_jobs_lease_idx ON collector.outbox_jobs(lease_expires_at) WHERE state='RUNNING';

-- Shared across API instances; IP addresses are hashed before persistence.
CREATE TABLE collector.account_request_limits (
    operation varchar(30) NOT NULL,
    key_hash char(64) NOT NULL,
    window_start timestamptz NOT NULL,
    request_count integer NOT NULL CHECK (request_count > 0),
    PRIMARY KEY(operation,key_hash)
);
CREATE INDEX account_request_limits_window_idx ON collector.account_request_limits(window_start);

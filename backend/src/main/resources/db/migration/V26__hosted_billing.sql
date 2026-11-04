-- Hosted URLs are encrypted capabilities, never JSON idempotency responses.
CREATE TABLE collector.billing_accounts (
 workspace_id uuid PRIMARY KEY REFERENCES collector.workspaces(id),
 customer_id text UNIQUE,
 customer_attempted_at timestamptz,
 next_reconcile_at timestamptz NOT NULL,
 delinquent_since timestamptz,
 fingerprint text,
 failure_code text,
 lease_id uuid,
 lease_until timestamptz,
 CHECK((lease_id IS NULL)=(lease_until IS NULL)),
 created_at timestamptz NOT NULL
);
CREATE TABLE collector.billing_operations (
 id uuid PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES collector.billing_accounts(workspace_id),
 actor_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('CHECKOUT','PORTAL')),
 plan_key text CHECK(plan_key IN ('SOLO','AGENCY')),
 idempotency_key text NOT NULL,
 request_hash text NOT NULL,
 lease_until timestamptz NOT NULL,
 encrypted_url bytea,
 encryption_key_id text,
 url_expires_at timestamptz,
 created_at timestamptz NOT NULL,
 UNIQUE(workspace_id,actor_id,kind,idempotency_key),
 CHECK((encrypted_url IS NULL)=(encryption_key_id IS NULL))
);
CREATE TABLE collector.billing_events (
 sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 event_id text PRIMARY KEY,
 body_hash text NOT NULL,
 event_type text NOT NULL,
 customer_id text,
 received_at timestamptz NOT NULL,
 processed_at timestamptz
);
CREATE INDEX billing_due ON collector.billing_accounts(next_reconcile_at) WHERE customer_id IS NOT NULL;
CREATE INDEX billing_pending_event ON collector.billing_events(customer_id,received_at) WHERE processed_at IS NULL;
ALTER TABLE collector.audit_logs DROP CONSTRAINT audit_actor_scope;
ALTER TABLE collector.audit_logs ADD CONSTRAINT audit_actor_scope CHECK(
 (actor_kind='USER' AND actor_id IS NOT NULL AND client_contact_id IS NULL)
 OR (actor_kind IN ('CLIENT','ANONYMOUS') AND actor_id IS NULL AND client_contact_id IS NOT NULL AND project_id IS NOT NULL)
 OR (actor_kind='SYSTEM' AND actor_id IS NULL AND client_contact_id IS NULL AND project_id IS NULL
     AND resource_kind='SUBSCRIPTION' AND action='SUBSCRIPTION_RECONCILED'));

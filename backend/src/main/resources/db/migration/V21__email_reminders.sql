-- Email reminder policy/outbox only. SMS and unknown-outcome reconciliation remain later tasks.
ALTER TABLE collector.project_contacts ADD COLUMN email_suppression_code text;
CREATE TABLE collector.reminder_policies (
 workspace_id uuid NOT NULL,project_id uuid PRIMARY KEY,version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 enabled boolean NOT NULL DEFAULT true,paused boolean NOT NULL DEFAULT false,timezone text NOT NULL,rules_json jsonb NOT NULL,
 source_due_date date NOT NULL,updated_at timestamptz NOT NULL,
 FOREIGN KEY(workspace_id,project_id) REFERENCES collector.projects(workspace_id,id)
);
CREATE TABLE collector.reminder_deliveries (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,project_id uuid NOT NULL,contact_id uuid NOT NULL,
 channel text NOT NULL CHECK(channel='EMAIL'),policy_version bigint NOT NULL,rule_id uuid NOT NULL,manual boolean NOT NULL,
 occurrence_date date NOT NULL,dispatch_date date NOT NULL,timezone text NOT NULL,recipient_key text NOT NULL,
 due_at timestamptz NOT NULL,available_at timestamptz NOT NULL,
 state text NOT NULL CHECK(state IN ('QUEUED','SENDING','ACCEPTED','DELIVERED','BOUNCED','SUPPRESSED','FAILED','UNKNOWN','CANCELLED')),
 failure_code text,attempt_count integer NOT NULL DEFAULT 0,lease_id uuid,lease_until timestamptz,
 token_id uuid REFERENCES collector.access_tokens(id),encrypted_payload bytea,encryption_key_id text,
 provider_id text UNIQUE,provider_event_at timestamptz,sent_at timestamptz,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,
 FOREIGN KEY(workspace_id,project_id,contact_id) REFERENCES collector.project_contacts(workspace_id,project_id,id)
);
CREATE UNIQUE INDEX reminder_business_occurrence ON collector.reminder_deliveries(workspace_id,project_id,contact_id,channel,policy_version,rule_id,occurrence_date) WHERE state<>'CANCELLED';
CREATE UNIQUE INDEX reminder_recipient_day ON collector.reminder_deliveries(workspace_id,recipient_key,channel,dispatch_date) WHERE state NOT IN ('CANCELLED','SUPPRESSED');
CREATE INDEX reminder_dispatch ON collector.reminder_deliveries(available_at,due_at) WHERE state='QUEUED';
CREATE INDEX reminder_project_history ON collector.reminder_deliveries(workspace_id,project_id,created_at DESC);
CREATE TABLE collector.email_webhook_events (
 event_id text PRIMARY KEY,body_hash text NOT NULL,provider_id text NOT NULL,event_type text NOT NULL,occurred_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL
);
CREATE INDEX email_receipt_events ON collector.email_webhook_events(provider_id,occurred_at DESC);

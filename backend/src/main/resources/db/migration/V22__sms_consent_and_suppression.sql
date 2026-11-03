-- T27: recipient consent and bounded SMS dispatch. Existing migrations stay immutable.
ALTER TABLE collector.reminder_deliveries DROP CONSTRAINT reminder_deliveries_channel_check;
ALTER TABLE collector.reminder_deliveries ADD CONSTRAINT reminder_deliveries_channel_check CHECK(channel IN ('EMAIL','SMS'));
ALTER TABLE collector.reminder_deliveries ADD COLUMN sms_period date;
ALTER TABLE collector.reminder_deliveries ADD COLUMN sms_settled boolean NOT NULL DEFAULT false;
ALTER TABLE collector.reminder_deliveries ADD COLUMN sms_segments integer;
ALTER TABLE collector.reminder_deliveries ADD COLUMN sms_reserved_cost bigint;
CREATE TABLE collector.sms_destinations (
 sender_scope text NOT NULL,phone_hash text NOT NULL,suppressed boolean NOT NULL DEFAULT false,last_stop_at timestamptz,start_seen_at timestamptz,updated_at timestamptz NOT NULL,
 PRIMARY KEY(sender_scope,phone_hash)
);
CREATE TABLE collector.sms_consents (
 workspace_id uuid NOT NULL,project_id uuid NOT NULL,contact_id uuid PRIMARY KEY,active_verification_id uuid NOT NULL,phone_e164 text NOT NULL,
 sender_scope text NOT NULL,phone_hash text NOT NULL,status text NOT NULL CHECK(status IN ('UNVERIFIED','VERIFIED_OPTED_IN','OPTED_OUT')),
 timezone text NOT NULL,consent_text_version text NOT NULL,purpose text NOT NULL,consented_at timestamptz NOT NULL,
 verified_at timestamptz,withdrawn_at timestamptz,updated_at timestamptz NOT NULL,
 FOREIGN KEY(workspace_id,project_id,contact_id) REFERENCES collector.project_contacts(workspace_id,project_id,id)
);
CREATE TABLE collector.sms_usage (
 workspace_id uuid NOT NULL REFERENCES collector.workspaces(id),period date NOT NULL,
 used_segments integer NOT NULL DEFAULT 0,reserved_segments integer NOT NULL DEFAULT 0,
 spent_microusd bigint NOT NULL DEFAULT 0,reserved_microusd bigint NOT NULL DEFAULT 0,
 CHECK(used_segments>=0 AND reserved_segments>=0 AND spent_microusd>=0 AND reserved_microusd>=0),PRIMARY KEY(workspace_id,period)
);
CREATE TABLE collector.sms_verifications (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,project_id uuid NOT NULL,contact_id uuid NOT NULL,
 phone_hash text NOT NULL,code_hash text NOT NULL,encrypted_payload bytea,encryption_key_id text NOT NULL,
 state text NOT NULL CHECK(state IN ('QUEUED','SENDING','SENT','UNKNOWN','VERIFIED','FAILED','EXPIRED','REVOKED')),
 attempts integer NOT NULL DEFAULT 0,expires_at timestamptz NOT NULL,lease_id uuid,lease_until timestamptz,
 usage_period date NOT NULL,segments integer NOT NULL,reserved_cost bigint NOT NULL,settled boolean NOT NULL DEFAULT false,
 provider_id text UNIQUE,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,
 FOREIGN KEY(workspace_id,project_id,contact_id) REFERENCES collector.project_contacts(workspace_id,project_id,id)
);
CREATE INDEX sms_verification_dispatch ON collector.sms_verifications(created_at) WHERE state='QUEUED';
CREATE TABLE collector.sms_events (
 event_key text PRIMARY KEY,workspace_id uuid,project_id uuid,contact_id uuid,sender_scope text NOT NULL,
 phone_hash text,event_type text NOT NULL,provider_id text,created_at timestamptz NOT NULL,
 consent_text_version text,purpose text
);

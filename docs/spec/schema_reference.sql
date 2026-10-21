-- Website Content Collector reference schema

-- PostgreSQL 18 target. Review and divide into ordered Flyway migrations.

-- Run real PostgreSQL migration and authorization tests before implementation release.

BEGIN;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized text NOT NULL UNIQUE,
  display_name varchar(150) NOT NULL,
  password_hash text NOT NULL,
  verified_at timestamptz,
  state text NOT NULL DEFAULT 'UNVERIFIED' CHECK (state IN ('UNVERIFIED','ACTIVE','DISABLED')),
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(150) NOT NULL,
  timezone varchar(80) NOT NULL DEFAULT 'America/Chicago',
  logo_asset_key text,
  state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','READ_ONLY','SUSPENDED','DELETION_PENDING')),
  storage_limit_bytes bigint NOT NULL DEFAULT 50000000000 CHECK (storage_limit_bytes >= 0),
  storage_used_bytes bigint NOT NULL DEFAULT 0 CHECK (storage_used_bytes >= 0),
  storage_reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (storage_reserved_bytes >= 0),
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('OWNER','MEMBER')),
  state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','DISABLED')),
  UNIQUE (workspace_id, user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id)
);

CREATE UNIQUE INDEX one_active_workspace_owner ON workspace_members(workspace_id) WHERE role='OWNER' AND state='ACTIVE';

CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  business_name varchar(200) NOT NULL,
  contact_name varchar(150),
  email_normalized text,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id)
);

CREATE TABLE templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id),
  template_key varchar(160) NOT NULL,
  project_type text NOT NULL CHECK (project_type IN ('WEBSITE','WEB_APP','MOBILE_APP')),
  industry varchar(80),
  title varchar(160) NOT NULL,
  is_builtin boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 0,
  draft_definition jsonb,
  CHECK ((is_builtin AND workspace_id IS NULL) OR (NOT is_builtin AND workspace_id IS NOT NULL)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX builtin_template_key ON templates(template_key) WHERE workspace_id IS NULL;

CREATE UNIQUE INDEX workspace_template_key ON templates(workspace_id,template_key) WHERE workspace_id IS NOT NULL;

CREATE TABLE template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES templates(id),
  version_no integer NOT NULL CHECK (version_no > 0),
  schema_version integer NOT NULL DEFAULT 1,
  definition jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id,version_no),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  client_id uuid NOT NULL,
  source_template_version_id uuid REFERENCES template_versions(id),
  title varchar(200) NOT NULL,
  project_type text NOT NULL CHECK (project_type IN ('WEBSITE','WEB_APP','MOBILE_APP')),
  state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','ACTIVE','PAUSED','COMPLETED','ARCHIVED','DELETION_PENDING')),
  due_date date NOT NULL,
  timezone varchar(80) NOT NULL DEFAULT 'America/Chicago',
  structure_version bigint NOT NULL DEFAULT 1,
  version bigint NOT NULL DEFAULT 0,
  ai_enabled boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  delete_after timestamptz,
  FOREIGN KEY (workspace_id,client_id) REFERENCES clients(workspace_id,id),
  UNIQUE (workspace_id,id,client_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id)
);

CREATE TABLE project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL,
  workspace_member_id uuid NOT NULL,
  can_review boolean NOT NULL DEFAULT false,
  can_export boolean NOT NULL DEFAULT false,
  FOREIGN KEY (workspace_id,workspace_member_id) REFERENCES workspace_members(workspace_id,id),
  UNIQUE (project_id,workspace_member_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE project_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL,
  client_id uuid NOT NULL,
  name varchar(150) NOT NULL,
  email_normalized text NOT NULL,
  state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','REVOKED')),
  email_reminders_enabled boolean NOT NULL DEFAULT true,
  timezone varchar(80),
  access_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  FOREIGN KEY (workspace_id,client_id) REFERENCES clients(workspace_id,id),
  FOREIGN KEY (workspace_id,project_id,client_id) REFERENCES projects(workspace_id,id,client_id),
  UNIQUE (project_id,email_normalized),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id),
  project_id uuid,
  project_contact_id uuid,
  user_id uuid REFERENCES users(id),
  email_normalized text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('VERIFY_EMAIL','RESET_PASSWORD','TEAM_INVITE','CLIENT_INVITE')),
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  FOREIGN KEY (workspace_id,project_id,project_contact_id) REFERENCES project_contacts(workspace_id,project_id,id),
  CHECK (purpose <> 'CLIENT_INVITE' OR (workspace_id IS NOT NULL AND project_id IS NOT NULL AND project_contact_id IS NOT NULL)),
  CHECK (purpose NOT IN ('VERIFY_EMAIL','RESET_PASSWORD') OR user_id IS NOT NULL),
  CHECK (purpose <> 'TEAM_INVITE' OR workspace_id IS NOT NULL),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_kind text NOT NULL CHECK (principal_kind IN ('USER','CLIENT')),
  user_id uuid REFERENCES users(id),
  workspace_id uuid REFERENCES workspaces(id),
  project_id uuid,
  project_contact_id uuid,
  client_token_hash char(64) UNIQUE,
  family_id uuid NOT NULL DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  user_agent_label varchar(160),
  FOREIGN KEY (workspace_id,project_id,project_contact_id) REFERENCES project_contacts(workspace_id,project_id,id),
  CHECK ((principal_kind='USER' AND user_id IS NOT NULL AND project_contact_id IS NULL AND client_token_hash IS NULL) OR (principal_kind='CLIENT' AND user_id IS NULL AND workspace_id IS NOT NULL AND project_id IS NOT NULL AND project_contact_id IS NOT NULL AND client_token_hash IS NOT NULL)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE session_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES auth_sessions(id),
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  rotated_at timestamptz,
  replacement_id uuid REFERENCES session_tokens(id) DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL,
  section_key varchar(160) NOT NULL,
  title varchar(200) NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  enabled boolean NOT NULL DEFAULT true,
  UNIQUE (project_id,section_key),
  UNIQUE (project_id,sort_order) DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL,
  section_id uuid NOT NULL,
  item_key varchar(200) NOT NULL,
  label varchar(250) NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('SHORT_TEXT','LONG_TEXT','URL','SINGLE_SELECT','MULTI_SELECT','IMAGE','FILE','REPEATER')),
  instructions text NOT NULL DEFAULT '',
  example_answer text,
  required boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  schema_json jsonb NOT NULL,
  state text NOT NULL DEFAULT 'NOT_STARTED' CHECK (state IN ('NOT_STARTED','DRAFT','SUBMITTED','CHANGES_REQUESTED','APPROVED')),
  version bigint NOT NULL DEFAULT 0,
  current_revision_id uuid,
  FOREIGN KEY (workspace_id,project_id,section_id) REFERENCES sections(workspace_id,project_id,id),
  UNIQUE (project_id,item_key),
  UNIQUE (section_id,sort_order) DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL,
  item_id uuid NOT NULL UNIQUE,
  value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 0,
  updated_by_contact_id uuid,
  FOREIGN KEY (workspace_id,project_id,item_id) REFERENCES items(workspace_id,project_id,id),
  FOREIGN KEY (workspace_id,project_id,updated_by_contact_id) REFERENCES project_contacts(workspace_id,project_id,id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE submission_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL,
  item_id uuid NOT NULL,
  revision_no integer NOT NULL CHECK (revision_no > 0),
  submitted_by_contact_id uuid NOT NULL,
  structure_version bigint NOT NULL,
  schema_snapshot jsonb NOT NULL,
  value_snapshot jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id,project_id,item_id) REFERENCES items(workspace_id,project_id,id),
  FOREIGN KEY (workspace_id,project_id,submitted_by_contact_id) REFERENCES project_contacts(workspace_id,project_id,id),
  UNIQUE (item_id,revision_no),
  UNIQUE (workspace_id,project_id,item_id,id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

ALTER TABLE items ADD CONSTRAINT item_current_revision_fk FOREIGN KEY (workspace_id,project_id,id,current_revision_id) REFERENCES submission_revisions(workspace_id,project_id,item_id,id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL,
  item_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  reviewed_by_member_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('APPROVE','REQUEST_CHANGES')),
  reason text,
  expected_item_version bigint NOT NULL,
  FOREIGN KEY (workspace_id,project_id,item_id,revision_id) REFERENCES submission_revisions(workspace_id,project_id,item_id,id),
  FOREIGN KEY (workspace_id,reviewed_by_member_id) REFERENCES workspace_members(workspace_id,id),
  UNIQUE (revision_id),
  CHECK (decision <> 'REQUEST_CHANGES' OR (reason IS NOT NULL AND length(trim(reason)) > 0)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL,
  item_id uuid NOT NULL,
  revision_id uuid,
  author_member_id uuid,
  author_contact_id uuid,
  visibility text NOT NULL CHECK (visibility IN ('CLIENT','INTERNAL')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  FOREIGN KEY (workspace_id,project_id,item_id) REFERENCES items(workspace_id,project_id,id),
  FOREIGN KEY (workspace_id,project_id,item_id,revision_id) REFERENCES submission_revisions(workspace_id,project_id,item_id,id),
  FOREIGN KEY (workspace_id,author_member_id) REFERENCES workspace_members(workspace_id,id),
  FOREIGN KEY (workspace_id,project_id,author_contact_id) REFERENCES project_contacts(workspace_id,project_id,id),
  CHECK ((author_member_id IS NOT NULL) <> (author_contact_id IS NOT NULL)),
  CHECK (author_contact_id IS NULL OR visibility='CLIENT'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE file_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL,
  item_id uuid NOT NULL,
  uploaded_by_contact_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('RESERVED','UPLOADED','PROCESSING','READY','REJECTED','FAILED','DELETED')),
  original_name varchar(250) NOT NULL,
  declared_type varchar(150) NOT NULL,
  detected_type varchar(150),
  source_bytes bigint NOT NULL CHECK (source_bytes > 0),
  retained_bytes bigint NOT NULL DEFAULT 0 CHECK (retained_bytes >= 0),
  keep_original boolean NOT NULL DEFAULT true,
  staging_key text NOT NULL UNIQUE,
  canonical_key text UNIQUE,
  variants_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  sha256 char(64),
  rejection_code varchar(80),
  FOREIGN KEY (workspace_id,project_id,item_id) REFERENCES items(workspace_id,project_id,id),
  FOREIGN KEY (workspace_id,project_id,uploaded_by_contact_id) REFERENCES project_contacts(workspace_id,project_id,id),
  UNIQUE (workspace_id,project_id,item_id,id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE revision_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL,
  item_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  FOREIGN KEY (workspace_id,project_id,item_id,revision_id) REFERENCES submission_revisions(workspace_id,project_id,item_id,id),
  FOREIGN KEY (workspace_id,project_id,item_id,asset_id) REFERENCES file_assets(workspace_id,project_id,item_id,id),
  UNIQUE (revision_id,asset_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE upload_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL,
  asset_id uuid NOT NULL UNIQUE,
  reserved_bytes bigint NOT NULL CHECK (reserved_bytes > 0),
  state text NOT NULL CHECK (state IN ('RESERVED','FINALIZED','RELEASED','EXPIRED')),
  expires_at timestamptz NOT NULL,
  released_at timestamptz,
  FOREIGN KEY (workspace_id,project_id,asset_id) REFERENCES file_assets(workspace_id,project_id,id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL,
  item_id uuid NOT NULL,
  project_contact_id uuid NOT NULL,
  base_answer_version bigint NOT NULL,
  state text NOT NULL CHECK (state IN ('QUEUED','RUNNING','SUCCEEDED','REFUSED','FAILED','ACCEPTED','EXPIRED')),
  input_hash char(64) NOT NULL,
  input_json jsonb NOT NULL,
  output_json jsonb,
  model varchar(160),
  prompt_version varchar(50) NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  reserved_cost_microusd bigint NOT NULL DEFAULT 0,
  actual_cost_microusd bigint NOT NULL DEFAULT 0,
  consented_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  FOREIGN KEY (workspace_id,project_id,item_id) REFERENCES items(workspace_id,project_id,id),
  FOREIGN KEY (workspace_id,project_id,project_contact_id) REFERENCES project_contacts(workspace_id,project_id,id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE reminder_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL,
  timezone varchar(80) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  paused boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1,
  rules_json jsonb NOT NULL,
  UNIQUE (project_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL,
  project_contact_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('EMAIL','SMS')),
  occurrence_key varchar(250) NOT NULL UNIQUE,
  state text NOT NULL CHECK (state IN ('QUEUED','SENDING','ACCEPTED','DELIVERED','BOUNCED','SUPPRESSED','FAILED','UNKNOWN','CANCELLED')),
  due_at timestamptz NOT NULL,
  provider varchar(50),
  provider_message_id text,
  attempt_count integer NOT NULL DEFAULT 0,
  encrypted_delivery_payload bytea,
  encryption_key_id varchar(80),
  last_error_code varchar(80),
  FOREIGN KEY (workspace_id,project_id,project_contact_id) REFERENCES project_contacts(workspace_id,project_id,id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE sms_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL,
  project_contact_id uuid NOT NULL,
  phone_e164 varchar(20) NOT NULL,
  destination_hash char(64) NOT NULL,
  consent_text_version varchar(80) NOT NULL,
  consented_at timestamptz NOT NULL,
  verified_at timestamptz,
  withdrawn_at timestamptz,
  sender_scope varchar(150) NOT NULL,
  verification_provider_id text UNIQUE,
  verification_expires_at timestamptz,
  UNIQUE (project_contact_id,phone_e164,sender_scope),
  FOREIGN KEY (workspace_id,project_id,project_contact_id) REFERENCES project_contacts(workspace_id,project_id,id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE notification_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(50) NOT NULL,
  sender_scope varchar(150) NOT NULL,
  channel text NOT NULL CHECK (channel IN ('EMAIL','SMS')),
  destination_hash char(64) NOT NULL,
  reason varchar(80) NOT NULL,
  suppressed_at timestamptz NOT NULL DEFAULT now(),
  cleared_at timestamptz,
  UNIQUE (provider,sender_scope,channel,destination_hash),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL,
  item_id uuid,
  template_version_id uuid REFERENCES template_versions(id),
  item_key varchar(200),
  session_pseudonym varchar(100),
  client_event_id uuid,
  event_type varchar(80) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY (workspace_id,project_id,item_id) REFERENCES items(workspace_id,project_id,id),
  UNIQUE (project_id,client_event_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE monthly_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  ai_drafts_used integer NOT NULL DEFAULT 0 CHECK (ai_drafts_used >= 0),
  ai_drafts_reserved integer NOT NULL DEFAULT 0 CHECK (ai_drafts_reserved >= 0),
  ai_cost_microusd bigint NOT NULL DEFAULT 0 CHECK (ai_cost_microusd >= 0),
  ai_reserved_microusd bigint NOT NULL DEFAULT 0 CHECK (ai_reserved_microusd >= 0),
  sms_segments_used integer NOT NULL DEFAULT 0 CHECK (sms_segments_used >= 0),
  sms_segments_reserved integer NOT NULL DEFAULT 0 CHECK (sms_segments_reserved >= 0),
  sms_cost_microusd bigint NOT NULL DEFAULT 0 CHECK (sms_cost_microusd >= 0),
  sms_reserved_microusd bigint NOT NULL DEFAULT 0 CHECK (sms_reserved_microusd >= 0),
  UNIQUE (workspace_id,period_start),
  CHECK (period_end > period_start),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id)
);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  plan_key text NOT NULL CHECK (plan_key IN ('SOLO','AGENCY')),
  state text NOT NULL CHECK (state IN ('TRIALING','ACTIVE','PAST_DUE','READ_ONLY','SUSPENDED')),
  provider varchar(50),
  provider_customer_id text UNIQUE,
  provider_subscription_id text UNIQUE,
  provider_state varchar(80),
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  grace_ends_at timestamptz,
  read_only_ends_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  last_reconciled_at timestamptz,
  UNIQUE (workspace_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id)
);

CREATE TABLE provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(50) NOT NULL,
  provider_event_key text NOT NULL,
  verified_at timestamptz NOT NULL,
  payload_json jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('RECEIVED','PROCESSING','PROCESSED','FAILED')),
  processed_at timestamptz,
  UNIQUE (provider,provider_event_key),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL,
  requested_by_member_id uuid NOT NULL,
  format text NOT NULL CHECK (format IN ('APPROVED_ZIP','APPROVED_JSON','APPROVED_MARKDOWN')),
  state text NOT NULL CHECK (state IN ('QUEUED','RUNNING','READY','FAILED','EXPIRED','CANCELLED')),
  project_version bigint NOT NULL,
  manifest_json jsonb NOT NULL,
  partial_acknowledged boolean NOT NULL DEFAULT false,
  object_key text UNIQUE,
  bytes bigint,
  expires_at timestamptz NOT NULL,
  FOREIGN KEY (workspace_id,requested_by_member_id) REFERENCES workspace_members(workspace_id,id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE status_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL,
  alias varchar(120) NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,
  allowed_origins_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id),
  project_id uuid,
  actor_kind text NOT NULL CHECK (actor_kind IN ('USER','CLIENT','SYSTEM')),
  actor_id uuid,
  action varchar(100) NOT NULL,
  resource_kind varchar(80) NOT NULL,
  resource_id uuid,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id),
  project_id uuid,
  job_type varchar(100) NOT NULL,
  payload_json jsonb NOT NULL,
  encrypted_payload bytea,
  dedupe_key text NOT NULL UNIQUE,
  state text NOT NULL CHECK (state IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','DEAD')),
  available_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0,
  lease_owner varchar(120),
  lease_expires_at timestamptz,
  last_error_code varchar(100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_key varchar(180) NOT NULL,
  workspace_id uuid REFERENCES workspaces(id),
  route_key varchar(250) NOT NULL,
  idempotency_key varchar(180) NOT NULL,
  request_hash char(64) NOT NULL,
  response_status integer,
  response_json jsonb,
  expires_at timestamptz NOT NULL,
  UNIQUE (principal_key,route_key,idempotency_key),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_list_idx ON projects(workspace_id,state,updated_at DESC,id);

CREATE INDEX member_project_idx ON project_members(workspace_id,workspace_member_id,project_id);

CREATE INDEX project_item_state_idx ON items(workspace_id,project_id,state);

CREATE INDEX revision_list_idx ON submission_revisions(item_id,revision_no DESC);

CREATE INDEX notification_due_idx ON notification_jobs(state,due_at);

CREATE INDEX outbox_due_idx ON outbox_jobs(state,available_at);

CREATE INDEX outbox_lease_idx ON outbox_jobs(state,lease_expires_at);

CREATE INDEX analytics_project_idx ON analytics_events(workspace_id,project_id,occurred_at);

CREATE INDEX file_project_state_idx ON file_assets(workspace_id,project_id,state);

CREATE INDEX session_user_idx ON auth_sessions(user_id,revoked_at);

CREATE INDEX token_session_idx ON session_tokens(session_id,rotated_at);

CREATE INDEX upload_expiry_idx ON upload_reservations(state,expires_at);

-- Application runtime must not mutate published versions or submitted snapshots.

CREATE FUNCTION reject_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'This record is immutable; create a new version';
END;
$$;

CREATE TRIGGER template_versions_immutable BEFORE UPDATE ON template_versions FOR EACH ROW EXECUTE FUNCTION reject_immutable_update();

CREATE TRIGGER submission_revisions_immutable BEFORE UPDATE ON submission_revisions FOR EACH ROW EXECUTE FUNCTION reject_immutable_update();

CREATE TRIGGER review_decisions_immutable BEFORE UPDATE ON review_decisions FOR EACH ROW EXECUTE FUNCTION reject_immutable_update();

CREATE TRIGGER revision_assets_immutable BEFORE UPDATE ON revision_assets FOR EACH ROW EXECUTE FUNCTION reject_immutable_update();

-- Runtime DB role must not have unrestricted DELETE on immutable records.

-- A separate controlled purge role/job deletes project children in FK order.

-- Append-only audit records require production role grants; protect them from user-facing writes.

COMMIT;

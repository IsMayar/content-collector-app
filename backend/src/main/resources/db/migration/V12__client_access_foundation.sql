-- T14: a contact becomes an explicit project grant only on authorized issuance.
ALTER TABLE collector.project_contacts ADD COLUMN access_initialized_at timestamptz;
ALTER TABLE collector.access_tokens ADD COLUMN project_id uuid;
ALTER TABLE collector.access_tokens ADD COLUMN contact_id uuid;
ALTER TABLE collector.access_tokens DROP CONSTRAINT access_tokens_purpose;
ALTER TABLE collector.access_tokens DROP CONSTRAINT token_principal_scope;
ALTER TABLE collector.access_tokens ADD CONSTRAINT access_tokens_purpose CHECK(purpose IN ('VERIFY_EMAIL','RESET_PASSWORD','TEAM_INVITE','CLIENT_INVITE'));
ALTER TABLE collector.access_tokens ADD CONSTRAINT token_principal_scope CHECK(
 (purpose IN ('VERIFY_EMAIL','RESET_PASSWORD') AND user_id IS NOT NULL AND workspace_id IS NULL AND project_id IS NULL AND contact_id IS NULL)
 OR (purpose='TEAM_INVITE' AND user_id IS NULL AND workspace_id IS NOT NULL AND project_id IS NULL AND contact_id IS NULL)
 OR (purpose='CLIENT_INVITE' AND user_id IS NULL AND workspace_id IS NOT NULL AND project_id IS NOT NULL AND contact_id IS NOT NULL));
ALTER TABLE collector.access_tokens ADD CONSTRAINT token_client_scope FOREIGN KEY(workspace_id,project_id,contact_id) REFERENCES collector.project_contacts(workspace_id,project_id,id);
CREATE INDEX client_invitation_grant ON collector.access_tokens(workspace_id,project_id,contact_id,purpose);
ALTER TABLE collector.outbox_jobs DROP CONSTRAINT outbox_jobs_job_type_check;
ALTER TABLE collector.outbox_jobs ADD CONSTRAINT outbox_jobs_job_type_check CHECK(job_type IN ('VERIFY_EMAIL','RESET_PASSWORD','TEAM_INVITE','CLIENT_INVITE'));
CREATE TABLE collector.client_sessions (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,project_id uuid NOT NULL,contact_id uuid NOT NULL,
 token_hash char(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL,last_seen_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz,
 CHECK(last_seen_at>=created_at),CHECK(expires_at>created_at AND expires_at<=created_at+interval '7 days'),
 FOREIGN KEY(workspace_id,project_id,contact_id) REFERENCES collector.project_contacts(workspace_id,project_id,id)
);
CREATE INDEX client_session_grant ON collector.client_sessions(workspace_id,project_id,contact_id);
ALTER TABLE collector.audit_logs DROP CONSTRAINT audit_logs_actor_kind_check;
ALTER TABLE collector.audit_logs ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE collector.audit_logs ADD COLUMN client_contact_id uuid;
ALTER TABLE collector.audit_logs ADD CONSTRAINT audit_actor_scope CHECK(
 (actor_kind='USER' AND actor_id IS NOT NULL AND client_contact_id IS NULL)
 OR (actor_kind IN ('CLIENT','ANONYMOUS') AND actor_id IS NULL AND client_contact_id IS NOT NULL AND project_id IS NOT NULL));
ALTER TABLE collector.audit_logs ADD CONSTRAINT audit_client_scope FOREIGN KEY(workspace_id,project_id,client_contact_id) REFERENCES collector.project_contacts(workspace_id,project_id,id);

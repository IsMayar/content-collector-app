-- T13: extend purpose-bound credentials/outbox; preserve VERIFY_EMAIL/RESET_PASSWORD invariants.
ALTER TABLE collector.access_tokens ADD COLUMN workspace_id uuid REFERENCES collector.workspaces(id);
ALTER TABLE collector.access_tokens ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE collector.access_tokens DROP CONSTRAINT access_tokens_purpose;
ALTER TABLE collector.access_tokens ADD CONSTRAINT access_tokens_purpose CHECK(purpose IN ('VERIFY_EMAIL','RESET_PASSWORD','TEAM_INVITE'));
ALTER TABLE collector.access_tokens ADD CONSTRAINT token_principal_scope CHECK(
 (purpose IN ('VERIFY_EMAIL','RESET_PASSWORD') AND user_id IS NOT NULL AND workspace_id IS NULL)
 OR (purpose='TEAM_INVITE' AND workspace_id IS NOT NULL AND user_id IS NULL));
ALTER TABLE collector.access_tokens ADD CONSTRAINT token_workspace_identity UNIQUE(workspace_id,id,email_normalized);
ALTER TABLE collector.outbox_jobs DROP CONSTRAINT outbox_jobs_job_type_check;
ALTER TABLE collector.outbox_jobs ADD CONSTRAINT outbox_jobs_job_type_check CHECK(job_type IN ('VERIFY_EMAIL','RESET_PASSWORD','TEAM_INVITE'));
CREATE TABLE collector.workspace_invitations (
 id uuid PRIMARY KEY REFERENCES collector.access_tokens(id),workspace_id uuid NOT NULL REFERENCES collector.workspaces(id),
 email_normalized text NOT NULL,invited_by_user_id uuid NOT NULL REFERENCES collector.users(id),
 role text NOT NULL DEFAULT 'MEMBER' CHECK(role='MEMBER'),
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','CONSUMED','REVOKED','EXPIRED')),
 accepted_by_user_id uuid REFERENCES collector.users(id),
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL CHECK(updated_at>=created_at),
 CHECK((state='CONSUMED')=(accepted_by_user_id IS NOT NULL)),
 FOREIGN KEY(workspace_id,id,email_normalized) REFERENCES collector.access_tokens(workspace_id,id,email_normalized),
 FOREIGN KEY(workspace_id,invited_by_user_id) REFERENCES collector.workspace_members(workspace_id,user_id),
 FOREIGN KEY(workspace_id,accepted_by_user_id) REFERENCES collector.workspace_members(workspace_id,user_id),
 UNIQUE(workspace_id,id)
);
CREATE UNIQUE INDEX pending_workspace_invitation ON collector.workspace_invitations(workspace_id,email_normalized) WHERE state='PENDING';
CREATE INDEX workspace_invitation_lookup ON collector.workspace_invitations(workspace_id,created_at,id);
CREATE TABLE collector.project_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES collector.workspaces(id),project_id uuid NOT NULL,
 workspace_member_id uuid NOT NULL,can_review boolean NOT NULL DEFAULT false,can_export boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL CHECK(updated_at>=created_at),
 FOREIGN KEY(workspace_id,project_id) REFERENCES collector.projects(workspace_id,id),
 FOREIGN KEY(workspace_id,workspace_member_id) REFERENCES collector.workspace_members(workspace_id,id),
 UNIQUE(project_id,workspace_member_id),UNIQUE(workspace_id,project_id,id)
);
CREATE INDEX project_assignment_member ON collector.project_members(workspace_id,workspace_member_id,project_id);
-- Workspace audit events have no project; existing project events retain their composite FK.
ALTER TABLE collector.audit_logs ALTER COLUMN project_id DROP NOT NULL;

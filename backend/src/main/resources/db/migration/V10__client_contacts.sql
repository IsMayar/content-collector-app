-- T12: explicit project contacts only; no invitation, session, answer or review persistence.
ALTER TABLE collector.projects ADD CONSTRAINT project_client_scope UNIQUE(workspace_id,id,client_id);
CREATE TABLE collector.project_contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES collector.workspaces(id),project_id uuid NOT NULL,client_id uuid NOT NULL,
    name varchar(150) NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 150),
    email_normalized text NOT NULL CHECK(email_normalized=lower(btrim(email_normalized)) AND length(email_normalized) BETWEEN 3 AND 254),
    state text NOT NULL DEFAULT 'ACTIVE' CHECK(state IN ('ACTIVE','REVOKED')),
    email_reminders_enabled boolean NOT NULL DEFAULT true,timezone varchar(80),
    access_expires_at timestamptz NOT NULL,revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK(access_expires_at>created_at),CHECK(updated_at>=created_at),
    CHECK((state='ACTIVE' AND revoked_at IS NULL) OR (state='REVOKED' AND revoked_at IS NOT NULL)),
    FOREIGN KEY(workspace_id,client_id) REFERENCES collector.clients(workspace_id,id),
    FOREIGN KEY(workspace_id,project_id,client_id) REFERENCES collector.projects(workspace_id,id,client_id),
    UNIQUE(project_id,email_normalized),UNIQUE(workspace_id,id),UNIQUE(workspace_id,project_id,id)
);
CREATE INDEX project_contact_scope_idx ON collector.project_contacts(workspace_id,project_id,name,id);

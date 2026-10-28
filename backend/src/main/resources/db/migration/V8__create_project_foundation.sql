-- T10: customer prerequisite, independent initial snapshot and relational structure; no answers/submissions/grants.
CREATE TABLE collector.clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES collector.workspaces(id),
    business_name varchar(200) NOT NULL CHECK (length(btrim(business_name)) BETWEEN 1 AND 200),
    contact_name varchar(150),
    email_normalized text CHECK (email_normalized IS NULL OR (email_normalized=lower(btrim(email_normalized)) AND length(email_normalized)<=254)),
    version bigint NOT NULL DEFAULT 0 CHECK (version>=0),
    created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now() CHECK (updated_at>=created_at),
    UNIQUE(workspace_id,id)
);
CREATE INDEX client_workspace_name_idx ON collector.clients(workspace_id,business_name,id);
CREATE TABLE collector.projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES collector.workspaces(id),
    client_id uuid NOT NULL,source_template_version_id uuid NOT NULL REFERENCES collector.template_versions(id),
    created_by_user_id uuid NOT NULL REFERENCES collector.users(id),
    title varchar(200) NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
    project_type text NOT NULL CHECK (project_type IN ('WEBSITE','WEB_APP','MOBILE_APP')),
    state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','ACTIVE','PAUSED','COMPLETED','ARCHIVED','DELETION_PENDING')),
    due_date date NOT NULL,timezone varchar(80) NOT NULL CHECK (length(btrim(timezone))>0),
    structure_version bigint NOT NULL DEFAULT 1 CHECK (structure_version>0),version bigint NOT NULL DEFAULT 1 CHECK (version>0),
    ai_enabled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now() CHECK (updated_at>=created_at),
    FOREIGN KEY(workspace_id,client_id) REFERENCES collector.clients(workspace_id,id),
    UNIQUE(workspace_id,id),UNIQUE(workspace_id,id,source_template_version_id)
);
CREATE INDEX project_list_idx ON collector.projects(workspace_id,state,updated_at DESC,id);
CREATE INDEX project_customer_idx ON collector.projects(workspace_id,client_id);
-- A global built-in version or a same-workspace version of the correct type is the only valid source.
CREATE FUNCTION collector.check_project_template_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM collector.template_versions v JOIN collector.templates t ON t.id=v.template_id
        WHERE v.id=NEW.source_template_version_id AND t.project_type=NEW.project_type
        AND (t.is_builtin OR t.workspace_id=NEW.workspace_id)) THEN
        RAISE EXCEPTION 'Invalid project template relationship' USING ERRCODE='23503';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER project_template_scope BEFORE INSERT OR UPDATE OF workspace_id,source_template_version_id,project_type
    ON collector.projects FOR EACH ROW EXECUTE FUNCTION collector.check_project_template_scope();
CREATE TABLE collector.project_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES collector.workspaces(id),
    project_id uuid NOT NULL,source_template_version_id uuid NOT NULL,
    structure_version bigint NOT NULL DEFAULT 1 CHECK (structure_version=1),
    definition jsonb NOT NULL CHECK (jsonb_typeof(definition)='object' AND octet_length(definition::text)<=1048576 AND definition->>'schemaVersion'='1'),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(workspace_id,project_id),
    FOREIGN KEY(workspace_id,project_id,source_template_version_id) REFERENCES collector.projects(workspace_id,id,source_template_version_id)
);
CREATE FUNCTION collector.reject_initial_snapshot_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Initial project snapshots are immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER project_snapshot_immutable BEFORE UPDATE OR DELETE ON collector.project_snapshots
    FOR EACH ROW EXECUTE FUNCTION collector.reject_initial_snapshot_change();
CREATE TABLE collector.sections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES collector.workspaces(id),project_id uuid NOT NULL,
    section_key varchar(160) NOT NULL,title varchar(200) NOT NULL,sort_order integer NOT NULL CHECK (sort_order>=0),enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(project_id,section_key),UNIQUE(project_id,sort_order) DEFERRABLE INITIALLY DEFERRED,
    UNIQUE(workspace_id,id),UNIQUE(workspace_id,project_id,id),
    FOREIGN KEY(workspace_id,project_id) REFERENCES collector.projects(workspace_id,id)
);
CREATE TABLE collector.items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES collector.workspaces(id),project_id uuid NOT NULL,section_id uuid NOT NULL,
    item_key varchar(200) NOT NULL,label varchar(250) NOT NULL,
    field_type text NOT NULL CHECK (field_type IN ('SHORT_TEXT','LONG_TEXT','URL','SINGLE_SELECT','MULTI_SELECT','IMAGE','FILE','REPEATER')),
    instructions text NOT NULL DEFAULT '',example_answer text,required boolean NOT NULL DEFAULT true,enabled boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL CHECK (sort_order>=0),schema_json jsonb NOT NULL CHECK (jsonb_typeof(schema_json)='object'),
    state text NOT NULL DEFAULT 'NOT_STARTED' CHECK (state IN ('NOT_STARTED','DRAFT','SUBMITTED','CHANGES_REQUESTED','APPROVED')),
    version bigint NOT NULL DEFAULT 1 CHECK (version>0),current_revision_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY(workspace_id,project_id,section_id) REFERENCES collector.sections(workspace_id,project_id,id),
    FOREIGN KEY(workspace_id,project_id) REFERENCES collector.projects(workspace_id,id),
    UNIQUE(project_id,item_key),UNIQUE(section_id,sort_order) DEFERRABLE INITIALLY DEFERRED,
    UNIQUE(workspace_id,id),UNIQUE(workspace_id,project_id,id)
);
CREATE INDEX project_item_state_idx ON collector.items(workspace_id,project_id,state);
-- Reference idempotency contract, used only for project creation in T10.
CREATE TABLE collector.idempotency_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),principal_key varchar(180) NOT NULL,
    workspace_id uuid NOT NULL REFERENCES collector.workspaces(id),route_key varchar(250) NOT NULL,idempotency_key varchar(180) NOT NULL,
    request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),response_status integer NOT NULL,response_json jsonb NOT NULL,
    expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(principal_key,route_key,idempotency_key),CHECK(expires_at>created_at)
);
CREATE INDEX project_creation_request_expiry_idx ON collector.idempotency_records(expires_at);

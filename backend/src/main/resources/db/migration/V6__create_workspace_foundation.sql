-- T07: reference workspace/member tables and local-only trial subset of subscriptions.
CREATE TABLE collector.workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(150) NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 150),
    timezone varchar(80) NOT NULL DEFAULT 'America/Chicago' CHECK (length(btrim(timezone)) > 0),
    logo_asset_key text,
    state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','READ_ONLY','SUSPENDED','DELETION_PENDING')),
    storage_limit_bytes bigint NOT NULL DEFAULT 50000000000 CHECK (storage_limit_bytes >= 0),
    storage_used_bytes bigint NOT NULL DEFAULT 0 CHECK (storage_used_bytes >= 0),
    storage_reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (storage_reserved_bytes >= 0),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now() CHECK (updated_at >= created_at)
);
CREATE TABLE collector.workspace_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES collector.workspaces(id),
    user_id uuid NOT NULL REFERENCES collector.users(id),
    role text NOT NULL CHECK (role IN ('OWNER','MEMBER')),
    state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','DISABLED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now() CHECK (updated_at >= created_at),
    UNIQUE (workspace_id,user_id),
    UNIQUE (workspace_id,id)
);
CREATE UNIQUE INDEX one_active_workspace_owner ON collector.workspace_members(workspace_id) WHERE role='OWNER' AND state='ACTIVE';
CREATE UNIQUE INDEX one_owned_workspace_per_user ON collector.workspace_members(user_id) WHERE role='OWNER' AND state='ACTIVE';
CREATE INDEX workspace_member_user_lookup ON collector.workspace_members(user_id,state,workspace_id);
-- No provider IDs, payment records or paid activation. These are added by T32.
-- Plan definitions are the closed SOLO/AGENCY enum, not mutable pricing seed rows.
CREATE TABLE collector.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL UNIQUE REFERENCES collector.workspaces(id),
    plan_key text NOT NULL CHECK (plan_key IN ('SOLO','AGENCY')),
    state text NOT NULL CHECK (state IN ('TRIALING','ACTIVE','PAST_DUE','READ_ONLY','SUSPENDED')),
    current_period_start timestamptz NOT NULL,
    current_period_end timestamptz NOT NULL,
    grace_ends_at timestamptz,
    read_only_ends_at timestamptz,
    cancel_at_period_end boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id,id),
    CHECK (current_period_end > current_period_start AND updated_at >= created_at),
    CHECK (grace_ends_at IS NULL OR grace_ends_at >= current_period_end),
    CHECK (read_only_ends_at IS NULL OR read_only_ends_at >= current_period_end)
);

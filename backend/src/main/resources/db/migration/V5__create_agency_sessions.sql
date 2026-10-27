-- USER-only subset of the reference session model; client grants/workspaces belong to later tasks.
CREATE TABLE collector.auth_sessions (
 id uuid PRIMARY KEY,
 principal_kind text NOT NULL DEFAULT 'USER' CHECK (principal_kind='USER'),
 user_id uuid NOT NULL REFERENCES collector.users(id),
 family_id uuid NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 idle_expires_at timestamptz NOT NULL,
 last_seen_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 CHECK (expires_at>created_at AND idle_expires_at<=expires_at AND idle_expires_at>created_at),
 CHECK (last_seen_at>=created_at AND updated_at>=created_at AND (revoked_at IS NULL OR revoked_at>=created_at))
);
CREATE INDEX session_user_idx ON collector.auth_sessions(user_id,revoked_at);
CREATE TABLE collector.session_tokens (
 id uuid PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES collector.auth_sessions(id),
 token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz NOT NULL,
 rotated_at timestamptz,
 replacement_id uuid REFERENCES collector.session_tokens(id) DEFERRABLE INITIALLY DEFERRED,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 CHECK (expires_at>created_at AND updated_at>=created_at),
 CHECK ((rotated_at IS NULL)=(replacement_id IS NULL)),
 CHECK (rotated_at IS NULL OR rotated_at>=created_at),
 CHECK (replacement_id IS NULL OR replacement_id<>id)
);
CREATE INDEX token_session_idx ON collector.session_tokens(session_id,rotated_at);

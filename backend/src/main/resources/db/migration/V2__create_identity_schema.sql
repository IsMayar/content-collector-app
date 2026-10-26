-- Account-only subset of the reference users/access_tokens model.
-- Workspace/team/client invitations and sessions belong to later migrations.
CREATE TABLE collector.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email_normalized text NOT NULL CONSTRAINT users_email_normalized_key UNIQUE,
    display_name varchar(150) NOT NULL,
    password_hash text NOT NULL,
    verified_at timestamptz,
    state text NOT NULL DEFAULT 'UNVERIFIED',
    version bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_email_canonical CHECK (
        email_normalized = lower(btrim(email_normalized))
        AND length(email_normalized) BETWEEN 3 AND 254
        AND email_normalized !~ '[[:space:]]'),
    CONSTRAINT users_display_name CHECK (length(btrim(display_name)) > 0),
    CONSTRAINT users_password_encoded CHECK (password_hash LIKE '{argon2}$argon2id$%'),
    CONSTRAINT users_state CHECK (state IN ('UNVERIFIED', 'ACTIVE', 'DISABLED')),
    CONSTRAINT users_version CHECK (version >= 0),
    CONSTRAINT users_timestamps CHECK (updated_at >= created_at AND (verified_at IS NULL OR verified_at >= created_at))
);

CREATE TABLE collector.access_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES collector.users(id),
    email_normalized text NOT NULL,
    purpose text NOT NULL,
    token_hash char(64) NOT NULL CONSTRAINT access_tokens_hash_key UNIQUE,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT access_tokens_purpose CHECK (purpose IN ('VERIFY_EMAIL', 'RESET_PASSWORD')),
    CONSTRAINT access_tokens_digest CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT access_tokens_email_canonical CHECK (
        email_normalized = lower(btrim(email_normalized))
        AND length(email_normalized) BETWEEN 3 AND 254
        AND email_normalized !~ '[[:space:]]'),
    CONSTRAINT access_tokens_timestamps CHECK (
        expires_at > created_at AND updated_at >= created_at
        AND (consumed_at IS NULL OR consumed_at >= created_at)
        AND (revoked_at IS NULL OR revoked_at >= created_at))
);
CREATE INDEX access_tokens_user_purpose_idx ON collector.access_tokens(user_id, purpose);
CREATE INDEX access_tokens_pending_expiry_idx ON collector.access_tokens(expires_at)
    WHERE consumed_at IS NULL AND revoked_at IS NULL;

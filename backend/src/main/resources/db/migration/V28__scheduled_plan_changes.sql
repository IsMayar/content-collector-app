-- Durable subscription-change intent. Unknown provider outcomes retain their reservation.
CREATE TABLE collector.billing_plan_changes (
 id uuid PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES collector.billing_accounts(workspace_id),
 actor_id uuid NOT NULL REFERENCES collector.users(id),
 idempotency_key text NOT NULL,
 target_plan text NOT NULL CHECK(target_plan IN ('SOLO','AGENCY')),
 subscription_id text NOT NULL,
 source_checkout uuid NOT NULL,
 effective_at timestamptz NOT NULL,
 state text NOT NULL CHECK(state IN ('REQUESTED','SCHEDULED','APPLIED')),
 provider_schedule_id text,
 lease_until timestamptz NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 UNIQUE(workspace_id,actor_id,idempotency_key)
);
CREATE UNIQUE INDEX billing_one_pending_plan_change ON collector.billing_plan_changes(workspace_id)
 WHERE state IN ('REQUESTED','SCHEDULED');

-- Preserve existing subscriptions and historical period dates. Expired legacy trials
-- resolve to Free in the authoritative policy without rewriting their history.
ALTER TABLE collector.subscriptions DROP CONSTRAINT subscriptions_plan_key_check;
ALTER TABLE collector.subscriptions ADD CONSTRAINT subscriptions_plan_key_check
    CHECK (plan_key IN ('FREE','SOLO','AGENCY'));
ALTER TABLE collector.subscriptions DROP CONSTRAINT subscriptions_state_check;
ALTER TABLE collector.subscriptions ADD CONSTRAINT subscriptions_state_check
    CHECK (state IN ('FREE','TRIALING','ACTIVE','PAST_DUE','READ_ONLY','SUSPENDED'));
ALTER TABLE collector.subscriptions ADD CONSTRAINT subscriptions_free_policy_check
    CHECK ((state <> 'FREE' OR plan_key = 'FREE')
       AND (plan_key <> 'FREE' OR state IN ('FREE','SUSPENDED')));

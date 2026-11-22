-- A provider-confirmed cancellation resolves pending changes without applying their target plan.
ALTER TABLE collector.billing_plan_changes DROP CONSTRAINT billing_plan_changes_state_check;
ALTER TABLE collector.billing_plan_changes ADD CONSTRAINT billing_plan_changes_state_check
 CHECK(state IN ('REQUESTED','SCHEDULED','APPLIED','CANCELLED'));

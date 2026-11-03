-- T28: read-only provider reconciliation leases; no new delivery state or resend path.
ALTER TABLE collector.reminder_deliveries
 ADD COLUMN reconciliation_count integer NOT NULL DEFAULT 0 CHECK(reconciliation_count>=0),
 ADD COLUMN reconcile_after timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN reconcile_lease uuid,ADD COLUMN reconcile_until timestamptz,
 ADD COLUMN reconciliation_failure text;
ALTER TABLE collector.sms_verifications
 ADD COLUMN reconciliation_count integer NOT NULL DEFAULT 0 CHECK(reconciliation_count>=0),
 ADD COLUMN reconcile_after timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN reconcile_lease uuid,ADD COLUMN reconcile_until timestamptz,
 ADD COLUMN reconciliation_failure text;
CREATE INDEX reminder_reconciliation ON collector.reminder_deliveries(reconcile_after) WHERE state='UNKNOWN' AND provider_id IS NOT NULL;
CREATE INDEX verification_reconciliation ON collector.sms_verifications(reconcile_after) WHERE state='UNKNOWN' AND provider_id IS NOT NULL;

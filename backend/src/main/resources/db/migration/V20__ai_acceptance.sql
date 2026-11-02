-- Explicit suggestion acceptance is separate from generation and immutable submissions.
ALTER TABLE collector.ai_draft_jobs DROP CONSTRAINT ai_draft_jobs_state_check;
ALTER TABLE collector.ai_draft_jobs ADD CONSTRAINT ai_draft_jobs_state_check CHECK(state IN ('QUEUED','RUNNING','SUCCEEDED','REFUSED','FAILED','ACCEPTED','EXPIRED'));
ALTER TABLE collector.ai_draft_jobs ADD COLUMN schema_snapshot jsonb, ADD COLUMN acceptance_json jsonb;
ALTER TABLE collector.ai_draft_jobs ADD CONSTRAINT ai_accepted_snapshot CHECK(state<>'ACCEPTED' OR acceptance_json IS NOT NULL);

-- Widen only the existing delivery purpose constraint; preserve all queued jobs.
ALTER TABLE collector.outbox_jobs DROP CONSTRAINT outbox_jobs_job_type_check;
ALTER TABLE collector.outbox_jobs ADD CONSTRAINT outbox_jobs_job_type_check
    CHECK (job_type IN ('VERIFY_EMAIL','RESET_PASSWORD'));

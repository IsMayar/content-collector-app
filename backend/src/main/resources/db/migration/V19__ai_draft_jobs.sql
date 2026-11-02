-- AI-only accounting; no suggestion acceptance or answer mutations.
CREATE TABLE collector.usage_periods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES collector.workspaces(id),
 period_start timestamptz NOT NULL,period_end timestamptz NOT NULL,
 ai_drafts_used integer NOT NULL DEFAULT 0 CHECK(ai_drafts_used>=0),ai_drafts_reserved integer NOT NULL DEFAULT 0 CHECK(ai_drafts_reserved>=0),
 ai_cost_microusd bigint NOT NULL DEFAULT 0 CHECK(ai_cost_microusd>=0),ai_reserved_microusd bigint NOT NULL DEFAULT 0 CHECK(ai_reserved_microusd>=0),
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,UNIQUE(workspace_id,period_start),UNIQUE(workspace_id,id),CHECK(period_end>period_start)
);
CREATE TABLE collector.ai_draft_jobs (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,project_id uuid NOT NULL,item_id uuid NOT NULL,contact_id uuid NOT NULL,period_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('QUEUED','RUNNING','SUCCEEDED','REFUSED','FAILED','EXPIRED')),
 base_answer_version bigint NOT NULL CHECK(base_answer_version>=0),input_json jsonb,result_json jsonb,
 model text NOT NULL,input_rate bigint NOT NULL,output_rate bigint NOT NULL,input_bound bigint NOT NULL,output_bound integer NOT NULL,
 reserved_microusd bigint NOT NULL CHECK(reserved_microusd>0),charged_microusd bigint CHECK(charged_microusd>=0),
 input_tokens bigint,output_tokens bigint,latency_ms bigint CHECK(latency_ms>=0),failure_code text,lease_id uuid,lease_until timestamptz,
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 FOREIGN KEY(workspace_id,project_id,item_id) REFERENCES collector.items(workspace_id,project_id,id),
 FOREIGN KEY(workspace_id,project_id,contact_id) REFERENCES collector.project_contacts(workspace_id,project_id,id),
 FOREIGN KEY(workspace_id,period_id) REFERENCES collector.usage_periods(workspace_id,id),
 CHECK(input_rate>0 AND output_rate>0 AND input_bound>0 AND output_bound>0),CHECK(expires_at=created_at+interval '30 days')
);
CREATE INDEX ai_dispatch ON collector.ai_draft_jobs(created_at) WHERE state IN ('QUEUED','RUNNING');
CREATE INDEX ai_contact_jobs ON collector.ai_draft_jobs(workspace_id,project_id,contact_id,id);

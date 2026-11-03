-- T29: metadata-only browser interactions; authoritative actions stay in audit_logs.
ALTER TABLE collector.projects ADD COLUMN analytics_excluded boolean NOT NULL DEFAULT false;
CREATE TABLE collector.analytics_events (
 id uuid PRIMARY KEY,
 workspace_id uuid NOT NULL,
 project_id uuid NOT NULL,
 template_version_id uuid NOT NULL,
 session_pseudonym char(64) NOT NULL CHECK(session_pseudonym ~ '^[0-9a-f]{64}$'),
 client_event_id uuid NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('project_opened','item_started')),
 item_id uuid,
 item_key varchar(200),
 received_at timestamptz NOT NULL,
 reported_at timestamptz,
 CHECK ((event_type='project_opened' AND item_id IS NULL AND item_key IS NULL) OR (event_type='item_started' AND item_id IS NOT NULL AND item_key IS NOT NULL)),
 FOREIGN KEY(workspace_id,project_id,template_version_id) REFERENCES collector.projects(workspace_id,id,source_template_version_id),
 FOREIGN KEY(workspace_id,project_id,item_id) REFERENCES collector.items(workspace_id,project_id,id),
 UNIQUE(workspace_id,project_id,session_pseudonym,client_event_id)
);
CREATE UNIQUE INDEX analytics_session_start ON collector.analytics_events(workspace_id,project_id,session_pseudonym,item_id) WHERE event_type='item_started';
CREATE UNIQUE INDEX analytics_session_open ON collector.analytics_events(workspace_id,project_id,session_pseudonym) WHERE event_type='project_opened';
CREATE INDEX analytics_project_received ON collector.analytics_events(workspace_id,project_id,received_at,id);
CREATE INDEX analytics_retention ON collector.analytics_events(received_at);

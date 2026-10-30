-- Mutable project-shared drafts, separate from future immutable submissions.
CREATE TABLE collector.answers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, project_id uuid NOT NULL,
 item_id uuid NOT NULL UNIQUE, value_json jsonb NOT NULL CHECK(jsonb_typeof(value_json)='object'),
 version bigint NOT NULL CHECK(version>0), structure_version bigint NOT NULL CHECK(structure_version>0),
 updated_by_contact_id uuid NOT NULL, save_operation_id uuid NOT NULL, request_hash char(64) NOT NULL,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 FOREIGN KEY(workspace_id,project_id,item_id) REFERENCES collector.items(workspace_id,project_id,id),
 FOREIGN KEY(workspace_id,project_id,updated_by_contact_id) REFERENCES collector.project_contacts(workspace_id,project_id,id),
 UNIQUE(workspace_id,project_id,id), CHECK(updated_at>=created_at)
);
CREATE INDEX answers_project_idx ON collector.answers(workspace_id,project_id);

ALTER TABLE collector.projects ADD COLUMN published_at timestamptz,ADD COLUMN published_version bigint CHECK(published_version>0);
ALTER TABLE collector.projects ADD CONSTRAINT project_publication_pair CHECK((published_at IS NULL)=(published_version IS NULL));
CREATE TABLE collector.item_reopenings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,project_id uuid NOT NULL,item_id uuid NOT NULL,revision_id uuid NOT NULL UNIQUE,
 opened_by_member_id uuid NOT NULL,reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 5000),created_at timestamptz NOT NULL,
 FOREIGN KEY(workspace_id,project_id,item_id,revision_id) REFERENCES collector.submission_revisions(workspace_id,project_id,item_id,id),
 FOREIGN KEY(workspace_id,opened_by_member_id) REFERENCES collector.workspace_members(workspace_id,id)
);
CREATE TRIGGER item_reopening_immutable BEFORE UPDATE OR DELETE ON collector.item_reopenings FOR EACH ROW EXECUTE FUNCTION collector.reject_submission_change();

CREATE TABLE collector.project_lifecycle_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,project_id uuid NOT NULL,actor_member_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('publish','pause','resume','complete','reopen','archive','restore')),
 from_state text NOT NULL,to_state text NOT NULL,project_version bigint NOT NULL CHECK(project_version>0),
 reason text CHECK(length(reason)<=5000),occurred_at timestamptz NOT NULL,
 FOREIGN KEY(workspace_id,project_id) REFERENCES collector.projects(workspace_id,id),
 FOREIGN KEY(workspace_id,actor_member_id) REFERENCES collector.workspace_members(workspace_id,id)
);
CREATE TRIGGER project_lifecycle_event_immutable BEFORE UPDATE OR DELETE ON collector.project_lifecycle_events FOR EACH ROW EXECUTE FUNCTION collector.reject_submission_change();

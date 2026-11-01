-- Exact-revision decisions and separate client/internal discussion; existing submissions remain immutable.
CREATE TABLE collector.review_decisions (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,project_id uuid NOT NULL,item_id uuid NOT NULL,revision_id uuid NOT NULL UNIQUE,
 reviewed_by_member_id uuid NOT NULL,decision text NOT NULL CHECK(decision IN ('APPROVE','REQUEST_CHANGES')),
 reason text CHECK(length(reason)<=5000),expected_item_version bigint NOT NULL CHECK(expected_item_version>0),created_at timestamptz NOT NULL,
 CHECK(decision<>'REQUEST_CHANGES' OR length(btrim(reason))>0 AND reason IS NOT NULL),
 FOREIGN KEY(workspace_id,project_id,item_id,revision_id) REFERENCES collector.submission_revisions(workspace_id,project_id,item_id,id),
 FOREIGN KEY(workspace_id,reviewed_by_member_id) REFERENCES collector.workspace_members(workspace_id,id)
);
CREATE TRIGGER review_decisions_immutable BEFORE UPDATE OR DELETE ON collector.review_decisions FOR EACH ROW EXECUTE FUNCTION collector.reject_submission_change();
CREATE TABLE collector.comments (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,project_id uuid NOT NULL,item_id uuid NOT NULL,revision_id uuid,
 author_member_id uuid,author_contact_id uuid,visibility text NOT NULL CHECK(visibility IN ('CLIENT','INTERNAL')),
 body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 5000),created_at timestamptz NOT NULL,
 CHECK((author_member_id IS NOT NULL)<>(author_contact_id IS NOT NULL)),CHECK(author_contact_id IS NULL OR visibility='CLIENT'),
 FOREIGN KEY(workspace_id,project_id,item_id) REFERENCES collector.items(workspace_id,project_id,id),
 FOREIGN KEY(workspace_id,project_id,item_id,revision_id) REFERENCES collector.submission_revisions(workspace_id,project_id,item_id,id),
 FOREIGN KEY(workspace_id,author_member_id) REFERENCES collector.workspace_members(workspace_id,id),
 FOREIGN KEY(workspace_id,project_id,author_contact_id) REFERENCES collector.project_contacts(workspace_id,project_id,id)
);
CREATE INDEX comment_item_visibility ON collector.comments(workspace_id,project_id,item_id,visibility,created_at,id);
CREATE TRIGGER comments_immutable BEFORE UPDATE OR DELETE ON collector.comments FOR EACH ROW EXECUTE FUNCTION collector.reject_submission_change();

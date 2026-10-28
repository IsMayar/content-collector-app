-- T09: catalog identities and immutable published definitions. No project tables.
CREATE TABLE collector.templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid REFERENCES collector.workspaces(id),
    template_key varchar(160) NOT NULL CHECK (length(btrim(template_key)) > 0),
    project_type text NOT NULL CHECK (project_type IN ('WEBSITE','WEB_APP','MOBILE_APP')),
    industry varchar(80),
    title varchar(160) NOT NULL CHECK (length(btrim(title)) > 0),
    is_builtin boolean NOT NULL DEFAULT false,
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    draft_definition jsonb CHECK (draft_definition IS NULL OR jsonb_typeof(draft_definition)='object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now() CHECK (updated_at >= created_at),
    CHECK ((is_builtin AND workspace_id IS NULL) OR (NOT is_builtin AND workspace_id IS NOT NULL))
);
CREATE UNIQUE INDEX builtin_template_key ON collector.templates(template_key) WHERE workspace_id IS NULL;
CREATE UNIQUE INDEX workspace_template_key ON collector.templates(workspace_id,template_key) WHERE workspace_id IS NOT NULL;
CREATE INDEX template_catalog_filter ON collector.templates(project_type,industry);
CREATE TABLE collector.template_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id uuid NOT NULL REFERENCES collector.templates(id),
    version_no integer NOT NULL CHECK (version_no > 0),
    schema_version integer NOT NULL CHECK (schema_version=1),
    definition jsonb NOT NULL CHECK (jsonb_typeof(definition)='object' AND octet_length(definition::text)<=1048576),
    published_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(template_id,version_no)
);
-- Published definitions have no ordinary update/delete lifecycle; future versions are INSERTs.
CREATE FUNCTION collector.reject_template_version_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Published template versions are immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER template_versions_immutable BEFORE UPDATE OR DELETE ON collector.template_versions
    FOR EACH ROW EXECUTE FUNCTION collector.reject_template_version_change();

-- Structure edits need an atomic audit trail. Never store field contents or schema JSON here.
create table collector.audit_logs (
    id uuid primary key,
    workspace_id uuid not null references collector.workspaces(id),
    project_id uuid not null,
    actor_kind text not null check (actor_kind = 'USER'),
    actor_id uuid not null references collector.users(id),
    action varchar(100) not null,
    resource_kind varchar(80) not null,
    resource_id uuid not null,
    metadata_json jsonb not null check (jsonb_typeof(metadata_json) = 'object'),
    created_at timestamptz not null,
    updated_at timestamptz not null,
    foreign key (workspace_id,project_id) references collector.projects(workspace_id,id)
);
create index audit_logs_project_time on collector.audit_logs(workspace_id,project_id,created_at,id);

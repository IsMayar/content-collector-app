import { useProjects } from '@/features/projects/api/projectsApi'
import type { WorkspaceDetail } from '@/features/workspace/types/workspace.types'
import { useData } from '@/services/api/resourceApi'
import { ProjectTable } from '@/features/projects/components/ProjectTable'
import { projectTypes } from '@/features/projects/types/projectOptions'
import {
  Empty,
  Field,
  Heading,
  QueryState,
} from '@/shared/components/ProductUI'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import { Link, useSearchParams } from 'react-router'

export function ProjectsPage() {
  const { id, base, owner } = useWorkspace()
  const [search, setSearch] = useSearchParams()
  const query = useProjects(id, search)
  const access = useData<WorkspaceDetail>(`workspaces/${id}`, { skip: !owner })
  const canCreate = access.data?.entitlements.canWrite === true
  const readOnly = access.data?.entitlements.canWrite === false
  function filter(key: string, value: string) {
    const next = new URLSearchParams(search)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setSearch(next)
  }
  return (
    <>
      <Heading
        title="Projects"
        description="Live client projects: track content, deadlines, reviews and delivery."
      >
        {owner &&
          (canCreate ? (
            <Link className="primary-button" to={`${base}/projects/new`}>
              ＋ Create project
            </Link>
          ) : (
            <button type="button" className="primary-button" disabled>
              ＋ Create project
            </button>
          ))}
      </Heading>
      {owner && !canCreate && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-slate-700"
        >
          {readOnly ? (
            <>
              This workspace is read-only. Project creation is paused, but you
              can still view existing projects.{' '}
              <Link
                className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                to={`${base}/settings?view=billing`}
              >
                Manage billing
              </Link>
            </>
          ) : access.isError ? (
            'Project creation is unavailable because workspace editing permissions could not be verified. Refresh the page to try again.'
          ) : (
            'Checking workspace editing permissions before enabling project creation…'
          )}
        </div>
      )}
      <div className="filter-bar">
        <Field label="Search projects">
          <input
            type="search"
            value={search.get('search') || ''}
            placeholder="Search by project or customer"
            onChange={(e) => filter('search', e.target.value)}
          />
        </Field>
        <Field label="Project type">
          <select
            value={search.get('projectType') || ''}
            onChange={(e) => filter('projectType', e.target.value)}
          >
            <option value="">All types</option>
            {projectTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="State">
          <select
            value={search.get('state') || ''}
            onChange={(e) => filter('state', e.target.value)}
          >
            <option value="">All states</option>
            {['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Sort by">
          <select
            value={search.get('sort') || 'updatedAt'}
            onChange={(e) => filter('sort', e.target.value)}
          >
            <option value="updatedAt">Recently updated</option>
            <option value="title">Project name</option>
            <option value="dueDate">Due date</option>
          </select>
        </Field>
      </div>
      <nav className="reference-tabs" aria-label="Project types">
        {[{ value: '', label: 'All projects' }, ...projectTypes].map((t) => (
          <button
            key={t.value}
            className={
              (search.get('projectType') || '') === t.value ? 'active' : ''
            }
            onClick={() => filter('projectType', t.value)}
            aria-pressed={(search.get('projectType') || '') === t.value}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <QueryState query={query}>
        {query.data?.data.length ? (
          <>
            <ProjectTable projects={query.data.data} base={base} />
            <div className="pagination">
              <span>{query.data.page.totalElements} projects</span>
              <button
                className="secondary-button"
                disabled={!Number(search.get('page') || 0)}
                onClick={() =>
                  filter('page', String(Number(search.get('page')) - 1))
                }
              >
                Previous
              </button>
              <span>Page {Number(search.get('page') || 0) + 1}</span>
              <button
                className="secondary-button"
                disabled={
                  (Number(search.get('page') || 0) + 1) *
                    query.data.page.size >=
                  query.data.page.totalElements
                }
                onClick={() =>
                  filter('page', String(Number(search.get('page') || 0) + 1))
                }
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <Empty
            title="No projects found"
            description={
              owner
                ? canCreate
                  ? 'Try another filter, or start a fresh collection.'
                  : 'No projects found. Project creation is unavailable while workspace editing is paused.'
                : 'Try another filter. If no projects are assigned to you yet, ask your workspace owner for access.'
            }
            to={owner ? `${base}/projects/new` : undefined}
            label="New project"
            disabledAction={owner && !canCreate}
          />
        )}
      </QueryState>
    </>
  )
}

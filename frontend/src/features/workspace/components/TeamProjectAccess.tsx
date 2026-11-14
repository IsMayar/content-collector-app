import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useProjects } from '@/features/projects/api/projectsApi'
import { AssignmentsPanel } from '@/features/projects/components/AssignmentsPanel'
import { Field, QueryState } from '@/shared/components/ProductUI'
import { useWorkspace } from '@/shared/hooks/useWorkspace'

export function TeamProjectAccess() {
  const { id } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const projects = useProjects(
    id,
    new URLSearchParams({ page: String(page), size: '20', search }),
  )
  const projectId = params.get('projectId') || ''
  return (
    <section aria-label="Project access" className="team-project-access">
      <h2>Project access</h2>
      <p className="subtle">
        Choose a project to manage assignments and independent review and export
        permissions.
      </p>
      <Field label="Find a project">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
          placeholder="Search projects"
        />
      </Field>
      <QueryState query={projects}>
        <Field label="Project">
          <select
            value={projectId}
            onChange={(e) => {
              const next = new URLSearchParams(params)
              if (e.target.value) next.set('projectId', e.target.value)
              else next.delete('projectId')
              setParams(next)
            }}
          >
            <option value="">Choose a project</option>
            {projectId &&
              !projects.data?.data.some((p) => p.id === projectId) && (
                <option value={projectId}>Selected project</option>
              )}
            {projects.data?.data.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </Field>
        <div className="actions">
          <button
            className="secondary-button"
            disabled={page === 0 || projects.isFetching}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous projects
          </button>
          <button
            className="secondary-button"
            disabled={
              projects.isFetching ||
              (page + 1) * 20 >= (projects.data?.page.totalElements || 0)
            }
            onClick={() => setPage((p) => p + 1)}
          >
            Next projects
          </button>
        </div>
      </QueryState>
      {projectId && (
        <AssignmentsPanel
          key={id + projectId}
          root={
            'workspaces/' + id + '/projects/' + encodeURIComponent(projectId)
          }
        />
      )}
    </section>
  )
}

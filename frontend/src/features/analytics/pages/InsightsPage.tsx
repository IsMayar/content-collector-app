import { AnalyticsPanel } from '@/features/analytics/components/AnalyticsPanel'
import type { Project } from '@/features/projects/types/project.types'
import { useData } from '@/services/api/resourceApi'
import {
  Badge,
  Empty,
  Field,
  Heading,
  QueryState,
} from '@/shared/components/ProductUI'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import type { Paged } from '@/shared/types/common.types'
import { useState } from 'react'
import { Link } from 'react-router'
export function InsightsPage() {
  const { id, base } = useWorkspace()
  const q = useData<Paged<Project>>(`workspaces/${id}/projects?size=100`)
  const [project, setProject] = useState('')
  const projects = q.data?.data || []
  const selected = projects.find((p) => p.id === project) || projects[0]
  const total = projects.reduce((n, p) => n + p.progress.requiredTotal, 0)
  const submitted = projects.reduce(
    (n, p) => n + p.progress.submittedRequired,
    0,
  )
  const approved = projects.reduce((n, p) => n + p.progress.approvedRequired, 0)
  return (
    <div className="insights-page">
      <Heading
        title="Insights"
        description="See what’s moving, what’s approved and where clients need support."
      >
        <span className="insights-scope">Current snapshot</span>
      </Heading>
      <QueryState query={q}>
        {projects.length ? (
          <>
            <div className="insights-summary">
              {[
                ['Projects', projects.length, 'In this view'],
                ['Required items', total, 'Visible collection requirements'],
                ['Submitted', submitted, 'Ready for review or approved'],
                ['Approved', approved, 'Ready for delivery'],
              ].map(([label, count, copy]) => (
                <article key={label}>
                  <span>{label}</span>
                  <strong>{count}</strong>
                  <small>{copy}</small>
                </article>
              ))}
            </div>
            <section
              className="insights-project-picker"
              aria-label="Project insights selection"
            >
              <div>
                <h2>Explore a project</h2>
                <p>
                  Choose a project to review its progress and collection
                  friction.
                </p>
              </div>
              <Field label="Project">
                <select
                  value={selected?.id || ''}
                  onChange={(e) => setProject(e.target.value)}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </Field>
              {selected && (
                <Link
                  className="secondary-button"
                  to={`${base}/projects/${selected.id}?tab=analytics`}
                >
                  Open project
                </Link>
              )}
            </section>
            {selected && (
              <div className="insights-project-detail">
                <div className="insights-project-caption">
                  <div>
                    <span className="eyebrow">Project performance</span>
                    <h2>{selected.title}</h2>
                    <p>
                      {selected.clientBusinessName} ·{' '}
                      {selected.projectType.replaceAll('_', ' ')}
                    </p>
                  </div>
                  <Badge>{selected.state}</Badge>
                </div>
                <AnalyticsPanel
                  key={selected.id}
                  root={`workspaces/${id}/projects/${selected.id}`}
                />
              </div>
            )}
            {q.data && q.data.page.totalElements > projects.length && (
              <p className="subtle">
                Showing {projects.length} loaded projects. Open Projects to
                browse all projects.
              </p>
            )}
          </>
        ) : (
          <Empty
            title="Your insights start with a project"
            description="Create a project and collect content to see progress here."
            to={`${base}/projects`}
            label="Open projects"
          />
        )}
      </QueryState>
    </div>
  )
}

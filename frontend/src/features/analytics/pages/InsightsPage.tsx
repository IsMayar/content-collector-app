import { Folder, ListChecks, Send, CircleCheck, Layers } from 'lucide-react'
import { TemplateFrictionPanel } from '../components/TemplateFrictionPanel'
import { useProjectAnalyticsQuery } from '../api/analyticsApi'
import type { Project } from '@/features/projects/types/project.types'
import { useData } from '@/services/api/resourceApi'
import {
  Empty,
  Field,
  Heading,
  Panel,
  QueryState,
} from '@/shared/components/ProductUI'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import type { Paged } from '@/shared/types/common.types'
import { useState } from 'react'
import { Link } from 'react-router'
import './InsightsPage.css'

export function InsightsPage() {
  const { id, base, owner } = useWorkspace()
  const q = useData<Paged<Project>>(`workspaces/${id}/projects?size=100`)
  const [project, setProject] = useState('')
  const loaded = q.currentData as Paged<Project> | undefined
  const projects = loaded?.data || []
  const selected = projects.find((p) => p.id === project) || projects[0]
  const truncated = (loaded?.page.totalElements ?? 0) > projects.length
  const scope = truncated
    ? 'Loaded projects'
    : owner
      ? 'Workspace overview'
      : 'Assigned projects'
  const metrics = [
    {
      label: 'Active projects',
      value: projects.filter((p) => p.state === 'ACTIVE').length,
      copy: 'Projects in the active state',
      Icon: Folder,
    },
    {
      label: 'Required items',
      value: projects.reduce((n, p) => n + p.progress.requiredTotal, 0),
      copy: 'Visible, enabled requirements',
      Icon: ListChecks,
    },
    {
      label: 'Submitted',
      value: projects.reduce((n, p) => n + p.progress.submittedRequired, 0),
      copy: 'Required items submitted or approved',
      Icon: Send,
    },
    {
      label: 'Approved',
      value: projects.reduce((n, p) => n + p.progress.approvedRequired, 0),
      copy: 'Approved required items',
      Icon: CircleCheck,
    },
  ]

  return (
    <div className="insights-dashboard">
      <Heading
        title="Insights"
        description="Track project progress, client bottlenecks, and approval flow at a glance."
      >
        {selected && (
          <Field label="Project">
            <select
              value={selected.id}
              onChange={(e) => setProject(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        <span className="insights-snapshot">
          <Layers size={16} aria-hidden="true" /> Current snapshot
        </span>
      </Heading>
      <QueryState query={{ ...q, isLoading: q.isFetching && !q.currentData }}>
        {selected ? (
          <>
            <section aria-labelledby="insights-scope-heading">
              <h2 id="insights-scope-heading">{scope}</h2>
              {truncated && (
                <p className="subtle">
                  Totals cover {projects.length} of {loaded?.page.totalElements}{' '}
                  accessible projects.
                </p>
              )}
              <div className="insights-metrics">
                {metrics.map(({ label, value, copy, Icon }) => (
                  <article key={label}>
                    <span className="insights-symbol">
                      <Icon size={22} aria-hidden="true" />
                    </span>
                    <div>
                      <h3>{label}</h3>
                      <strong>{value}</strong>
                      <p>{copy}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <ProjectSnapshot
              key={selected.id}
              project={selected}
              root={`workspaces/${id}/projects/${selected.id}`}
              href={`${base}/projects/${selected.id}?tab=analytics`}
            />
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
      {owner && <TemplateFrictionPanel workspaceId={id} />}
      <details className="insights-method">
        <summary>How Insights are calculated</summary>
        <p>
          Progress counts visible, enabled, required items. Submitted includes
          approved items. Client action uses the project progress evaluator.
          Template rates require at least 10 eligible starts and 10 completed
          observation windows.
        </p>
      </details>
    </div>
  )
}

function ProjectSnapshot({
  project,
  root,
  href,
}: {
  project: Project
  root: string
  href: string
}) {
  const query = useProjectAnalyticsQuery(root)
  const data = query.currentData
  const sections = data?.sections

  return (
    <section
      aria-label={`Insights for ${project.title}`}
      className="insights-project-snapshot"
    >
      <QueryState query={query}>
        {data && (
          <>
            <div className="insights-section-grid">
              <Panel
                title={
                  sections?.length
                    ? 'Project progress by section'
                    : 'Project progress'
                }
              >
                <p className="subtle">{project.title}</p>
                {sections?.length ? (
                  <>
                    <p className="insights-legend">
                      <span>Submitted</span>
                      <span>Approved</span>
                    </p>
                    <ul className="insights-bars">
                      {sections.map(({ id, title, progress }) => {
                        const {
                          submittedRequired,
                          approvedRequired,
                          requiredTotal,
                        } = progress
                        const width = (count: number) =>
                          requiredTotal
                            ? `${Math.min(count / requiredTotal, 1) * 100}%`
                            : '0%'
                        return (
                          <li key={id}>
                            <span>{title}</span>
                            <span className="insights-track" aria-hidden="true">
                              <span
                                style={{ width: width(submittedRequired) }}
                              />
                              <span
                                style={{ width: width(approvedRequired) }}
                              />
                            </span>
                            <span className="sr-only">
                              Submitted {submittedRequired} of {requiredTotal}.
                              Approved {approvedRequired} of {requiredTotal}.
                            </span>
                            <span aria-hidden="true">
                              {submittedRequired} / {requiredTotal}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </>
                ) : (
                  <dl className="insights-totals">
                    <div>
                      <dt>Required</dt>
                      <dd>{data.progress.requiredTotal}</dd>
                    </div>
                    <div>
                      <dt>Submitted</dt>
                      <dd>{data.progress.submittedRequired}</dd>
                    </div>
                    <div>
                      <dt>Approved</dt>
                      <dd>{data.progress.approvedRequired}</dd>
                    </div>
                    <div>
                      <dt>Client action</dt>
                      <dd>{data.progress.clientActionRequired}</dd>
                    </div>
                  </dl>
                )}
              </Panel>
              {!!sections?.length && (
                <details open className="product-panel insights-details">
                  <summary>Section status details</summary>
                  <table className="insights-table">
                    <thead>
                      <tr>
                        <th scope="col">Section</th>
                        <th scope="col">Submitted</th>
                        <th scope="col">Approved</th>
                        <th scope="col">Client action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sections.map(({ id, title, progress }) => (
                        <tr key={id}>
                          <th scope="row">{title}</th>
                          <td>{progress.submittedRequired}</td>
                          <td>{progress.approvedRequired}</td>
                          <td>{progress.clientActionRequired}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </div>
            <div className="insights-meta">
              <span>
                Generated{' '}
                <time dateTime={data.generatedAt}>
                  {new Date(data.generatedAt).toLocaleString()}
                </time>
              </span>
              <Link to={href}>Open project analytics</Link>
            </div>
          </>
        )}
      </QueryState>
    </section>
  )
}

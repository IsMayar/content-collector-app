import { ProjectCard } from '@/features/projects/components/ProjectCard'
import type { Project } from '@/features/projects/types/project.types'
import { Badge } from '@/shared/components/ProductUI'
import { Link } from 'react-router'
export function ProjectTable({
  projects,
  base,
}: {
  projects: Project[]
  base: string
}) {
  return (
    <div className="reference-table-wrap">
      <table className="reference-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Client</th>
            <th>Type</th>
            <th>Due date</th>
            <th>Submitted</th>
            <th>Approved</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Open project</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              <td>
                <ProjectCard project={p} base={base} />
              </td>
              <td>{p.clientBusinessName}</td>
              <td>
                {p.projectType === 'WEBSITE'
                  ? 'Website'
                  : p.projectType === 'WEB_APP'
                    ? 'Web app'
                    : 'Mobile app'}
              </td>
              <td>
                {new Date(`${p.dueDate}T12:00:00`).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </td>
              {[p.progress.submittedRequired, p.progress.approvedRequired].map(
                (count, index) => (
                  <td key={index}>
                    <div
                      className={`table-progress ${index ? 'approved' : ''}`}
                    >
                      <strong>
                        {count}/{p.progress.requiredTotal}
                      </strong>
                      <progress
                        aria-label={`${p.title} ${index ? 'approved' : 'submitted'}`}
                        max={p.progress.requiredTotal || 1}
                        value={count}
                      />
                    </div>
                  </td>
                ),
              )}
              <td>
                <Badge>{p.state}</Badge>
              </td>
              <td>
                <Link
                  className="icon-button"
                  aria-label={`Open ${p.title}`}
                  to={`${base}/projects/${p.id}`}
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

import type { SafeAuditEvent } from '@/features/review/types/review.types'
import { useData } from '@/services/api/resourceApi'
import { Activity } from 'lucide-react'
import { CardHeader } from '@/shared/components/AccessUI'
import { QueryState } from '@/shared/components/ProductUI'
import { useState } from 'react'

export function ActivityPanel({ root }: { root: string }) {
  const [page, setPage] = useState(0)
  const q = useData<{
    data: SafeAuditEvent[]
    page?: { page: number; size: number; totalElements: number }
  }>(`${root}/activity?page=${page}&size=20`)
  return (
    <section className="project-view-card project-activity-card">
      <CardHeader
        icon={Activity}
        title="Project activity"
        subtitle="A record of project changes and submissions."
      />
      <div className="project-view-body">
      <QueryState query={q}>
        {q.data?.data.length === 0 && (
          <p>
            No activity yet. Project changes and client submissions will appear
            here.
          </p>
        )}
        <ol className="project-activity-timeline">
          {q.data?.data.map((e) => (
            <li key={e.id}>
              <span className="timeline-dot" />
              <div>
                <strong>
                  {e.action.toLowerCase().replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase())}
                </strong>
                <p>{e.actorDisplayName}</p>
              </div>
              <time dateTime={e.occurredAt}>
                {new Date(e.occurredAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ol>
        {q.data?.page && q.data.page.totalElements > 20 && (
          <nav aria-label="Activity pages" className="actions">
            <button
              className="secondary-button"
              disabled={page === 0 || q.isFetching}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span>Page {page + 1}</span>
            <button
              className="secondary-button"
              disabled={
                (page + 1) * 20 >= q.data.page.totalElements || q.isFetching
              }
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </nav>
        )}
      </QueryState>
      </div>
    </section>
  )
}
export { ExportPanel } from '@/features/exports/components/ExportPanel'

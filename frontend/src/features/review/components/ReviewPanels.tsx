import type { SafeAuditEvent } from '@/features/review/types/review.types'
import { useData } from '@/services/api/resourceApi'
import { Panel, QueryState } from '@/shared/components/ProductUI'
import { useState } from 'react'

export function ActivityPanel({ root }: { root: string }) {
  const [page, setPage] = useState(0)
  const q = useData<{
    data: SafeAuditEvent[]
    page?: { page: number; size: number; totalElements: number }
  }>(`${root}/activity?page=${page}&size=20`)
  return (
    <Panel title="Project activity">
      <p className="subtle">
        A record of meaningful actions. Answers, tokens and private file URLs
        are excluded.
      </p>
      <QueryState query={q}>
        {q.data?.data.length === 0 && (
          <p>
            No activity yet. Project changes and client submissions will appear
            here.
          </p>
        )}
        <ol className="activity-timeline">
          {q.data?.data.map((e) => (
            <li key={e.id}>
              <span className="timeline-dot" />
              <div>
                <strong>{e.action}</strong>
                <p>
                  {e.actorDisplayName} ·{' '}
                  <time>{new Date(e.occurredAt).toLocaleString()}</time>
                </p>
              </div>
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
    </Panel>
  )
}
export { ExportPanel } from '@/features/exports/components/ExportPanel'

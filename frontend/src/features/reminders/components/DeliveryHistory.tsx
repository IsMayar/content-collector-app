import type { DeliverySummary } from '@/features/reminders/types/reminder.types'
import { useData } from '@/services/api/resourceApi'
import { CardHeader } from '@/shared/components/AccessUI'
import { Badge, QueryState } from '@/shared/components/ProductUI'
import { Mail, History } from 'lucide-react'
import { useState, type ReactNode } from 'react'

export function DeliveryHistory({ root, action }: { root: string; action?: ReactNode }) {
  const [page, setPage] = useState(0)
  const q = useData<{
    data: DeliverySummary[]
    page?: { totalElements: number }
  }>(`${root}/deliveries?page=${page}&size=20`)
  const rows = (q.data?.data ?? []).filter((d) => d.channel === 'EMAIL')
  return (
    <section className="project-view-card email-history">
      <CardHeader icon={History} title="Email history" action={action} />
      <div className="project-view-body">
        <QueryState query={q}>
          {rows.length ? (
            <div className="reference-table-wrap">
              <table className="reference-table">
                <thead><tr><th>Date & time</th><th>Status</th><th>Details</th></tr></thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.id}>
                      <td><time dateTime={d.dueAt}>{new Date(d.dueAt).toLocaleString()}</time></td>
                      <td><Badge>{d.state}</Badge></td>
                      <td>{d.state === 'UNKNOWN'
                        ? 'Awaiting provider reconciliation. Do not retry.'
                        : d.failureCode?.replaceAll('_', ' ').toLowerCase() || 'No reported issue'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="email-history-empty">
              <Mail size={28} aria-hidden="true" />
              <strong>No email reminders on this page</strong>
              <p className="subtle">Scheduled and sent reminders will appear here.</p>
            </div>
          )}
          {q.data?.page && (page > 0 || q.data.page.totalElements > 20) && (
            <nav className="email-reminder-actions" aria-label="Email history pages">
              <button type="button" className="au-btn au-btn--secondary" disabled={page === 0 || q.isFetching} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page + 1}</span>
              <button type="button" className="au-btn au-btn--secondary" disabled={(page + 1) * 20 >= q.data.page.totalElements || q.isFetching} onClick={() => setPage(page + 1)}>Next</button>
            </nav>
          )}
        </QueryState>
      </div>
    </section>
  )
}

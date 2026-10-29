import type { DeliverySummary } from '@/features/reminders/types/reminder.types'
import { useData } from '@/services/api/resourceApi'
import { Badge, Empty, Panel, QueryState } from '@/shared/components/ProductUI'
import { useState } from 'react'

export function DeliveryHistory({ root }: { root: string }) {
  const q = useData<{ data: DeliverySummary[] }>(`${root}/reminders/deliveries`)
  const [channel, setChannel] = useState('ALL'),
    [status, setStatus] = useState('ALL')
  const rows = q.data?.data || []
  return (
    <Panel title="Reminder delivery activity">
      <div className="report-metrics">
        {[
          ['Email', rows.filter((d) => d.channel === 'EMAIL').length],
          ['SMS', rows.filter((d) => d.channel === 'SMS').length],
          ['Delivered', rows.filter((d) => d.state === 'DELIVERED').length],
          [
            'Action needed',
            rows.filter((d) =>
              ['FAILED', 'BOUNCED', 'UNKNOWN'].includes(d.state),
            ).length,
          ],
        ].map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className="report-filters">
        <select
          aria-label="Delivery channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
        >
          <option value="ALL">All channels</option>
          <option>EMAIL</option>
          <option>SMS</option>
        </select>
        <select
          aria-label="Delivery status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="ALL">All statuses</option>
          {[...new Set(rows.map((d) => d.state))].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <QueryState query={q}>
        {rows.length ? (
          <div className="reference-table-wrap">
            <table className="reference-table">
              <thead>
                <tr>
                  <th>Date & time</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter(
                    (d) =>
                      (channel === 'ALL' || d.channel === channel) &&
                      (status === 'ALL' || d.state === status),
                  )
                  .map((d) => (
                    <tr key={d.id}>
                      <td>{new Date(d.dueAt).toLocaleString()}</td>
                      <td>{d.channel}</td>
                      <td>
                        <Badge>{d.state}</Badge>
                      </td>
                      <td>
                        {d.state === 'UNKNOWN'
                          ? 'Awaiting provider reconciliation. Do not retry.'
                          : d.failureCode || 'No reported issue'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No reminders yet"
            description="Eligible reminders and their delivery states will appear here."
          />
        )}
      </QueryState>
    </Panel>
  )
}

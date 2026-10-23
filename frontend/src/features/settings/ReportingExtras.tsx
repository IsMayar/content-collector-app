import { useState } from 'react'
import { useData } from '@/api/productApi'
import type { DeliverySummary, Workspace } from '@/api/contracts'
import {
  Badge,
  Empty,
  ErrorNotice,
  Field,
  Panel,
  QueryState,
  useCommand,
} from '@/components/ProductUI'
import { Notice } from '@/components/Feedback'
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
export function DigestPreview({ workspaceId }: { workspaceId: string }) {
  const q = useData<{
    workspaceName: string
    activeProjects: number
    required: number
    submitted: number
    approved: number
    clientAction: number
  }>(`workspaces/${workspaceId}/digest-preview`)
  const settings = useData<{ workspace: Workspace; digestEnabled: boolean }>(
      `workspaces/${workspaceId}/settings`,
    ),
    command = useCommand(),
    [message, setMessage] = useState('')
  return (
    <Panel title="Daily digest">
      <p>
        Receive one daily summary of client actions and items awaiting review in
        your workspace timezone.
      </p>
      <div className="digest-layout">
        <form
          className="stack-form"
          key={settings.data?.workspace.version}
          onSubmit={async (e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            if (
              settings.data &&
              (await command.run(
                `workspaces/${workspaceId}`,
                {
                  name: settings.data.workspace.name,
                  timezone: f.get('timezone'),
                  digestEnabled: f.has('enabled'),
                  expectedVersion: settings.data.workspace.version,
                },
                'PATCH',
              ))
            )
              setMessage('Daily digest preference saved.')
          }}
        >
          <h3>Digest settings</h3>
          <label className="permission-choice">
            <input
              type="checkbox"
              role="switch"
              name="enabled"
              defaultChecked={settings.data?.digestEnabled}
            />
            <span>
              <strong>Receive daily digest</strong>
              <small>
                Private summaries are restricted to authorised projects.
              </small>
            </span>
          </label>
          <Field label="Digest timezone">
            <input
              name="timezone"
              required
              defaultValue={settings.data?.workspace.timezone}
            />
          </Field>
          <p className="subtle">
            Uses your workspace timezone and your configured delivery service.
          </p>
          <button
            className="primary-button"
            disabled={!settings.data || command.pending}
          >
            Save digest settings
          </button>
        </form>
        <section className="digest-preview">
          <h3>Next digest preview</h3>
          <QueryState query={q}>
            {q.data && (
              <>
                <strong className="email-brand">▣ Content Collector</strong>
                <p>Daily digest · {q.data.workspaceName}</p>
                <div className="digest-count">
                  <strong>{q.data.clientAction}</strong>
                  <span>Awaiting client action</span>
                </div>
                <div className="digest-count">
                  <strong>
                    {Math.max(0, q.data.submitted - q.data.approved)}
                  </strong>
                  <span>Awaiting your review</span>
                </div>
                <p>{q.data.activeProjects} active projects</p>
                <small>Preview only. No email is sent.</small>
              </>
            )}
          </QueryState>
        </section>
      </div>
      <ErrorNotice error={command.error} />
      {message && <Notice>{message}</Notice>}
    </Panel>
  )
}

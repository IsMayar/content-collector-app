import { useState } from 'react'
import { useData } from '@/api/productApi'
import type { DeliverySummary } from '@/api/contracts'
import { Badge, Empty, Panel, QueryState } from '@/components/ProductUI'
export function DeliveryHistory({ root }: { root: string }) {
  const q = useData<{ data: DeliverySummary[] }>(`${root}/reminders/deliveries`)
  return (
    <Panel title="Reminder delivery history">
      <QueryState query={q}>
        {q.data?.data.length ? (
          q.data.data.map((d) => (
            <div key={d.id} className="access-row">
              <div className="grow">
                <strong>{d.channel}</strong>
                <p>{new Date(d.dueAt).toLocaleString()}</p>
                {d.failureCode && <p>{d.failureCode}</p>}
              </div>
              <Badge>{d.state}</Badge>
              {d.state === 'UNKNOWN' && (
                <span className="subtle">
                  Awaiting provider reconciliation; do not retry blindly.
                </span>
              )}
            </div>
          ))
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
  const [open, setOpen] = useState(false)
  const q = useData<{
    workspaceName: string
    activeProjects: number
    required: number
    submitted: number
    approved: number
    clientAction: number
  }>(`workspaces/${workspaceId}/digest-preview`, { skip: !open })
  return (
    <div>
      <button
        type="button"
        className="secondary-button"
        onClick={() => setOpen(!open)}
      >
        {open ? 'Hide' : 'Preview'} weekly digest
      </button>
      {open && (
        <QueryState query={q}>
          {q.data && (
            <blockquote>
              <strong>Your week at {q.data.workspaceName}</strong>
              <p>
                {q.data.activeProjects} active projects. {q.data.submitted}/
                {q.data.required} required items submitted; {q.data.approved}/
                {q.data.required} approved.
              </p>
              <p>
                {q.data.clientAction} required items need client action. Items
                awaiting agency review are excluded from client reminders.
              </p>
              <small>Preview only. No email is sent.</small>
            </blockquote>
          )}
        </QueryState>
      )}
    </div>
  )
}

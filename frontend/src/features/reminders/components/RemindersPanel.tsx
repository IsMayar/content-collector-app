import { Bell, CalendarDays, Eye, Plus, Send } from 'lucide-react'
import type { ProjectContact } from '@/features/projects/types/project.types'
import { DeliveryHistory } from '@/features/reminders/components/DeliveryHistory'
import type {
  DeliverySummary,
  ReminderPolicy,
  ReminderPreview,
  ReminderRule,
} from '@/features/reminders/types/reminder.types'
import { useData } from '@/services/api/resourceApi'
import { CardHeader, StatusBadge } from '@/shared/components/AccessUI'
import { Notice } from '@/shared/components/Feedback'
import { Modal } from '@/shared/components/Modal'
import { ErrorNotice, Field, QueryState } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useRef, useState } from 'react'
import './EmailReminders.css'

export function RemindersPanel({ root }: { root: string }) {
  const query = useData<{ policy: ReminderPolicy }>(`${root}/reminder-policy`)
  const policy = query.data?.policy
  const deliveries = useData<{ data: DeliverySummary[] }>(`${root}/deliveries?size=100`)
  const contacts = useData<{ data: ProjectContact[] }>(`${root}/contacts`)
  const command = useCommand()
  const previewCommand = useCommand()
  const [extraRules, setExtraRules] = useState<ReminderRule[]>([])
  const [message, setMessage] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [preview, setPreview] = useState<ReminderPreview>()
  const [contact, setContact] = useState('')
  const sendKey = useRef('')
  const busy = useRef(false)
  const rules = [...(policy?.rules.filter((r) => r.channel === 'EMAIL') ?? []), ...extraRules]
  const next = deliveries.data?.data
    .filter((d) => d.channel === 'EMAIL' && d.state === 'QUEUED' && Date.parse(d.dueAt) > Date.now())
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0]
  const mode = !policy?.enabled ? 'Disabled' : policy.paused ? 'Paused' : 'Enabled'

  return (
    <QueryState query={query}>
      {policy && (
        <div className="email-reminders-page">
          <form
            key={policy.version}
            className="email-reminders-form"
            onSubmit={async (event) => {
              event.preventDefault()
              if (command.pending || busy.current) return
              busy.current = true
              const values = new FormData(event.currentTarget)
              const state = String(values.get('mode'))
              try {
                if (await command.run(`${root}/reminder-policy`, {
                  rules: rules.flatMap((r, i) => values.has(`enabled${i}`) ? [{
                    ...r,
                    channel: 'EMAIL',
                    daysRelativeToDueDate: Number(values.get(`days${i}`)),
                    localTime: String(values.get(`time${i}`)),
                    weekdaysOnly: values.has(`weekdays${i}`),
                  }] : []),
                  timezone: values.get('timezone'),
                  enabled: state !== 'disabled',
                  paused: state === 'paused',
                  expectedVersion: policy.version,
                }, 'PUT')) {
                  setExtraRules([])
                  setMessage('Reminder settings saved.')
                  void query.refetch()
                  void deliveries.refetch()
                }
              } finally {
                busy.current = false
              }
            }}
          >
            <section className="project-view-card">
              <CardHeader
                icon={Bell}
                title="Email reminders"
                action={<StatusBadge tone={mode === 'Enabled' ? 'success' : 'neutral'}>{mode}</StatusBadge>}
              />
              <div className="project-view-body">
                <div className="email-reminder-settings">
                  <Field label="Reminders">
                    <select name="mode" defaultValue={mode.toLowerCase()}>
                      <option value="enabled">Enabled</option>
                      <option value="paused">Paused</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </Field>
                  <Field label="Delivery timezone">
                    <input name="timezone" required defaultValue={policy.timezone} />
                  </Field>
                  <div className="email-next-reminder">
                    <strong>Next reminder</strong>
                    <QueryState query={deliveries}>
                      <span>{next ? new Date(next.dueAt).toLocaleString() : 'No upcoming email in recent history'}</span>
                    </QueryState>
                  </div>
                </div>
                <p className="subtle">Reminders are sent only when required client action remains.</p>
              </div>
            </section>
            <section className="project-view-card">
              <CardHeader icon={CalendarDays} title="Reminder schedule" action={
                <button type="button" className="au-btn au-btn--secondary"
                  disabled={command.pending || rules.length >= 5}
                  onClick={() => setExtraRules((old) => [...old, {
                    id: crypto.randomUUID(), channel: 'EMAIL',
                    daysRelativeToDueDate: 7, localTime: '10:00', weekdaysOnly: true,
                  }])}>
                  <Plus size={16} aria-hidden="true" /> Add reminder
                </button>
              } />
              <div className="project-view-body">
                {rules.length === 0 && <p className="subtle">No reminders scheduled. Add a reminder to get started.</p>}
                <div className="email-schedule-list">
                  {rules.map((r, i) => (
                    <article key={r.id} className="email-schedule-row">
                      <div className="email-rule-title">
                        <strong>Reminder {i + 1}</strong>
                        <label className="check-row"><input type="checkbox" name={`enabled${i}`} defaultChecked /> Include reminder</label>
                      </div>
                      <Field label="Days from due date">
                        <input type="number" name={`days${i}`} min={-30} max={90} required defaultValue={r.daysRelativeToDueDate} />
                      </Field>
                      <Field label="Time">
                        <input type="time" name={`time${i}`} required defaultValue={r.localTime} />
                      </Field>
                      <label className="check-row"><input type="checkbox" name={`weekdays${i}`} defaultChecked={r.weekdaysOnly} /> Weekdays only</label>
                    </article>
                  ))}
                </div>
                <p className="subtle">Negative days are before the due date; zero is the due date. Uncheck a reminder to remove it when saving.</p>
                <ErrorNotice error={command.error} />
                <div className="email-reminder-actions">
                  <button type="submit" className="au-btn au-btn--primary" disabled={command.pending}>{command.pending ? 'Saving…' : 'Save changes'}</button>
                </div>
                {message && <Notice>{message}</Notice>}
              </div>
            </section>
          </form>
          <DeliveryHistory root={root} action={
            <button type="button" className="au-btn au-btn--secondary" onClick={() => {
              setPreview(undefined)
              setContact('')
              previewCommand.clear()
              setPreviewOpen(true)
            }}><Eye size={16} aria-hidden="true" /> Preview email</button>
          } />
          {previewOpen && (
            <Modal title="Preview email" className="email-preview-modal" pending={previewCommand.pending} onClose={() => setPreviewOpen(false)}>
              <QueryState query={contacts}>
                <Field label="Client contact">
                  <select value={contact} disabled={previewCommand.pending} onChange={(e) => {
                    setContact(e.target.value)
                    setPreview(undefined)
                    sendKey.current = ''
                  }}>
                    <option value="">Choose contact</option>
                    {contacts.data?.data.filter((c) => c.state === 'ACTIVE').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              </QueryState>
              <div className="email-preview-content">
                {preview ? <>
                  <strong>{preview.subject || 'Email reminder'}</strong>
                  <p>{preview.body}</p>
                  <StatusBadge tone={preview.eligible ? 'success' : 'warning'}>{preview.eligible ? 'Eligible to send' : 'Unavailable'}</StatusBadge>
                  {preview.reasons.length > 0 && <p>{preview.reasons.join(', ')}</p>}
                </> : <p className="subtle">Choose a contact and preview the actual reminder.</p>}
              </div>
              <p className="subtle">Delivery limits apply. Do not retry an unknown delivery outcome.</p>
              <ErrorNotice error={previewCommand.error} />
              <div className="email-reminder-actions">
                <button type="button" className="au-btn au-btn--secondary" disabled={!contact || previewCommand.pending}
                  onClick={async () => {
                    setPreview(undefined)
                    const result = await previewCommand.run<{ preview: ReminderPreview }>(`${root}/reminders/preview`, {contactId: contact, channel: 'EMAIL'})
                    setPreview(result?.preview)
                    sendKey.current = crypto.randomUUID()
                  }}>Preview</button>
                <button type="button" className="au-btn au-btn--primary" disabled={!preview?.eligible || previewCommand.pending}
                  onClick={async () => {
                    if (!preview?.eligible || busy.current) return
                    busy.current = true
                    try {
                      if (await previewCommand.run(`${root}/reminders/send`, {contactId: contact, channel: 'EMAIL'}, 'POST', {'Idempotency-Key': sendKey.current})) {
                        setPreviewOpen(false)
                        setMessage('Email reminder queued.')
                        void deliveries.refetch()
                      }
                    } finally { busy.current = false }
                  }}><Send size={16} aria-hidden="true" /> Send now</button>
              </div>
            </Modal>
          )}
        </div>
      )}
    </QueryState>
  )
}

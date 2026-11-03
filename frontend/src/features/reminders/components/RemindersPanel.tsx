import type { ProjectContact } from '@/features/projects/types/project.types'
import { DeliveryHistory } from '@/features/reminders/components/DeliveryHistory'
import type {
  ReminderPolicy,
  ReminderPreview,
  ReminderRule,
} from '@/features/reminders/types/reminder.types'
import { useData } from '@/services/api/resourceApi'
import { Notice } from '@/shared/components/Feedback'
import { Badge, ErrorNotice, Field, Panel } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useState } from 'react'

export function RemindersPanel({ root }: { root: string }) {
  const query = useData<{ policy: ReminderPolicy }>(`${root}/reminder-policy`)
  const q = { ...query, data: query.data?.policy }
  const [extraRules, setExtraRules] = useState<ReminderRule[]>([])
  const contacts = useData<{ data: ProjectContact[] }>(`${root}/contacts`)
  const command = useCommand()
  const [preview, setPreview] = useState<ReminderPreview>()
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState('policy')
  const [channel, setChannel] = useState('EMAIL')
  const [contact, setContact] = useState('')
  return (
    <div className="reminders-page">
      <nav className="reference-tabs" aria-label="Reminder views">
        {[
          ['policy', 'Reminder policy'],
          ['cadence', 'Cadence'],
          ['preview', 'Email & SMS preview'],
          ['activity', 'Delivery activity'],
          ['issues', 'Status & issues'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div hidden={!['policy', 'cadence'].includes(tab)}>
        <Panel
          title={tab === 'cadence' ? 'Reminder cadence' : 'Reminder policy'}
        >
          <p>
            Remind only when required client action remains. Items awaiting
            agency review are excluded.
          </p>
          {q.data && (
            <form
              className="stack-form"
              key={q.data.version}
              onSubmit={async (e) => {
                e.preventDefault()
                const v = new FormData(e.currentTarget)
                const rules = [...q.data!.rules, ...extraRules]
                  .filter((_, i) => v.has(`enabled${i}`))
                  .map((r) => {
                    const i = [...q.data!.rules, ...extraRules].findIndex(
                      (rule) => rule.id === r.id,
                    )
                    return {
                      ...r,
                      channel: String(v.get(`channel${i}`)) as 'EMAIL' | 'SMS',
                      daysRelativeToDueDate: Number(v.get(`days${i}`)),
                      localTime: String(v.get(`time${i}`)),
                      weekdaysOnly: v.has(`weekdays${i}`),
                    }
                  })
                if (
                  await command.run(
                    `${root}/reminder-policy`,
                    {
                      rules,
                      timezone: v.get('timezone'),
                      enabled: v.has('enabled'),
                      paused: v.has('paused'),
                      expectedVersion: q.data!.version,
                    },
                    'PUT',
                  )
                ) {
                  setMessage('Reminder policy saved.')
                  setExtraRules([])
                }
              }}
            >
              <div className="actions">
                <label className="check-row">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={q.data.enabled}
                  />
                  Enabled
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    name="paused"
                    defaultChecked={q.data.paused}
                  />
                  Pause reminders
                </label>
              </div>
              <Field label="Delivery timezone">
                <input
                  name="timezone"
                  required
                  defaultValue={q.data.timezone}
                />
              </Field>
              {tab === 'policy' && (
                <section className="policy-channels">
                  <h3>Reminder channels</h3>
                  {['EMAIL', 'SMS'].map((c) => (
                    <article key={c}>
                      <span className="channel-symbol" aria-hidden="true">
                        {c === 'EMAIL' ? 'âœ‰' : 'â–¤'}
                      </span>
                      <div>
                        <h3>{c === 'EMAIL' ? 'Email' : 'SMS'}</h3>
                        <p>
                          {c === 'EMAIL'
                            ? 'Send reminders to active project contacts.'
                            : 'Only verified US numbers with client consent are eligible.'}
                        </p>
                        <small>
                          {q.data!.rules.filter((r) => r.channel === c).length}{' '}
                          cadence steps configured
                        </small>
                      </div>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setTab('cadence')}
                      >
                        Settings
                      </button>
                    </article>
                  ))}
                  <div className="reference-info">
                    Reminders stop automatically when there are no remaining
                    client actions and only agency review is left.
                  </div>
                </section>
              )}
              <div hidden={tab !== 'cadence'} className="cadence-list">
                {[...q.data.rules, ...extraRules].map((r, i) => (
                  <article className="cadence-card" key={r.id}>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        name={`enabled${i}`}
                        defaultChecked
                      />{' '}
                      Enable rule
                    </label>
                    <div className="cadence-title">
                      <span>{i + 1}</span>
                      <h3>
                        {r.daysRelativeToDueDate === 0
                          ? 'On deadline date'
                          : `${Math.abs(r.daysRelativeToDueDate)} days ${r.daysRelativeToDueDate < 0 ? 'before' : 'after'} deadline`}
                      </h3>
                      <Badge>
                        {q.data!.paused
                          ? 'PAUSED'
                          : q.data!.enabled
                            ? 'ACTIVE'
                            : 'DISABLED'}
                      </Badge>
                    </div>
                    <div className="form-grid">
                      <Field label="Reminder channel">
                        <select name={`channel${i}`} defaultValue={r.channel}>
                          <option>EMAIL</option>
                          <option>SMS</option>
                        </select>
                      </Field>
                      <Field label="Days relative to due date">
                        <input
                          type="number"
                          name={`days${i}`}
                          min={-30}
                          max={90}
                          defaultValue={r.daysRelativeToDueDate}
                        />
                      </Field>
                      <Field label="Local delivery time">
                        <input
                          type="time"
                          name={`time${i}`}
                          defaultValue={r.localTime}
                        />
                      </Field>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          name={`weekdays${i}`}
                          defaultChecked={r.weekdaysOnly}
                        />
                        Weekdays only · {r.channel}
                      </label>
                    </div>
                    <div className="reference-info">
                      All times use the configured timezone. Delivery is subject
                      to client consent, quiet hours and remaining client
                      action.
                    </div>
                  </article>
                ))}
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={q.data.rules.length + extraRules.length >= 5}
                onClick={() =>
                  setExtraRules([
                    ...extraRules,
                    {
                      id: crypto.randomUUID(),
                      channel: 'EMAIL',
                      daysRelativeToDueDate: 7,
                      localTime: '10:00',
                      weekdaysOnly: true,
                    },
                  ])
                }
              >
                Add email reminder
              </button>
              <button className="primary-button" disabled={command.pending}>
                Save policy
              </button>
            </form>
          )}
        </Panel>
      </div>
      <div hidden={tab !== 'preview'}>
        <Panel title="Email reminder preview">
          <div className="reminder-preview-layout">
            <div>
              <div className="form-grid">
                <Field label="Contact">
                  <select
                    value={contact}
                    onChange={(e) => {
                      setContact(e.target.value)
                      setPreview(undefined)
                    }}
                  >
                    <option value="">Choose contact</option>
                    {contacts.data?.data
                      .filter((c) => c.state === 'ACTIVE')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Channel">
                  <select
                    value={channel}
                    onChange={(e) => {
                      setChannel(e.target.value)
                      setPreview(undefined)
                    }}
                  >
                    <option>EMAIL</option>
                    <option>SMS</option>
                  </select>
                </Field>
              </div>
              <p className="subtle">
                SMS requires the client’s verified US number and explicit
                consent. Owners cannot opt clients in.
              </p>
              <div className="actions">
                <button
                  className="secondary-button"
                  disabled={!contact || command.pending}
                  onClick={async () =>
                    setPreview(
                      (
                        await command.run<{ preview: ReminderPreview }>(
                          `${root}/reminders/preview`,
                          { contactId: contact, channel },
                        )
                      )?.preview,
                    )
                  }
                >
                  Preview
                </button>
                <button
                  className="secondary-button"
                  disabled={!preview?.eligible || command.pending}
                  onClick={async () => {
                    if (
                      await command.run(`${root}/reminders/send`, {
                        contactId: contact,
                        channel,
                      })
                    )
                      setMessage(
                        'Reminder queued. Provider acceptance and delivery are shown separately in delivery activity.',
                      )
                  }}
                >
                  Send now
                </button>
              </div>
            </div>
            <div className="reminder-email-card">
              <h3>Preview</h3>
              {preview && (
                <blockquote>
                  <strong>{preview.subject || 'SMS preview'}</strong>
                  <p>{preview.body}</p>
                  <Badge>{preview.eligible ? 'ELIGIBLE' : 'SUPPRESSED'}</Badge>
                  <p>{preview.reasons.join(' ')}</p>
                  {preview.estimatedSegments !== null && (
                    <p>
                      Estimated SMS segments: {preview.estimatedSegments}. Your
                      workspace allowance and spending cap apply.
                    </p>
                  )}
                </blockquote>
              )}
              {!preview && (
                <p className="subtle">
                  Select a client and generate a preview to see the message and
                  eligibility.
                </p>
              )}
            </div>
          </div>

          <p className="subtle">
            Limits: one delivery per recipient/channel/day, five per week.
            Unknown provider outcomes must be reconciled before retrying.
          </p>
        </Panel>
      </div>
      {tab === 'activity' && <DeliveryHistory root={root} />}
      {tab === 'issues' && (
        <Panel title="Reminder status and issues">
          <p>Reasons reminders may be paused or suppressed.</p>
          <div className="reminder-issues">
            {[
              [
                'Client opted out of SMS',
                'Only the client can opt in again through their notification preferences.',
              ],
              [
                'Unverified phone number',
                'The client must verify their US number before SMS reminders can start.',
              ],
              [
                'SMS allowance exhausted',
                'Review usage in Billing. Permitted email reminders can continue.',
              ],
              [
                'Project paused or archived',
                'Resume or restore the project before scheduling new reminders.',
              ],
              [
                'Waiting for agency review',
                'Reminders stop when no required client action remains.',
              ],
              [
                'Unknown provider outcome',
                'Wait for reconciliation before retrying to avoid duplicate messages.',
              ],
            ].map(([title, copy]) => (
              <article key={title}>
                <span className="issue-icon">!</span>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </article>
            ))}
          </div>
        </Panel>
      )}
      <ErrorNotice error={command.error} />
      {message && <Notice>{message}</Notice>}
    </div>
  )
}

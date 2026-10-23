import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useData } from '@/api/productApi'
import type {
  ProjectAnalytics,
  SessionSummary,
  Subscription,
  UsageSummary,
  WorkspaceDetail,
} from '@/api/productTypes'
import {
  Badge,
  Empty,
  ErrorNotice,
  Field,
  Heading,
  Panel,
  QueryState,
  useCommand,
  useWorkspace,
} from '@/components/ProductUI'
import { ConfirmDialog, Notice } from '@/components/Feedback'
import { formatBytes, percent } from '@/lib/domain'
import { apiBaseUrl } from '@/api/baseQuery'
import { OwnershipPanel } from './OwnershipPanel'
import { DigestPreview } from './ReportingExtras'

export { TeamPage } from './TeamPage'
export function SettingsPage() {
  const { id, owner } = useWorkspace()
  const q = useData<WorkspaceDetail & { logo: string; digestEnabled: boolean }>(
    `workspaces/${id}/settings`,
    { skip: !owner },
  )
  const sessions = useData<{ data: SessionSummary[] }>('me/sessions')
  const command = useCommand()
  const [message, setMessage] = useState('')
  const [logo, setLogo] = useState('')
  const [deletion, setDeletion] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  if (!owner)
    return (
      <Empty
        title="Owner access required"
        description="Your owner manages workspace settings."
      />
    )
  return (
    <>
      <Heading
        title="Workspace settings"
        description="The details that make this space yours."
      />
      <OwnershipPanel />
      <Panel title="Identity and preferences">
        <QueryState query={q}>
          {q.data && (
            <form
              className="stack-form"
              key={q.data.workspace.version}
              onSubmit={async (e) => {
                e.preventDefault()
                const v = new FormData(e.currentTarget)
                if (
                  await command.run(
                    `workspaces/${id}`,
                    {
                      name: v.get('name'),
                      timezone: v.get('timezone'),
                      digestEnabled: v.has('digest'),
                      logo: logo || q.data!.logo,
                      expectedVersion: q.data!.workspace.version,
                    },
                    'PATCH',
                  )
                )
                  setMessage('Workspace preferences saved.')
              }}
            >
              <div className="form-grid">
                <Field label="Workspace name">
                  <input
                    name="name"
                    required
                    defaultValue={q.data.workspace.name}
                  />
                </Field>
                <Field label="Default timezone">
                  <input
                    name="timezone"
                    required
                    defaultValue={q.data.workspace.timezone}
                  />
                </Field>
              </div>
              <Field label="Workspace logo (PNG/JPEG/WebP, 1 MB)">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    if (
                      file.size > 1e6 ||
                      !['image/png', 'image/jpeg', 'image/webp'].includes(
                        file.type,
                      )
                    ) {
                      setMessage('Choose a PNG, JPEG or WebP under 1 MB.')
                      return
                    }
                    const reader = new FileReader()
                    reader.onload = () => setLogo(String(reader.result))
                    reader.readAsDataURL(file)
                  }}
                />
              </Field>
              {(logo || q.data.logo) && (
                <img
                  className="workspace-logo"
                  src={logo || q.data.logo}
                  alt="Workspace logo preview"
                />
              )}
              <label className="check-row">
                <input
                  type="checkbox"
                  name="digest"
                  defaultChecked={q.data.digestEnabled}
                />
                Receive the owner’s weekly progress digest
              </label>
              <button className="primary-button" disabled={command.pending}>
                Save workspace
              </button>
            </form>
          )}
          <DigestPreview workspaceId={id} />
        </QueryState>
      </Panel>
      <Panel title="Account sessions">
        <p className="subtle">
          Revoke other sessions when a device is no longer yours.
        </p>
        {sessions.data?.data.map((s) => (
          <div className="access-row" key={s.id}>
            <div className="grow">
              <strong>{s.label}</strong>
              <p>Last active {new Date(s.lastSeenAt).toLocaleString()}</p>
            </div>
            {s.current ? (
              <Badge>CURRENT</Badge>
            ) : (
              <button
                className="secondary-button"
                onClick={async () => {
                  if (
                    await command.run(
                      `me/sessions/${s.id}`,
                      undefined,
                      'DELETE',
                    )
                  )
                    setMessage('Other session revoked.')
                }}
              >
                Revoke session
              </button>
            )}
          </div>
        ))}
      </Panel>
      <Panel title="Delete workspace">
        <p>
          Schedule deletion after a 30-day recovery period. Access becomes
          read-only immediately. Export approved content before proceeding.
        </p>
        <button className="danger-link" onClick={() => setDeletion(true)}>
          Request workspace deletion
        </button>
      </Panel>
      <ErrorNotice error={command.error} />
      {message && <Notice>{message}</Notice>}
      <ConfirmDialog
        open={deletion}
        pending={command.pending}
        title="Schedule workspace deletion?"
        description={
          <>
            <Field label="Current password">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Type the workspace name">
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </Field>
            <ErrorNotice error={command.error} />
          </>
        }
        confirmLabel="Schedule deletion"
        onCancel={() => {
          setDeletion(false)
          setPassword('')
        }}
        onConfirm={() =>
          void (async () => {
            const result = await command.run<{ deleteAfter: string }>(
              `workspaces/${id}/deletion-request`,
              { currentPassword: password, confirmation },
            )
            if (result) {
              setMessage(
                `Deletion scheduled for ${new Date(result.deleteAfter).toLocaleDateString()}.`,
              )
              setDeletion(false)
              setPassword('')
            }
          })()
        }
      />
    </>
  )
}
export function BillingPage() {
  const navigate = useNavigate()
  function hosted(url: string) {
    const target = new URL(url, window.location.origin)
    if (!['http:', 'https:'].includes(target.protocol)) return
    if (target.origin === window.location.origin)
      navigate(target.pathname + target.search)
    else window.location.assign(target.href)
  }
  const { id, owner } = useWorkspace()
  const [params] = useSearchParams()
  const q = useData<Subscription>(`workspaces/${id}/subscription`, {
    skip: !owner,
  })
  const usage = useData<UsageSummary>(`workspaces/${id}/usage`, {
    skip: !owner,
  })
  const command = useCommand()
  if (!owner)
    return (
      <Empty
        title="Owner access required"
        description="Billing is managed by your workspace owner."
      />
    )
  return (
    <>
      <Heading
        title="Room to do your best work"
        description="Clear limits. A plan that fits how you work."
      />
      {params.get('hosted') === 'demo' && (
        <Notice>
          Mock hosted billing return. No payment was collected and no
          subscription was changed.
        </Notice>
      )}
      <Panel title="Your subscription">
        {q.data && (
          <>
            <div className="actions">
              <h3>{q.data.planKey}</h3>
              <Badge>{q.data.state}</Badge>
            </div>
            <p>
              Current period ends{' '}
              {new Date(q.data.currentPeriodEnd).toLocaleDateString()}
            </p>
            <p className="subtle">
              14-day trial. A past-due account has 7 days of grace, followed by
              30 days of read-only access. Reading and permitted exports remain
              available.
            </p>
          </>
        )}
        {usage.data && (
          <div className="usage-grid">
            {[
              [
                'Storage',
                usage.data.storageUsedBytes + usage.data.storageReservedBytes,
                usage.data.storageLimitBytes,
                `${formatBytes(usage.data.storageUsedBytes)} used + ${formatBytes(usage.data.storageReservedBytes)} reserved`,
              ],
              [
                'AI drafts',
                usage.data.aiDraftsUsed,
                usage.data.aiDraftAllowance,
                `${usage.data.aiDraftsUsed} used`,
              ],
              [
                'SMS segments',
                usage.data.smsSegmentsUsed,
                usage.data.smsSegmentAllowance,
                `${usage.data.smsSegmentsUsed} used`,
              ],
              [
                'Seats',
                usage.data.seatsUsed + usage.data.seatsReserved,
                usage.data.seatsLimit,
                `${usage.data.seatsUsed} active + ${usage.data.seatsReserved} reserved`,
              ],
            ].map(([label, count, total, description]) => (
              <div key={label}>
                <strong>{label}</strong>
                <progress
                  value={Number(count)}
                  max={Number(total)}
                  aria-label={`${label} usage`}
                />
                <p>
                  {description} · {percent(Number(count), Number(total))}%
                </p>
              </div>
            ))}
          </div>
        )}
        <button
          className="secondary-button"
          disabled={command.pending}
          onClick={async () => {
            const result = await command.run<{ url: string }>(
              `workspaces/${id}/billing/portal`,
              {},
            )
            if (result) hosted(result.url)
          }}
        >
          Manage in hosted billing portal
        </button>
      </Panel>
      <div className="pricing-grid">
        {[
          ['SOLO', '19', '1 seat', '100 AI drafts', '25 SMS segments'],
          ['AGENCY', '49', '5 seats', '300 AI drafts', '100 SMS segments'],
        ].map(([plan, price, seats, ai, sms]) => (
          <Panel key={plan} title={plan}>
            <p className="price">
              ${price}
              <small>/ month</small>
            </p>
            <p>Proposed pricing · 50 GB storage</p>
            <ul>
              <li>{seats}</li>
              <li>{ai} per month</li>
              <li>{sms} per month</li>
              <li>Unlimited active projects within resource limits</li>
            </ul>
            <button
              className="primary-button"
              disabled={command.pending}
              onClick={async () => {
                const result = await command.run<{ url: string }>(
                  `workspaces/${id}/billing/checkout`,
                  { planKey: plan },
                )
                if (result) hosted(result.url)
              }}
            >
              Choose {plan.toLowerCase()}
            </button>
          </Panel>
        ))}
      </div>
      <ErrorNotice error={command.error} />
    </>
  )
}
export function AnalyticsPanel({ root }: { root: string }) {
  const q = useData<ProjectAnalytics>(`${root}/analytics`)
  const command = useCommand()
  const [share, setShare] = useState<{ shareId: string; url: string }>()
  return (
    <>
      <Panel title="A clearer view of progress">
        <p>
          Friction means a start without submission after a completed 7-day
          observation window. It does not mean abandonment. At least 10 eligible
          starts and 10 completed windows are required.
        </p>
        <QueryState query={q}>
          <div className="table-scroll">
            <table>
              <caption>
                Item collection friction · synthetic observations in demo mode
              </caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Eligible starts</th>
                  <th scope="col">Completed windows</th>
                  <th scope="col">Without submission</th>
                  <th scope="col">Rate</th>
                  <th scope="col">Open windows</th>
                  <th scope="col">Median first submission</th>
                </tr>
              </thead>
              <tbody>
                {q.data?.friction.map((m, i) => (
                  <tr key={`${m.itemKey}-${i}`}>
                    <th scope="row">{m.itemKey}</th>
                    <td>{m.eligibleStarts}</td>
                    <td>{m.completedObservationWindows}</td>
                    <td>{m.startsWithoutSubmission}</td>
                    <td>
                      {m.insufficientData
                        ? 'Insufficient data'
                        : `${Math.round((m.rate || 0) * 100)}%`}
                    </td>
                    <td>
                      {m.eligibleStarts - m.completedObservationWindows} still
                      observing
                    </td>
                    <td>
                      {m.medianFirstSubmissionSeconds === null
                        ? 'Insufficient data'
                        : `${Math.round(m.medianFirstSubmissionSeconds / 60)} min (${m.completedSubmissions} submissions)`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryState>
      </Panel>
      <Panel title="Share the big picture">
        <p>
          Share counts only: no answers, contact details, files, internal notes
          or workspace identity. Use a public-safe alias.
        </p>
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault()
            const v = new FormData(e.currentTarget)
            const result = await command.run<{ shareId: string; url: string }>(
              `${root}/status-shares`,
              {
                alias: v.get('alias'),
                expiresAt: new Date(String(v.get('expires'))).toISOString(),
                allowedOrigins: String(v.get('origins') || '')
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
            )
            if (result) setShare(result)
          }}
        >
          <Field label="Public alias">
            <input
              required
              name="alias"
              maxLength={80}
              placeholder="Project Evergreen"
            />
          </Field>
          <Field label="Share expiry">
            <input
              required
              type="date"
              name="expires"
              defaultValue={new Date(Date.now() + 7 * 864e5)
                .toISOString()
                .slice(0, 10)}
            />
          </Field>
          <Field label="Allowed embed origins (one HTTPS origin per line)">
            <textarea name="origins" placeholder="https://example.com" />
          </Field>
          <button className="secondary-button" disabled={command.pending}>
            Create counts-only share
          </button>
        </form>
        {share && (
          <div className="inset">
            <Link to={share.url}>Open private status link</Link>
            <pre className="code-wrap">{`<iframe title="Project status" src="${window.location.origin}${share.url}" loading="lazy"></iframe>`}</pre>
            <button
              className="danger-link"
              onClick={async () => {
                if (
                  await command.run(
                    `${root}/status-shares/${share.shareId}`,
                    undefined,
                    'DELETE',
                  )
                )
                  setShare(undefined)
              }}
            >
              Revoke share
            </button>
          </div>
        )}
        <ErrorNotice error={command.error} />
      </Panel>
    </>
  )
}
export function InsightsPage() {
  const { id } = useWorkspace()
  const q = useData<{ data: { id: string; title: string }[] }>(
    `workspaces/${id}/projects?size=100`,
  )
  const [project, setProject] = useState('')
  return (
    <>
      <Heading
        title="Insights"
        description="Understand progress without guessing what’s behind it."
      />
      <Panel>
        <Field label="Project">
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">Choose a project</option>
            {q.data?.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </Field>
      </Panel>
      {project && (
        <AnalyticsPanel root={`workspaces/${id}/projects/${project}`} />
      )}
    </>
  )
}
export function StatusSharePage() {
  const { shareId } = useParams()
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('token') || '',
  )
  const [readToken, setReadToken] = useState('')
  const [error, setError] = useState('')
  const [data, setData] = useState<{
    alias: string
    state: string
    progress: import('@/api/contracts').Progress
  }>()
  const command = useCommand(true)
  return (
    <div className="narrow-product">
      <Heading
        eyebrow="COUNTS-ONLY PROJECT STATUS"
        title={data?.alias || 'A shared view of progress'}
        description="A small window into how the project is moving."
      />
      {!readToken ? (
        <button
          className="primary-button"
          onClick={async () => {
            const result = await command.run<{ readToken: string }>(
              `status-shares/${shareId}/exchange`,
              { token },
            )
            if (result) {
              history.replaceState(null, '', window.location.pathname)
              setReadToken(result.readToken)
              try {
                const base = new URL(
                  apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`,
                  window.location.origin,
                )
                const response = await fetch(
                  new URL(`status-shares/${shareId}/counts`, base),
                  {
                    headers: { 'X-Status-Token': result.readToken },
                    cache: 'no-store',
                  },
                )
                if (!response.ok) throw Error('This share is unavailable.')
                setData(await response.json())
              } catch (e) {
                setError(String(e))
              }
            }
          }}
        >
          View shared status
        </button>
      ) : null}
      <ErrorNotice error={command.error || error} />
      {data && (
        <Panel>
          <Badge>{data.state}</Badge>
          <div className="dual-progress">
            {[
              ['Submitted', data.progress.submittedRequired],
              ['Approved', data.progress.approvedRequired],
            ].map(([label, count]) => (
              <div key={label}>
                <strong>
                  {label}: {count}/{data.progress.requiredTotal}
                </strong>
                <progress
                  value={Number(count)}
                  max={data.progress.requiredTotal || 1}
                  aria-label={String(label)}
                />
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

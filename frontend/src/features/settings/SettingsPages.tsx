import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useData } from '@/api/productApi'
import type {
  ProjectAnalytics,
  Project,
  Paged,
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
import { AccountPanel, SettingsNav } from './AccountPanel'
import { DigestPreview } from './ReportingExtras'

export { TeamPage } from './TeamPage'
export function SettingsPage() {
  const { id, owner, base, user } = useWorkspace()
  const [search, setSearch] = useSearchParams()
  const requestedView = search.get('view') || 'workspace'
  const tab = ['workspace', 'account', 'privacy', 'team', 'digest'].includes(
    requestedView,
  )
    ? requestedView
    : 'workspace'
  const q = useData<WorkspaceDetail & { logo: string; digestEnabled: boolean }>(
    `workspaces/${id}/settings`,
    { skip: !owner },
  )
  const sessions = useData<{ data: SessionSummary[] }>('me/sessions')
  const command = useCommand()
  const [message, setMessage] = useState('')
  const [logo, setLogo] = useState<string | null>(null)
  const [deletion, setDeletion] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  if (!owner && tab !== 'account')
    return (
      <Empty
        title="Owner access required"
        description="Your owner manages workspace settings."
      />
    )
  return (
    <>
      <Heading
        title={
          tab === 'digest'
            ? 'Daily digest'
            : tab === 'account'
              ? 'My account'
              : tab === 'privacy'
                ? 'Data & privacy'
                : tab === 'team'
                  ? 'Workspace ownership'
                  : 'Workspace settings'
        }
        description="The details that make this space yours."
      />
      <SettingsNav active={tab} />
      <div className="settings-layout">
        <nav
          hidden={!owner}
          className="settings-subnav"
          aria-label="Workspace settings sections"
        >
          {[
            ['workspace', 'General'],
            ['team', 'Team settings'],
            ['privacy', 'Danger zone'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? 'active' : ''}
              onClick={() => setSearch({ view: key })}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {tab === 'account' && <AccountPanel />}
          {tab === 'digest' && <DigestPreview workspaceId={id} />}
          {tab === 'team' && (
            <>
              <OwnershipPanel />
              <Link className="secondary-button" to={`${base}/team`}>
                Manage team settings
              </Link>
            </>
          )}
          {tab === 'workspace' && (
            <>
              <div className="workspace-identity">
                <Panel title="General">
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
                                logo: logo ?? q.data!.logo,
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
                                ![
                                  'image/png',
                                  'image/jpeg',
                                  'image/webp',
                                ].includes(file.type)
                              ) {
                                setMessage(
                                  'Choose a PNG, JPEG or WebP under 1 MB.',
                                )
                                return
                              }
                              const reader = new FileReader()
                              reader.onload = () =>
                                setLogo(String(reader.result))
                              reader.readAsDataURL(file)
                            }}
                          />
                        </Field>
                        {(logo ?? q.data.logo) && (
                          <img
                            className="workspace-logo"
                            src={logo ?? q.data.logo}
                            alt="Workspace logo preview"
                          />
                        )}
                        <button
                          type="button"
                          className="danger-link"
                          onClick={() => setLogo('')}
                        >
                          Remove logo
                        </button>
                        <label className="check-row">
                          <input
                            type="checkbox"
                            name="digest"
                            defaultChecked={q.data.digestEnabled}
                          />
                          Receive the owner’s daily progress digest
                        </label>
                        <button
                          className="primary-button"
                          disabled={command.pending}
                        >
                          Save workspace
                        </button>
                      </form>
                    )}

                    <div className="workspace-owner">
                      <span className="profile-avatar" aria-hidden="true">
                        {user?.displayName.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <strong>{user?.displayName}</strong>
                        <p>{user?.email}</p>
                      </div>
                      <Badge>OWNER</Badge>
                    </div>
                    <Link className="reference-info" to={`${base}/team`}>
                      Manage team settings
                    </Link>
                  </QueryState>
                </Panel>
              </div>
            </>
          )}
          {tab === 'account' && (
            <Panel title="Active sessions">
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
          )}
          {tab === 'privacy' && (
            <Panel title="Archive or delete workspace">
              <p>
                Schedule deletion after a 30-day recovery period. Access becomes
                read-only immediately. Export approved content before
                proceeding.
              </p>
              <button className="danger-link" onClick={() => setDeletion(true)}>
                Request workspace deletion
              </button>
            </Panel>
          )}
        </div>
      </div>
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
  const { id, owner, base } = useWorkspace()
  const [params] = useSearchParams()
  const requestedView = params.get('view') || 'billing'
  const view = ['billing', 'usage', 'status'].includes(requestedView)
    ? requestedView
    : 'billing'
  const q = useData<Subscription>(`workspaces/${id}/subscription`, {
    skip: !owner,
    pollingInterval: view === 'status' ? 10000 : undefined,
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
        title={
          view === 'usage'
            ? 'Usage'
            : view === 'status'
              ? 'Subscription status'
              : 'Billing'
        }
        description="Clear limits. A plan that fits how you work."
      />
      <SettingsNav active={view} />
      <Link className="subscription-status-link" to="?view=status">
        View subscription status
      </Link>
      {view === 'status' && (
        <Panel title="Subscription status">
          <div className="subscription-state">
            <Badge>{q.data?.state || 'LOADING'}</Badge>
            <p>
              {q.data?.state === 'PAST_DUE'
                ? 'Payment needs attention. Update your payment method to keep the workspace active.'
                : q.data?.state === 'READ_ONLY'
                  ? 'Your plan is read-only. You can still view and export permitted content.'
                  : 'Your latest subscription state is shown below. Hosted payment confirmation may take a moment.'}
            </p>
            <button
              className="secondary-button"
              onClick={() => void q.refetch()}
            >
              Refresh status
            </button>
          </div>
        </Panel>
      )}
      {params.get('hosted') === 'demo' && (
        <Notice>
          Mock hosted billing return. No payment was collected and no
          subscription was changed.
        </Notice>
      )}
      {view !== 'usage' && (
        <div className="billing-summary">
          <Panel title="Current plan">
            <h2>{q.data?.planKey === 'SOLO' ? 'Solo' : 'Agency'}</h2>
            <p className="price">
              ${q.data?.planKey === 'SOLO' ? '19' : '49'}
              <small>/ month</small>
            </p>
            <Badge>Proposed pilot pricing</Badge>
            <p>
              For{' '}
              {q.data?.planKey === 'SOLO'
                ? 'freelancers and solo creators'
                : 'small agencies and growing teams'}
              .
            </p>
            <ul>
              <li>{usage.data?.seatsLimit || 0} seats</li>
              <li>50 GB storage</li>
              <li>Unlimited active projects within resource limits</li>
            </ul>
            <Link className="secondary-button" to="/pricing">
              View pricing
            </Link>
          </Panel>
          <Panel title="Plan details">
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
                  14-day trial. A past-due account has 7 days of grace, followed
                  by 30 days of read-only access. Reading and permitted exports
                  remain available.
                </p>
              </>
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
        </div>
      )}
      {view === 'usage' && (
        <>
          <Panel title="Storage and resource usage">
            {' '}
            {usage.data && (
              <div className="usage-grid">
                {[
                  [
                    'Storage',
                    usage.data.storageUsedBytes +
                      usage.data.storageReservedBytes,
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
            <Notice>
              Limits apply to the current billing period. Existing content
              remains available when allowances are reached.
            </Notice>
          </Panel>
          <div className="actions">
            <Link className="secondary-button" to="?view=billing">
              Go to billing
            </Link>
            <Link className="secondary-button" to={`${base}/team`}>
              Manage team seats
            </Link>
          </div>
        </>
      )}
      {view !== 'usage' && (
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
      )}
      <ErrorNotice error={command.error} />
    </>
  )
}
export function AnalyticsPanel({ root }: { root: string }) {
  const q = useData<ProjectAnalytics>(`${root}/analytics`)
  const [tab, setTab] = useState('overview'),
    [filter, setFilter] = useState('')
  const [copied, setCopied] = useState('')
  const { owner } = useWorkspace()
  const command = useCommand()
  const [share, setShare] = useState<{ shareId: string; url: string }>()
  return (
    <QueryState query={q}>
      <div className="analytics-page">
        <nav className="reference-tabs" aria-label="Analytics views">
          {[
            ['overview', 'Overview'],
            ['friction', 'Item friction'],
            ...(owner ? [['share', 'Counts-only status share']] : []),
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
        {tab === 'overview' && (
          <>
            <div className="report-metrics">
              {[
                ['Items submitted', q.data?.progress.submittedRequired || 0],
                ['Items approved', q.data?.progress.approvedRequired || 0],
                ['Client action', q.data?.progress.clientActionRequired || 0],
                ['Required items', q.data?.progress.requiredTotal || 0],
              ].map(([label, value]) => (
                <article key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </div>
            <div className="analytics-overview">
              <Panel title="Submissions and approvals">
                <p className="subtle">Visible required content by section</p>
                <div className="section-chart">
                  {q.data?.sections?.map((section) => {
                    const submitted = section.progress.submittedRequired,
                      approved = section.progress.approvedRequired
                    return (
                      <div key={section.id}>
                        <span>{section.title}</span>
                        <div>
                          <meter
                            aria-label={`${section.title} submitted`}
                            min={0}
                            max={section.progress.requiredTotal || 1}
                            value={submitted}
                          />
                          <meter
                            aria-label={`${section.title} approved`}
                            min={0}
                            max={section.progress.requiredTotal || 1}
                            value={approved}
                          />
                        </div>
                        <small>
                          {submitted} / {approved}
                        </small>
                      </div>
                    )
                  })}
                </div>
                <p className="chart-legend">● Submitted · ● Approved</p>
              </Panel>
              <Panel title="Items by section">
                <div className="reference-table-wrap">
                  <table className="reference-table">
                    <thead>
                      <tr>
                        <th>Section</th>
                        <th>Submitted</th>
                        <th>Approved</th>
                        <th>Client action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.data?.sections?.map((s) => (
                        <tr key={s.id}>
                          <td>{s.title}</td>
                          <td>{s.progress.submittedRequired}</td>
                          <td>{s.progress.approvedRequired}</td>
                          <td>{s.progress.clientActionRequired}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
            <p className="subtle">
              Generated{' '}
              {q.data && new Date(q.data.generatedAt).toLocaleString()}. Current
              snapshot; no period-over-period trend is inferred.
            </p>
          </>
        )}
        {tab === 'friction' && (
          <Panel title="Item friction">
            <p>
              Friction means a start without submission after a completed 7-day
              observation window. It does not mean abandonment. At least 10
              eligible starts and 10 completed windows are required.
            </p>
            <label className="board-search">
              <input
                aria-label="Search friction items"
                placeholder="Search content items…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>
            <QueryState query={q}>
              <div className="table-scroll">
                <table>
                  <caption>
                    Item collection friction · synthetic observations in demo
                    mode
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
                    {q.data?.friction
                      .filter((m) =>
                        m.itemKey.toLowerCase().includes(filter.toLowerCase()),
                      )
                      .map((m, i) => (
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
                            {m.eligibleStarts - m.completedObservationWindows}{' '}
                            still observing
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
        )}
        {tab === 'share' && owner && (
          <Panel title="Counts-only status share">
            <div className="share-layout">
              <div>
                <p>
                  Share counts only: no answers, contact details, files,
                  internal notes or workspace identity. Use a public-safe alias.
                </p>
                <form
                  className="stack-form"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    const v = new FormData(e.currentTarget)
                    const result = await command.run<{
                      shareId: string
                      url: string
                    }>(`${root}/status-shares`, {
                      alias: v.get('alias'),
                      expiresAt: new Date(
                        String(v.get('expires')),
                      ).toISOString(),
                      allowedOrigins: String(v.get('origins') || '')
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
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
                    <textarea
                      name="origins"
                      placeholder="https://example.com"
                    />
                  </Field>
                  <button
                    className="secondary-button"
                    disabled={command.pending}
                  >
                    Create counts-only share
                  </button>
                </form>
                {share && (
                  <div className="inset">
                    <Link to={share.url}>Open counts-only status link</Link>
                    <div className="actions">
                      <button
                        className="primary-button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              `${window.location.origin}${share.url}`,
                            )
                            setCopied('Link copied.')
                          } catch {
                            setCopied('Copy unavailable. Use the visible link.')
                          }
                        }}
                      >
                        Copy public link
                      </button>
                      <button
                        className="secondary-button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              `<iframe title="Project status" src="${window.location.origin}${share.url}" loading="lazy"></iframe>`,
                            )
                            setCopied('Embed code copied.')
                          } catch {
                            setCopied(
                              'Copy unavailable. Select the code below.',
                            )
                          }
                        }}
                      >
                        Copy embed code
                      </button>
                    </div>
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
              </div>
              <section className="counts-preview">
                <h3>Preview (counts only)</h3>
                <div className="report-metrics">
                  {[
                    ['Total', q.data?.progress.requiredTotal || 0],
                    ['Submitted', q.data?.progress.submittedRequired || 0],
                    ['Approved', q.data?.progress.approvedRequired || 0],
                  ].map(([label, value]) => (
                    <article key={label}>
                      <strong>{value}</strong>
                      <span>{label}</span>
                    </article>
                  ))}
                </div>
                <Notice>
                  This share contains counts only. No project name, client
                  names, questions, answers or files are included.
                </Notice>
              </section>
            </div>
            {copied && <Notice>{copied}</Notice>}
            <ErrorNotice error={command.error} />
          </Panel>
        )}
      </div>
    </QueryState>
  )
}
export function InsightsPage() {
  const { id, base } = useWorkspace()
  const q = useData<Paged<Project>>(`workspaces/${id}/projects?size=100`)
  const [project, setProject] = useState('')
  const projects = q.data?.data || []
  const selected = projects.find((p) => p.id === project) || projects[0]
  const total = projects.reduce((n, p) => n + p.progress.requiredTotal, 0)
  const submitted = projects.reduce(
    (n, p) => n + p.progress.submittedRequired,
    0,
  )
  const approved = projects.reduce((n, p) => n + p.progress.approvedRequired, 0)
  return (
    <div className="insights-page">
      <Heading
        title="Insights"
        description="See what’s moving, what’s approved and where clients need support."
      >
        <span className="insights-scope">Current snapshot</span>
      </Heading>
      <QueryState query={q}>
        {projects.length ? (
          <>
            <div className="insights-summary">
              {[
                ['Projects', projects.length, 'In this view'],
                ['Required items', total, 'Visible collection requirements'],
                ['Submitted', submitted, 'Ready for review or approved'],
                ['Approved', approved, 'Ready for delivery'],
              ].map(([label, count, copy]) => (
                <article key={label}>
                  <span>{label}</span>
                  <strong>{count}</strong>
                  <small>{copy}</small>
                </article>
              ))}
            </div>
            <section
              className="insights-project-picker"
              aria-label="Project insights selection"
            >
              <div>
                <h2>Explore a project</h2>
                <p>
                  Choose a project to review its progress and collection
                  friction.
                </p>
              </div>
              <Field label="Project">
                <select
                  value={selected?.id || ''}
                  onChange={(e) => setProject(e.target.value)}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </Field>
              {selected && (
                <Link
                  className="secondary-button"
                  to={`${base}/projects/${selected.id}?tab=analytics`}
                >
                  Open project
                </Link>
              )}
            </section>
            {selected && (
              <div className="insights-project-detail">
                <div className="insights-project-caption">
                  <div>
                    <span className="eyebrow">Project performance</span>
                    <h2>{selected.title}</h2>
                    <p>
                      {selected.clientBusinessName} ·{' '}
                      {selected.projectType.replaceAll('_', ' ')}
                    </p>
                  </div>
                  <Badge>{selected.state}</Badge>
                </div>
                <AnalyticsPanel
                  key={selected.id}
                  root={`workspaces/${id}/projects/${selected.id}`}
                />
              </div>
            )}
            {q.data && q.data.page.totalElements > projects.length && (
              <p className="subtle">
                Showing {projects.length} loaded projects. Open Projects to
                browse all projects.
              </p>
            )}
          </>
        ) : (
          <Empty
            title="Your insights start with a project"
            description="Create a project and collect content to see progress here."
            to={`${base}/projects`}
            label="Open projects"
          />
        )}
      </QueryState>
    </div>
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

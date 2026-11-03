import { useProjectAnalyticsQuery } from '../api/analyticsApi'
import { FrictionTable } from './FrictionTable'
import { Notice } from '@/shared/components/Feedback'
import {
  ErrorNotice,
  Field,
  Panel,
  QueryState,
} from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import { useState } from 'react'
import { Link } from 'react-router'

export function AnalyticsPanel({ root }: { root: string }) {
  const q = useProjectAnalyticsQuery(root)
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
            {q.data?.progress.requiredTotal === 0 && <p>No required items</p>}
            {!!q.data?.sections?.length && (
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
            )}
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
              Counts cover starts in the last 90 days. A start without
              submission within a completed seven-day window is a friction
              signal, not proof of abandonment. Open windows remain pending
              observation. Percentages use only completed windows and require at
              least 10 eligible starts and 10 completed windows. Median time
              includes only observed first submissions, with its sample count;
              agency approval time is excluded.
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
              <FrictionTable
                rows={(q.data?.friction || []).filter((m) =>
                  m.itemKey.toLowerCase().includes(filter.toLowerCase()),
                )}
              />
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

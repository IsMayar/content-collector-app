import { useState } from 'react'
import { useData } from '@/api/productApi'
import type {
  Comment,
  ExportSummary,
  Item,
  Project,
  SafeAuditEvent,
  SubmissionRevision,
} from '@/api/contracts'
import {
  Badge,
  Empty,
  ErrorNotice,
  Field,
  Panel,
  QueryState,
  useCommand,
} from '@/components/ProductUI'
import { ConfirmDialog, Notice } from '@/components/Feedback'
import { downloadFile } from '@/lib/download'

export function ReviewPanel({ root }: { root: string }) {
  const q = useData<{ data: { item: Item; revision: SubmissionRevision }[] }>(
    `${root}/review-queue`,
  )
  const [selected, setSelected] = useState('')
  const detail = useData<{ project: Project; structure: { items: Item[] }[] }>(
    root,
  )
  const all = detail.data?.structure.flatMap((s) => s.items) || []
  const item =
    all.find((i) => i.id === selected) ||
    q.data?.data[0]?.item ||
    all.find((i) => i.currentRevisionId)
  return (
    <>
      <Panel title="Ready for a thoughtful review">
        <p className="subtle">
          Review the exact submitted revision. Draft changes never replace this
          snapshot.
        </p>
        <QueryState query={q}>
          {q.data?.data.length ? (
            <div className="review-queue">
              {q.data.data.map(({ item, revision }) => (
                <button
                  className={`review-choice ${item.id === selected ? 'active' : ''}`}
                  key={item.id}
                  onClick={() => setSelected(item.id)}
                >
                  <strong>{item.label}</strong>
                  <span>
                    Revision {revision.revisionNo} ·{' '}
                    {new Date(revision.submittedAt).toLocaleString()}
                  </span>
                  <Badge>{item.state}</Badge>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="The review queue is clear"
              description="New client submissions will appear here."
            />
          )}
        </QueryState>
        <Field label="Browse item history">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Current queue item</option>
            {all.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label} · {i.state}
              </option>
            ))}
          </select>
        </Field>
      </Panel>
      {item && <RevisionReview key={item.id} root={root} item={item} />}
    </>
  )
}
function RevisionReview({ root, item }: { root: string; item: Item }) {
  const revisions = useData<{ data: SubmissionRevision[] }>(
    `${root}/items/${item.id}/revisions`,
  )
  const comments = useData<{ data: Comment[] }>(
    `${root}/items/${item.id}/comments`,
  )
  const [revisionId, setRevision] = useState('')
  const revision =
    revisions.data?.data.find((r) => r.revisionId === revisionId) ||
    revisions.data?.data[0]
  const command = useCommand()
  const [decision, setDecision] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  return (
    <>
      <Panel title={item.label}>
        <div className="actions">
          <Badge>{item.state}</Badge>
          <Field label="Submitted revision">
            <select
              value={revision?.revisionId || ''}
              onChange={(e) => setRevision(e.target.value)}
            >
              {revisions.data?.data.map((r) => (
                <option key={r.revisionId} value={r.revisionId}>
                  Revision {r.revisionNo} ·{' '}
                  {new Date(r.submittedAt).toLocaleString()}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {revision ? (
          <>
            <p className="subtle">
              Structure v{revision.structureVersion} · Exact revision{' '}
              {revision.revisionId}
            </p>
            <div className="revision-value">
              <h3>{revision.schemaSnapshot.label}</h3>
              <SnapshotValue value={revision.valueSnapshot} />
              {revision.assets.map((a) => (
                <p key={a.id}>
                  {a.originalName} · {a.state}
                </p>
              ))}
            </div>
            {revision.revisionId !== item.currentRevisionId && (
              <Notice>
                This is a historical revision. It cannot be approved as the
                current submission.
              </Notice>
            )}
            <div className="actions">
              <button
                className="primary-button"
                disabled={
                  item.state !== 'SUBMITTED' ||
                  revision.revisionId !== item.currentRevisionId
                }
                onClick={() => setDecision('APPROVE')}
              >
                Approve revision
              </button>
              <button
                className="secondary-button"
                disabled={
                  item.state !== 'SUBMITTED' ||
                  revision.revisionId !== item.currentRevisionId
                }
                onClick={() => setDecision('REQUEST_CHANGES')}
              >
                Request changes
              </button>
              {item.state === 'APPROVED' && (
                <button
                  className="secondary-button"
                  onClick={() => setDecision('REOPEN')}
                >
                  Reopen approved item
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="subtle">No submissions yet.</p>
        )}
        <ErrorNotice error={command.error} />
        {message && <Notice>{message}</Notice>}
      </Panel>
      <Panel title="Conversation and internal notes">
        <p className="subtle">
          Internal notes are visible only to permitted agency members.
        </p>
        <div className="comments">
          {comments.data?.data.map((c) => (
            <article
              className={c.visibility === 'INTERNAL' ? 'internal-comment' : ''}
              key={c.id}
            >
              <strong>{c.authorDisplayName}</strong>
              <Badge>{c.visibility}</Badge>
              <p>{c.body}</p>
              <time>{new Date(c.createdAt).toLocaleString()}</time>
            </article>
          ))}
        </div>
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault()
            const f = e.currentTarget
            const values = Object.fromEntries(new FormData(f))
            if (await command.run(`${root}/items/${item.id}/comments`, values))
              f.reset()
          }}
        >
          <Field label="Comment visibility">
            <select name="visibility">
              <option value="CLIENT">Client conversation</option>
              <option value="INTERNAL">Internal agency note</option>
            </select>
          </Field>
          <Field label="Comment">
            <textarea required name="body" maxLength={4000} />
          </Field>
          <button className="secondary-button" disabled={command.pending}>
            Add comment
          </button>
        </form>
      </Panel>
      <ConfirmDialog
        open={!!decision}
        pending={command.pending}
        title={
          decision === 'APPROVE'
            ? 'Approve this exact revision?'
            : decision === 'REOPEN'
              ? 'Reopen approved content?'
              : 'Request a revision?'
        }
        description={
          <>
            <p>Historical submissions remain unchanged.</p>
            {decision !== 'APPROVE' && (
              <Field label="Reason (shared with the client)">
                <textarea
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            )}
            <ErrorNotice error={command.error} />
          </>
        }
        confirmLabel={decision === 'APPROVE' ? 'Approve' : 'Confirm changes'}
        onCancel={() => setDecision('')}
        onConfirm={() =>
          void (async () => {
            const result = await command.run(
              `${root}/items/${item.id}/${decision === 'REOPEN' ? 'reopen' : 'review-decisions'}`,
              {
                revisionId: revision?.revisionId,
                expectedItemVersion: item.version,
                decision,
                reason,
              },
            )
            if (result) {
              setMessage(
                decision === 'APPROVE'
                  ? 'Exact revision approved.'
                  : 'Client action requested.',
              )
              setDecision('')
              setReason('')
            }
          })()
        }
      />
    </>
  )
}
export function SnapshotValue({ value }: { value: unknown }) {
  const v = value as Record<string, unknown>
  if ('text' in v || 'url' in v)
    return <p className="preserve-text">{String(v.text || v.url || '')}</p>
  if ('optionKey' in v) return <p>{String(v.optionKey)}</p>
  if ('optionKeys' in v)
    return (
      <ul>
        {(v.optionKeys as string[]).map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
    )
  if ('rows' in v)
    return (
      <div>
        {(v.rows as { rowId: string; values: Record<string, unknown> }[]).map(
          (r, i) => (
            <dl key={r.rowId}>
              <dt>Entry {i + 1}</dt>
              {Object.entries(r.values).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{String(v)}</dd>
                </div>
              ))}
            </dl>
          ),
        )}
      </div>
    )
  return <p>{((v.assetIds as string[]) || []).length} attached files</p>
}
export function ActivityPanel({ root }: { root: string }) {
  const q = useData<{ data: SafeAuditEvent[] }>(`${root}/activity`)
  return (
    <Panel title="Project activity">
      <p className="subtle">
        A record of meaningful actions. Answers, tokens and private file URLs
        are excluded.
      </p>
      <QueryState query={q}>
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
      </QueryState>
    </Panel>
  )
}
export function ExportPanel({
  root,
  project,
}: {
  root: string
  project: Project
}) {
  const q = useData<{ data: ExportSummary[] }>(`${root}/exports`)
  const command = useCommand()
  const [job, setJob] = useState('')
  const poll = useData<{ export: ExportSummary }>(
    job ? `${root}/exports/${job}` : '',
    { pollingInterval: job ? 800 : 0 },
  )
  const [message, setMessage] = useState('')
  const jobs =
    q.data?.data.map((j) =>
      j.id === poll.data?.export.id ? poll.data.export : j,
    ) || []
  return (
    <>
      <Panel title="A handoff you can trust">
        <p>
          Exports contain visible, approved exact revisions only. Each export is
          an immutable snapshot, even if the project changes later.
        </p>
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault()
            const v = new FormData(e.currentTarget)
            const result = await command.run<{ export: ExportSummary }>(
              `${root}/exports`,
              {
                format: v.get('format'),
                expectedProjectVersion: project.version,
                includeOriginals: v.has('originals'),
                acknowledgePartial: v.has('partial'),
              },
            )
            if (result) {
              setJob(result.export.id)
              setMessage(
                'Export queued. Snapshot captured at project version ' +
                  result.export.projectVersion,
              )
            }
          }}
        >
          <Field label="Export format">
            <select name="format">
              <option value="APPROVED_ZIP">
                ZIP · manifest, Markdown and approved files
              </option>
              <option value="APPROVED_JSON">
                JSON · approved content and manifest
              </option>
              <option value="APPROVED_MARKDOWN">
                Markdown · approved content
              </option>
            </select>
          </Field>
          <label className="check-row">
            <input type="checkbox" name="originals" />
            Include retained originals where available
          </label>
          <label className="check-row">
            <input type="checkbox" name="partial" />I understand this is a
            partial export if required approvals are incomplete
          </label>
          <p className="subtle">
            Downloads expire after 24 hours. Maximum package size: 2 GB.
            Historical drafts and internal notes are excluded.
          </p>
          <button className="primary-button" disabled={command.pending}>
            Create approved export
          </button>
        </form>
        <ErrorNotice error={command.error} />
        {message && <Notice>{message}</Notice>}
      </Panel>
      <Panel title="Export history">
        <QueryState query={q}>
          {jobs.length ? (
            jobs.map((j) => (
              <div className="export-row" key={j.id}>
                <div className="grow">
                  <strong>{j.format.replaceAll('_', ' ')}</strong>
                  <p>
                    Project v{j.projectVersion} ·{' '}
                    {new Date(j.createdAt).toLocaleString()} ·{' '}
                    {j.partial ? 'Partial snapshot' : 'All required approved'}
                  </p>
                  {j.olderThanCurrentProject && (
                    <small>
                      Older than current project. Create a new export for recent
                      changes.
                    </small>
                  )}
                </div>
                <Badge>{j.state}</Badge>
                {j.state === 'READY' ? (
                  <button
                    className="secondary-button"
                    onClick={async () => {
                      const result = await command.run<{ url: string }>(
                        `${root}/exports/${j.id}/download`,
                        {},
                      )
                      if (result) {
                        try {
                          await downloadFile(
                            result.url,
                            `approved-${j.id}.${j.format === 'APPROVED_ZIP' ? 'zip' : j.format === 'APPROVED_JSON' ? 'json' : 'md'}`,
                          )
                        } catch (e) {
                          setMessage(
                            e instanceof Error ? e.message : 'Download failed.',
                          )
                        }
                      }
                    }}
                  >
                    Download
                  </button>
                ) : ['QUEUED', 'RUNNING'].includes(j.state) ? (
                  <button className="text-link" onClick={() => setJob(j.id)}>
                    Check progress
                  </button>
                ) : (
                  <span className="subtle">Create a new export to retry</span>
                )}
              </div>
            ))
          ) : (
            <Empty
              title="Your handoff is taking shape"
              description="Approve client submissions, then create your first export."
            />
          )}
        </QueryState>
      </Panel>
    </>
  )
}

import type { Project } from '@/features/projects/types/project.types'
import type {
  Comment,
  ExportSummary,
  SafeAuditEvent,
  SubmissionRevision,
} from '@/features/review/types/review.types'
import type { Item } from '@/features/structure-editor/types/structure.types'
import { useData } from '@/services/api/resourceApi'
import { ConfirmDialog, Notice } from '@/shared/components/Feedback'
import { Modal } from '@/shared/components/Modal'
import {
  Badge,
  Empty,
  ErrorNotice,
  Field,
  Panel,
  QueryState,
} from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { downloadFile } from '@/shared/utils/download'
import { useState } from 'react'

export function ReviewPanel({ root }: { root: string }) {
  const q = useData<{ data: { item: Item; revision: SubmissionRevision }[] }>(
    `${root}/review-queue`,
  )
  const [selected, setSelected] = useState('')
  const [filter, setFilter] = useState('')
  const detail = useData<{ project: Project; structure: { items: Item[] }[] }>(
    root,
  )
  const all = detail.data?.structure.flatMap((s) => s.items) || []
  const item = all.find((i) => i.id === selected)
  if (item)
    return (
      <>
        <button className="text-link" onClick={() => setSelected('')}>
          Back to review queue
        </button>
        <RevisionReview key={item.id} root={root} item={item} />
      </>
    )
  return (
    <>
      <Panel title="Content review queue">
        <p className="subtle">
          Review the exact submitted revision. Draft changes never replace this
          snapshot.
        </p>
        <QueryState query={q}>
          {q.data?.data.length ? (
            <>
              <label className="board-search">
                <input
                  aria-label="Filter review queue"
                  placeholder="Search content to review…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </label>
              <div className="reference-table-wrap">
                <table className="reference-table">
                  <thead>
                    <tr>
                      <th>Content item</th>
                      <th>Revision</th>
                      <th>Submitted</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.data
                      .filter(({ item }) =>
                        item.label.toLowerCase().includes(filter.toLowerCase()),
                      )
                      .map(({ item, revision }) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.label}</strong>
                          </td>
                          <td>v{revision.revisionNo}</td>
                          <td>
                            {new Date(revision.submittedAt).toLocaleString()}
                          </td>
                          <td>
                            <Badge>{item.state}</Badge>
                          </td>
                          <td>
                            <button
                              className="primary-button"
                              onClick={() => setSelected(item.id)}
                            >
                              Review
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
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
  const [visibility, setVisibility] = useState<'CLIENT' | 'INTERNAL'>('CLIENT')
  const [compare, setCompare] = useState(false)
  const [message, setMessage] = useState('')
  return (
    <div className="revision-layout">
      <Panel title={item.label}>
        <div className="actions">
          <Badge>{item.state}</Badge>
          <button
            className="secondary-button"
            disabled={(revisions.data?.data.length || 0) < 2}
            onClick={() => setCompare(true)}
          >
            Compare revisions
          </button>
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
      <Panel title="Conversation">
        <p className="subtle">
          Internal notes are visible only to permitted agency members.
        </p>
        <nav className="reference-tabs" aria-label="Conversation visibility">
          <button
            className={visibility === 'CLIENT' ? 'active' : ''}
            onClick={() => setVisibility('CLIENT')}
          >
            Client conversation
          </button>
          <button
            className={visibility === 'INTERNAL' ? 'active' : ''}
            onClick={() => setVisibility('INTERNAL')}
          >
            Internal notes
          </button>
        </nav>
        <div className="comments">
          {comments.data?.data
            .filter((c) => c.visibility === visibility)
            .map((c) => (
              <article
                className={
                  c.visibility === 'INTERNAL' ? 'internal-comment' : ''
                }
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
            <select
              name="visibility"
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as 'CLIENT' | 'INTERNAL')
              }
            >
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
      {compare && (
        <Modal title="Compare revisions" onClose={() => setCompare(false)}>
          <RevisionComparison revisions={revisions.data?.data || []} />
        </Modal>
      )}
      <ConfirmDialog
        open={!!decision}
        pending={command.pending}
        title={
          decision === 'APPROVE'
            ? 'Approve this exact revision?'
            : decision === 'REOPEN'
              ? 'Reopen approved content?'
              : 'Request changes'
        }
        description={
          <>
            <p>
              {decision === 'REQUEST_CHANGES'
                ? 'Provide clear feedback so your client can make updates. This feedback is visible to the client.'
                : 'Historical submissions remain unchanged.'}
            </p>
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
    </div>
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
  const detail = useData<{
    structure: { id: string; title: string; items: Item[] }[]
  }>(root)
  const command = useCommand()
  const [job, setJob] = useState('')
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)
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
      <div className="board-toolbar">
        <div>
          <h2>Export history</h2>
          <p>View and manage exports for this project.</p>
        </div>
        <button
          className="primary-button"
          onClick={() => {
            setStep(1)
            setOpen(true)
          }}
        >
          ＋ New export
        </button>
      </div>
      {open && (
        <Modal
          title="Export approved content"
          onClose={() => setOpen(false)}
          pending={command.pending}
        >
          <nav className="reference-tabs" aria-label="Export steps">
            <span className={step === 1 ? 'active' : ''}>
              1 · Format & content
            </span>
            <span className={step === 2 ? 'active' : ''}>
              2 · Review and confirm
            </span>
          </nav>
          <p>
            Exports contain visible, approved exact revisions only. Each export
            is an immutable snapshot, even if the project changes later.
          </p>
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault()
              if (step === 1) {
                setStep(2)
                return
              }
              const v = new FormData(e.currentTarget)
              const result = await command.run<{ export: ExportSummary }>(
                `${root}/exports`,
                {
                  format: v.get('format'),
                  sectionIds: v.getAll('sections'),
                  expectedProjectVersion: project.version,
                  includeOriginals: v.has('originals'),
                  acknowledgePartial: v.has('partial'),
                },
              )
              if (result) {
                setJob(result.export.id)
                setOpen(false)
                setMessage(
                  'Export queued. Snapshot captured at project version ' +
                    result.export.projectVersion,
                )
              }
            }}
          >
            <div hidden={step !== 1}>
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
              <fieldset className="export-sections">
                <legend>Include sections</legend>
                {detail.data?.structure.map((section) => (
                  <label className="check-row" key={section.id}>
                    <input
                      type="checkbox"
                      name="sections"
                      value={section.id}
                      defaultChecked
                    />
                    <strong>{section.title}</strong>
                    <small>{section.items.length} items</small>
                  </label>
                ))}
              </fieldset>
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
            </div>
            {step === 2 && (
              <div className="export-review">
                <h3>Ready to create your package?</h3>
                <p>{project.title}</p>
                <p>Snapshot: project version {project.version}</p>
                <p>
                  {project.progress.approvedRequired} of{' '}
                  {project.progress.requiredTotal} required items approved.
                </p>
                <Notice>
                  Only visible, approved content and its ready files are
                  included. This snapshot will not change when the project
                  changes.
                </Notice>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setStep(1)}
                >
                  Edit configuration
                </button>
              </div>
            )}
            <button className="primary-button" disabled={command.pending}>
              {step === 1 ? 'Continue' : 'Create approved export'}
            </button>
          </form>
          <ErrorNotice error={command.error} />
          {message && <Notice>{message}</Notice>}
        </Modal>
      )}
      <ErrorNotice error={command.error} />
      {message && <Notice>{message}</Notice>}
      <Panel title="Export history">
        <QueryState query={q}>
          {jobs.length ? (
            <div className="export-history">
              <div className="export-table-head">
                <strong>Export / snapshot</strong>
                <strong>Status</strong>
                <strong>Download</strong>
              </div>
              {jobs.map((j) => (
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
                        Older than current project. Create a new export for
                        recent changes.
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
                              e instanceof Error
                                ? e.message
                                : 'Download failed.',
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
              ))}
            </div>
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
function RevisionComparison({
  revisions,
}: {
  revisions: SubmissionRevision[]
}) {
  const [left, setLeft] = useState(revisions[1]?.revisionId || ''),
    [right, setRight] = useState(revisions[0]?.revisionId || '')
  const a = revisions.find((r) => r.revisionId === left),
    b = revisions.find((r) => r.revisionId === right)
  const words = (r: SubmissionRevision | undefined) =>
    r && 'text' in r.valueSnapshot
      ? String(r.valueSnapshot.text).split(/(\s+)/)
      : []
  const aw = words(a),
    bw = words(b),
    aset = new Set(aw),
    bset = new Set(bw)
  return (
    <>
      <p>
        Compare immutable submissions. Highlighted words occur only in the
        selected version.
      </p>
      <div className="draft-comparison">
        {[
          [a, left, setLeft, aw, bset, 'removed'],
          [b, right, setRight, bw, aset, 'added'],
        ].map((entry, index) => {
          const [r, id, set, ws, other, kind] = entry as [
            SubmissionRevision | undefined,
            string,
            (v: string) => void,
            string[],
            Set<string>,
            string,
          ]
          return (
            <section key={index}>
              <Field label={index ? 'Newer revision' : 'Earlier revision'}>
                <select value={id} onChange={(e) => set(e.target.value)}>
                  {revisions.map((r) => (
                    <option key={r.revisionId} value={r.revisionId}>
                      Revision {r.revisionNo} ·{' '}
                      {new Date(r.submittedAt).toLocaleString()}
                    </option>
                  ))}
                </select>
              </Field>
              {r &&
                (ws.length ? (
                  <p className="preserve-text">
                    {ws.map((w, i) =>
                      other.has(w) || !w.trim() ? (
                        w
                      ) : (
                        <mark className={kind} key={i}>
                          {w}
                        </mark>
                      ),
                    )}
                  </p>
                ) : (
                  <SnapshotValue value={r.valueSnapshot} />
                ))}
            </section>
          )
        })}
      </div>
    </>
  )
}

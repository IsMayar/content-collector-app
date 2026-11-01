import { useRef, useState } from 'react'
import { useData } from '@/services/api/resourceApi'
import { useCommand } from '@/shared/hooks/useCommand'
import {
  Badge,
  ErrorNotice,
  Field,
  Panel,
  QueryState,
} from '@/shared/components/ProductUI'
import { ConfirmDialog, Notice } from '@/shared/components/Feedback'
import { SubmittedAnswer } from '@/shared/components/SubmittedAnswer'
import { downloadFile } from '@/shared/utils/download'
import type { Item } from '@/features/structure-editor/types/structure.types'
import type {
  SubmissionSummary,
  ReviewDecision,
  Comment,
  ReviewCommand,
  SubmissionRevision,
} from '../types/review.types'
import { decisionResultSchema } from '../schemas/reviewSchema'

export function LiveReviewPanel({
  root,
  items,
}: {
  root: string
  items: Item[]
}) {
  const [page, setPage] = useState(0)
  const queue = useData<{
    data: SubmissionSummary[]
    page: { number: number; size: number; totalElements: number }
  }>(`${root}/review-queue?page=${page}&size=25`)
  const [selected, setSelected] = useState('')
  const item = items.find((i) => i.id === selected)
  return (
    <>
      {item ? (
        <>
          <button
            type="button"
            className="text-link"
            onClick={() => setSelected('')}
          >
            Back to review queue
          </button>
          <LiveRevisionReview key={root + item.id} root={root} item={item} />
        </>
      ) : (
        <Panel title="Content review queue">
          <p>
            Review exact submitted content. Saved drafts never replace this
            snapshot.
          </p>
          <QueryState query={queue}>
            <ul>
              {queue.data?.data.map((r) => (
                <li key={r.revisionId}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setSelected(r.itemId)}
                  >
                    {items.find((i) => i.id === r.itemId)?.label || r.itemKey} ·
                    Revision {r.revisionNo}
                  </button>
                </li>
              ))}
            </ul>
            {queue.data?.data.length === 0 && (
              <p>No items are awaiting review.</p>
            )}
          </QueryState>
          <div className="actions">
            <button
              type="button"
              className="secondary-button"
              disabled={page === 0 || queue.isFetching}
              onClick={() => setPage(page - 1)}
            >
              Previous page
            </button>
            <span>Page {page + 1}</span>
            <button
              type="button"
              className="secondary-button"
              disabled={
                queue.isFetching ||
                !queue.data ||
                (page + 1) * 25 >= queue.data.page.totalElements
              }
              onClick={() => setPage(page + 1)}
            >
              Next page
            </button>
          </div>
        </Panel>
      )}
      <Field label="Browse submitted item history">
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Choose a question</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label} · {i.state}
            </option>
          ))}
        </select>
      </Field>
    </>
  )
}
export function LiveRevisionReview({
  root,
  item,
}: {
  root: string
  item: Item
}) {
  const history = useData<{ data: SubmissionSummary[] }>(
    `${root}/items/${item.id}/revisions`,
  )
  const [selected, setSelected] = useState('')
  const revisionId = selected || history.data?.data[0]?.revisionId || ''
  const detail = useData<{
    revision: SubmissionRevision
    decisions: ReviewDecision[]
  }>(`${root}/items/${item.id}/revisions/${revisionId}`, { skip: !revisionId })
  const revision = detail.data?.revision
  const command = useCommand()
  const [intent, setIntent] = useState<ReviewCommand | null>(null)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const busy = useRef(false)
  const retry = useRef({ body: '', key: '' })
  const current =
    item.state === 'SUBMITTED' &&
    revisionId === item.currentRevisionId &&
    !detail.isFetching
  async function confirm() {
    if (!intent || busy.current) return
    if (intent.decision === 'REQUEST_CHANGES' && !reason.trim()) {
      setError('Explain the changes needed before sending feedback.')
      return
    }
    const body = {
      ...intent,
      reason: intent.decision === 'REQUEST_CHANGES' ? reason.trim() : undefined,
    }
    const serialized = JSON.stringify(body)
    if (retry.current.body !== serialized)
      retry.current = { body: serialized, key: crypto.randomUUID() }
    busy.current = true
    setError('')
    setMessage('')
    try {
      const result = await command.run(
        `${root}/items/${item.id}/review-decisions`,
        body,
        'POST',
        { 'Idempotency-Key': retry.current.key },
      )
      if (!result) return
      const parsed = decisionResultSchema.safeParse(result)
      if (
        !parsed.success ||
        parsed.data.decision.revisionId !== intent.revisionId ||
        parsed.data.item.id !== item.id ||
        parsed.data.decision.decision !== intent.decision ||
        parsed.data.item.state !==
          (intent.decision === 'APPROVE' ? 'APPROVED' : 'CHANGES_REQUESTED')
      ) {
        setError(
          'The response could not be verified. Reload the current review state before continuing.',
        )
        return
      }
      setMessage(
        parsed.data.item.state === 'APPROVED'
          ? 'Exact submitted revision approved.'
          : 'Changes requested. Your feedback is visible to the client.',
      )
      setIntent(null)
      setReason('')
      void detail.refetch()
    } finally {
      busy.current = false
    }
  }
  return (
    <div className="revision-layout">
      <Panel title={item.label}>
        <Badge>{item.state}</Badge>
        <QueryState query={history}>
          <Field label="Submitted revision">
            <select
              value={revisionId}
              disabled={command.pending}
              onChange={(e) => {
                setSelected(e.target.value)
                setMessage('')
              }}
            >
              {history.data?.data.map((r) => (
                <option key={r.revisionId} value={r.revisionId}>
                  Revision {r.revisionNo} ·{' '}
                  {new Date(r.submittedAt).toLocaleString()}
                </option>
              ))}
            </select>
          </Field>
        </QueryState>
        {!revisionId && <p>No submitted versions for this question.</p>}
        {revisionId && (
          <QueryState query={detail}>
            {revision && !detail.isFetching && (
              <>
                <h3>Submitted revision {revision.revisionNo}</h3>
                <SubmittedAnswer
                  schema={revision.schemaSnapshot}
                  value={revision.valueSnapshot}
                />
                {revision.assets.map((a) => (
                  <button
                    type="button"
                    className="text-link"
                    key={a.id}
                    onClick={async () => {
                      const variant = a.availableVariants.includes('ORIGINAL')
                        ? 'ORIGINAL'
                        : 'WORKING'
                      const result = await command.run<{ url: string }>(
                        `${root}/assets/${a.id}/download`,
                        { variant },
                      )
                      if (result)
                        try {
                          await downloadFile(
                            result.url,
                            variant === 'WORKING'
                              ? a.originalName.replace(/\.[^.]+$/, '') + '.png'
                              : a.originalName,
                          )
                        } catch {
                          setError('Download failed. Please try again.')
                        }
                    }}
                  >
                    Download {a.originalName}
                  </button>
                ))}
                {!current && (
                  <Notice>
                    This revision is read-only. Only the current submitted
                    revision can receive a decision.
                  </Notice>
                )}
                <div className="actions">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={!current || command.pending}
                    onClick={() => {
                      setError('')
                      setIntent({
                        revisionId,
                        expectedItemVersion: item.version,
                        decision: 'APPROVE',
                      })
                    }}
                  >
                    Approve revision
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!current || command.pending}
                    onClick={() => {
                      setError('')
                      setIntent({
                        revisionId,
                        expectedItemVersion: item.version,
                        decision: 'REQUEST_CHANGES',
                      })
                    }}
                  >
                    Request changes
                  </button>
                </div>
                <ul aria-label="Review decisions">
                  {detail.data?.decisions.map((d) => (
                    <li key={d.id}>
                      <strong>
                        {d.decision === 'APPROVE'
                          ? 'Approved'
                          : 'Changes requested'}
                      </strong>{' '}
                      · {d.reviewerDisplayName} ·{' '}
                      <time>{new Date(d.reviewedAt).toLocaleString()}</time>
                      {d.reason && <p className="preserve-text">{d.reason}</p>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </QueryState>
        )}
        <ErrorNotice error={error || command.error} />
        {message && <p role="status">{message}</p>}
      </Panel>
      <ReviewComments root={root} itemId={item.id} />
      <ConfirmDialog
        open={!!intent}
        pending={command.pending}
        title={
          intent?.decision === 'APPROVE'
            ? 'Approve this exact revision?'
            : 'Request changes'
        }
        description={
          <>
            <p>
              You are deciding submitted revision {revision?.revisionNo}.
              Historical content stays unchanged.
            </p>
            {intent?.decision === 'REQUEST_CHANGES' && (
              <Field label="Feedback shared with the client">
                <textarea
                  value={reason}
                  maxLength={5000}
                  required
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            )}
            <ErrorNotice error={error || command.error} />
          </>
        }
        confirmLabel={
          intent?.decision === 'APPROVE' ? 'Approve' : 'Send feedback'
        }
        onCancel={() => setIntent(null)}
        onConfirm={() => void confirm()}
      />
    </div>
  )
}
export function ReviewComments({
  root,
  itemId,
}: {
  root: string
  itemId: string
}) {
  const query = useData<{ data: Comment[] }>(`${root}/items/${itemId}/comments`)
  const command = useCommand()
  const [visibility, setVisibility] = useState<'CLIENT' | 'INTERNAL'>('CLIENT')
  const [body, setBody] = useState('')
  return (
    <Panel title="Conversation">
      <Field label="Comment visibility">
        <select
          value={visibility}
          onChange={(e) =>
            setVisibility(e.target.value as 'CLIENT' | 'INTERNAL')
          }
        >
          <option value="CLIENT">Client conversation</option>
          <option value="INTERNAL">Internal agency notes</option>
        </select>
      </Field>
      <p>
        {visibility === 'CLIENT'
          ? 'Shared with the client.'
          : 'Only authorized agency members can read these notes.'}
      </p>
      <QueryState query={query}>
        <ul>
          {query.data?.data
            .filter((c) => c.visibility === visibility)
            .map((c) => (
              <li key={c.id}>
                <strong>{c.authorDisplayName}</strong>
                <p className="preserve-text">{c.body}</p>
                <time>{new Date(c.createdAt).toLocaleString()}</time>
              </li>
            ))}
        </ul>
      </QueryState>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!body.trim() || command.pending) return
          if (
            await command.run(`${root}/items/${itemId}/comments`, {
              body: body.trim(),
              visibility,
            })
          )
            setBody('')
        }}
      >
        <Field label="Comment">
          <textarea
            required
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        <button
          type="submit"
          className="secondary-button"
          disabled={command.pending}
        >
          Add comment
        </button>
      </form>
      <ErrorNotice error={command.error} />
    </Panel>
  )
}

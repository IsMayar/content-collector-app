import { Check, Copy, MessageCircle, History } from 'lucide-react'
import { useRef, useState } from 'react'
import { useData } from '@/services/api/resourceApi'
import { useCommand } from '@/shared/hooks/useCommand'
import { ErrorNotice, Field, QueryState } from '@/shared/components/ProductUI'
import { ConfirmDialog, Notice } from '@/shared/components/Feedback'
import { SubmittedAnswer } from '@/shared/components/SubmittedAnswer'
import { downloadFile } from '@/shared/utils/download'
import type { Item } from '@/features/structure-editor/types/structure.types'
import type {
  SubmissionSummary,
  Comment,
  ReviewCommand,
} from '../types/review.types'
import { answerText, useSubmittedRevision } from './SubmittedRevisionValue'
import { decisionResultSchema } from '../schemas/reviewSchema'
export function LiveRevisionReview({
  root,
  item,
  canMutate = true,
  canReview = true,
  initialRevision = '',
  contacts,
}: {
  root: string
  item: Item
  canMutate?: boolean
  canReview?: boolean
  initialRevision?: string
  contacts?: ReadonlyMap<string, string>
}) {
  const history = useData<{ data: SubmissionSummary[] }>(
    `${root}/items/${item.id}/revisions`,
  )
  const [selected, setSelected] = useState(initialRevision)
  const revisionId = selected || item.currentRevisionId || ''
  const detail = useSubmittedRevision(root, item.id, revisionId)
  const revision = detail.data?.revision
  const copy = revision ? answerText(revision) : null
  const [copiedRevision, setCopiedRevision] = useState('')
  const [copyError, setCopyError] = useState(false)

  async function copySubmittedAnswer() {
    if (copy === null || !revision) return
    try {
      await navigator.clipboard.writeText(copy)
      setCopiedRevision(revision.revisionId)
      setCopyError(false)
    } catch {
      setCopyError(true)
    }
  }
  const command = useCommand()
  const [intent, setIntent] = useState<
    | (Omit<ReviewCommand, 'decision'> & {
        decision: ReviewCommand['decision'] | 'REOPEN'
      })
    | null
  >(null)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const busy = useRef(false)
  const retry = useRef({ body: '', key: '' })
  const current =
    canReview &&
    canMutate &&
    !!revision &&
    item.state === 'SUBMITTED' &&
    revisionId === item.currentRevisionId &&
    !detail.isFetching
  async function confirm() {
    if (!intent || busy.current) return
    if (intent.decision !== 'APPROVE' && !reason.trim()) {
      setError('Explain the changes needed before sending feedback.')
      return
    }
    const body = {
      ...intent,
      reason: intent.decision !== 'APPROVE' ? reason.trim() : undefined,
    }
    const serialized = JSON.stringify(body)
    if (retry.current.body !== serialized)
      retry.current = { body: serialized, key: crypto.randomUUID() }
    busy.current = true
    setError('')
    setMessage('')
    try {
      const result = await command.run(
        `${root}/items/${item.id}/${intent.decision === 'REOPEN' ? 'reopen' : 'review-decisions'}`,
        body,
        'POST',
        { 'Idempotency-Key': retry.current.key },
      )
      if (!result) return
      if (intent.decision === 'REOPEN') {
        const reopened = result as {
          item?: { id?: string; state?: string; version?: number }
        }
        if (
          reopened.item?.id !== item.id ||
          reopened.item.state !== 'DRAFT' ||
          typeof reopened.item.version !== 'number'
        ) {
          setError(
            'The reopened state could not be verified. Refresh before continuing.',
          )
          return
        }
        setMessage('Item reopened. Historical approvals remain unchanged.')
        setIntent(null)
        setReason('')
        void detail.refetch()
        return
      }
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
      <div className="content-revision">
        {!revisionId && (
          <p>
            No current submission. Earlier versions, if any, are in History.
          </p>
        )}
        {revisionId && (
          <QueryState query={detail}>
            {revision && !detail.isFetching && (
              <>
                {/* The SubmittedAnswer component owns the visual answer surface.
                    This positioning wrapper is transparent: no second card or color. */}
                <div className="relative min-w-0">
                  <div
                    className={
                      copy !== null ? '[&>*:first-child]:!pt-14' : undefined
                    }
                  >
                    <SubmittedAnswer
                      schema={revision.schemaSnapshot}
                      value={revision.valueSnapshot}
                    />
                  </div>
                  {copy !== null && (
                    <button
                      type="button"
                      onClick={() => void copySubmittedAnswer()}
                      aria-label="Copy submitted answer"
                      title="Copy submitted answer"
                      className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border-0 bg-transparent px-2 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      {copiedRevision === revision.revisionId ? (
                        <Check size={15} aria-hidden="true" />
                      ) : (
                        <Copy size={15} aria-hidden="true" />
                      )}
                      <span>
                        {copiedRevision === revision.revisionId
                          ? 'Copied'
                          : 'Copy'}
                      </span>
                    </button>
                  )}
                  {copyError && (
                    <p role="status" className="mt-2 text-xs text-red-600">
                      Unable to copy. Check clipboard permissions and try again.
                    </p>
                  )}
                </div>
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
                <div className="revision-meta-actions">
                  <p className="subtle">
                    Submitted{' '}
                    <time dateTime={revision.submittedAt}>
                      {new Date(revision.submittedAt).toLocaleString()}
                    </time>{' '}
                    · Revision {revision.revisionNo}
                    {contacts?.get(revision.submittedByContactId) && (
                      <> · {contacts.get(revision.submittedByContactId)}</>
                    )}
                  </p>
                  <div className="revision-actions">
                    {canReview && (
                      <div className="actions">
                        <button
                          type="button"
                          className="secondary-button approve-revision-button"
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
                          <Check size={18} aria-hidden="true" /> Approve
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
                          <MessageCircle size={18} aria-hidden="true" /> Request
                          changes
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {canReview && !current && (
                  <Notice>
                    This revision is read-only. Only the current submitted
                    revision can receive a decision.
                  </Notice>
                )}
                {canReview &&
                  item.state === 'APPROVED' &&
                  revisionId === item.currentRevisionId && (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!canMutate || command.pending}
                      onClick={() => {
                        setReason('')
                        setError('')
                        setIntent({
                          revisionId,
                          expectedItemVersion: item.version,
                          decision: 'REOPEN',
                        })
                      }}
                    >
                      Reopen approved item
                    </button>
                  )}
                <ul
                  className="revision-decisions"
                  aria-label="Review decisions"
                >
                  {detail.data?.decisions?.map((d) => (
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
        {((history.data?.data.length || 0) > 1 ||
          (!item.currentRevisionId && !!history.data?.data.length)) && (
          <details className="revision-history">
            <summary>
              <History size={17} aria-hidden="true" /> History (
              {history.data?.data.length || 0})
            </summary>
            <QueryState query={history}>
              <ul aria-label="Submitted revisions">
                {history.data?.data.map((r) => (
                  <li key={r.revisionId}>
                    <button
                      type="button"
                      disabled={command.pending}
                      aria-pressed={revisionId === r.revisionId}
                      onClick={() => {
                        setSelected(r.revisionId)
                        setMessage('')
                      }}
                    >
                      <span>
                        Revision {r.revisionNo}
                        {r.revisionId === item.currentRevisionId && (
                          <span className="revision-current">Current</span>
                        )}
                      </span>
                      <time dateTime={r.submittedAt}>
                        {new Date(r.submittedAt).toLocaleString()}
                      </time>
                    </button>
                  </li>
                ))}
              </ul>
            </QueryState>
          </details>
        )}
        {history.isError && <QueryState query={history}>{null}</QueryState>}
        <ErrorNotice error={error || command.error} />
        {message && <p role="status">{message}</p>}
      </div>
      <ReviewComments root={root} itemId={item.id} canComment={canMutate} />
      <ConfirmDialog
        open={!!intent}
        pending={command.pending}
        title={
          intent?.decision === 'APPROVE'
            ? 'Approve this exact revision?'
            : intent?.decision === 'REOPEN'
              ? 'Reopen approved item?'
              : 'Request changes'
        }
        description={
          <>
            <p>
              You are deciding submitted revision {revision?.revisionNo}.
              Historical content stays unchanged.
            </p>
            {intent?.decision !== 'APPROVE' && (
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
          intent?.decision === 'APPROVE'
            ? 'Approve'
            : intent?.decision === 'REOPEN'
              ? 'Reopen item'
              : 'Send feedback'
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
  canComment = true,
}: {
  root: string
  itemId: string
  canComment?: boolean
}) {
  const query = useData<{ data: Comment[] }>(`${root}/items/${itemId}/comments`)
  const command = useCommand()
  const [visibility, setVisibility] = useState<'CLIENT' | 'INTERNAL'>('CLIENT')
  const [body, setBody] = useState('')
  return (
    <section className="content-conversation">
      <header>
        <h3>Conversation</h3>
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
      </header>
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
              <li key={c.id} className="conversation-message">
                <span className="conversation-avatar" aria-hidden="true">
                  {c.authorDisplayName.slice(0, 1)}
                </span>
                <strong>
                  {c.authorDisplayName}
                  {c.visibility === 'INTERNAL' && (
                    <span className="comment-author-role">Agency</span>
                  )}
                </strong>
                <p className="preserve-text">{c.body}</p>
                <time dateTime={c.createdAt}>
                  {new Date(c.createdAt).toLocaleString()}
                </time>
              </li>
            ))}
        </ul>
      </QueryState>
      {canComment && (
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
              placeholder="Write a comment…"
              rows={1}
              required
              maxLength={5000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
          <button
            type="submit"
            className="primary-button"
            disabled={command.pending}
          >
            Add comment
          </button>
        </form>
      )}
      <ErrorNotice error={command.error} />
    </section>
  )
}

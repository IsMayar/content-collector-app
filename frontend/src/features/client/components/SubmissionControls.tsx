import { useRef, useState } from 'react'
import { z } from 'zod'
import type { CollectionData } from '../schemas/collectionSchema'
import { pendingDrafts, type DraftAutosave } from '../hooks/draftAutosave'
import { useLazyReadDraftQuery } from '../api/clientAnswersApi'
import { useCommand } from '@/shared/hooks/useCommand'
import { ErrorNotice } from '@/shared/components/ProductUI'
const confirmation = z.object({
  revisionId: z.string().uuid(),
  revisionNo: z.number().int().positive(),
  itemVersion: z.number().int().positive(),
  state: z.literal('SUBMITTED'),
})
type Item = CollectionData['sections'][number]['items'][number]
export function SubmissionControls({
  item,
  projectId,
  structureVersion,
  draft,
  canRespond,
  onRefresh,
  onBusyChange,
}: {
  item: Item
  projectId: string
  structureVersion: number
  draft: DraftAutosave
  canRespond: boolean
  onRefresh: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const command = useCommand(true)
  const [read] = useLazyReadDraftQuery()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const locked = useRef(false)
  const attempt = useRef({ hash: '', key: '' })
  const pending = item.assets.some((a) =>
    ['RESERVED', 'UPLOADED', 'PROCESSING'].includes(a.state),
  )
  async function act(withdraw = false) {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    onBusyChange(true)
    setMessage('')
    try {
      if (!navigator.onLine) {
        setMessage('You are offline. Reconnect before submitting.')
        return
      }
      const drafts = [...pendingDrafts.entries()]
        .filter(([key]) => key.startsWith(projectId + '/'))
        .map(([, d]) => d)
      if (!(await Promise.all(drafts.map((d) => d.flush()))).every(Boolean)) {
        setMessage('Save or reconcile your unsaved answers before submitting.')
        return
      }
      const latest = await read({ projectId, itemId: item.id }, false).unwrap()
      const body = withdraw
        ? { expectedItemVersion: item.version }
        : {
            expectedAnswerVersion: latest.answer.version,
            expectedStructureVersion: structureVersion,
          }
      const hash = JSON.stringify({ withdraw, body })
      if (attempt.current.hash !== hash)
        attempt.current = { hash, key: crypto.randomUUID() }
      const result = await command.run(
        `client/projects/${projectId}/items/${item.id}/${withdraw ? 'withdraw' : 'submit'}`,
        body,
        'POST',
        { 'Idempotency-Key': attempt.current.key },
      )
      if (result) {
        if (!withdraw && !confirmation.safeParse(result).success) {
          setMessage(
            'The confirmation could not be verified. Reload to check the submitted status before trying again.',
          )
          return
        }
        setMessage(
          withdraw
            ? 'Returned to draft. Previous submitted versions are preserved.'
            : `Submitted successfully. Revision ${confirmation.parse(result).revisionNo} is saved.`,
        )
        draft.pause()
        pendingDrafts.delete(projectId + '/' + item.id)
        setConfirm(false)
        onRefresh()
      }
    } catch {
      setMessage(
        'We could not confirm the result. Reconnect and reload to check your saved status; retrying this action uses the same request.',
      )
    } finally {
      locked.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }
  return (
    <section
      className="client-submission-controls"
      aria-label={'Submission for ' + item.label}
    >
      <p
        role={message || item.state === 'SUBMITTED' ? 'status' : undefined}
        aria-live="polite"
      >
        {message ||
          (item.state === 'SUBMITTED'
            ? 'Submitted for review. Withdraw to edit.'
            : item.state === 'APPROVED'
              ? 'Approved. Ask your agency if changes are needed.'
              : item.state === 'CHANGES_REQUESTED'
                ? 'Changes requested. Update your draft before submitting a new revision.'
                : 'Save a draft now. Submit when you’re ready.')}
      </p>
      <ErrorNotice error={command.error} />
      {pending && (
        <p role="status">
          Wait for all files for this question to finish uploading and
          verification.
        </p>
      )}
      {canRespond && item.canEdit && (
        <button
          type="button"
          className="primary-button"
          disabled={busy || pending}
          onClick={() => setConfirm(true)}
        >
          Review and submit
        </button>
      )}
      {confirm && (
        <div
          className="client-submit-confirmation"
          role="group"
          aria-label="Confirm submission"
        >
          <p>
            Submit this saved answer and its verified files? You can withdraw it
            while it awaits review.
          </p>
          <button
            type="button"
            className="primary-button"
            disabled={busy || pending}
            onClick={() => void act()}
          >
            {busy ? 'Submitting…' : 'Submit for review'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirm(false)}
          >
            Keep editing
          </button>
        </div>
      )}
      {canRespond && item.state === 'SUBMITTED' && (
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => void act(true)}
        >
          Withdraw to edit
        </button>
      )}
    </section>
  )
}

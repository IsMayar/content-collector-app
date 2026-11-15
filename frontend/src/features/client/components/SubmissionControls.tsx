import { useRef, useState } from 'react'
import { z } from 'zod'
import { ArrowRight } from 'lucide-react'

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

  const pending = item.assets.some((asset) =>
    ['RESERVED', 'UPLOADED', 'PROCESSING'].includes(asset.state),
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
        .map(([, currentDraft]) => currentDraft)

      const results = await Promise.all(
        drafts.map((currentDraft) => currentDraft.flush()),
      )

      if (!results.every(Boolean)) {
        setMessage(
          'Some answers are not saved yet. Check your drafts before submitting.',
        )
        return
      }

      const latest = await read({ projectId, itemId: item.id }, false).unwrap()

      const body = withdraw
        ? {
            expectedItemVersion: item.version,
          }
        : {
            expectedAnswerVersion: latest.answer.version,
            expectedStructureVersion: structureVersion,
          }

      const hash = JSON.stringify({ withdraw, body })

      if (attempt.current.hash !== hash) {
        attempt.current = {
          hash,
          key: crypto.randomUUID(),
        }
      }

      const result = await command.run(
        `client/projects/${projectId}/items/${item.id}/${
          withdraw ? 'withdraw' : 'submit'
        }`,
        body,
        'POST',
        {
          'Idempotency-Key': attempt.current.key,
        },
      )

      if (!result) return

      if (!withdraw && !confirmation.safeParse(result).success) {
        setMessage(
          'Submission could not be verified. Reload to check its status before trying again.',
        )
        return
      }

      setMessage(
        withdraw
          ? 'Returned to draft. Previous submissions are preserved.'
          : `Submitted successfully. Version ${
              confirmation.parse(result).revisionNo
            } is saved.`,
      )

      draft.pause()
      pendingDrafts.delete(projectId + '/' + item.id)

      setConfirm(false)
      onRefresh()
    } catch {
      setMessage(
        'We could not confirm the result. Reconnect and reload to check its status before trying again.',
      )
    } finally {
      locked.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }

  return (
    <section
      aria-label={'Submission for ' + item.label}
      className="flex min-w-0 flex-col items-end gap-1"
    >
      {/* Main submission button */}
      {canRespond && item.canEdit && (
        <button
          type="button"
          disabled={busy || pending}
          onClick={() => setConfirm(true)}
          className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-3.5 text-[13px] font-semibold whitespace-nowrap text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Review and submit
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      )}

      {/* Allow withdrawal while awaiting review */}
      {canRespond && item.state === 'SUBMITTED' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void act(true)}
          className="inline-flex h-9 cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Withdraw to edit
        </button>
      )}

      {/* Confirmation displayed only when submitting */}
      {confirm && (
        <div
          role="group"
          aria-label="Confirm submission"
          className="w-full max-w-sm space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-left"
        >
          <p className="text-[13px] leading-5 text-slate-700">
            Submit this answer and its verified files for review? You can
            withdraw it while it awaits review.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || pending}
              onClick={() => void act()}
              className="inline-flex min-h-9 cursor-pointer items-center rounded-md bg-blue-600 px-3 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Submitting…' : 'Confirm submission'}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm(false)}
              className="inline-flex min-h-9 cursor-pointer items-center rounded-md px-3 text-[13px] font-medium text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Keep editing
            </button>
          </div>
        </div>
      )}

      {/* Only show feedback after an action, not duplicate status text */}
      {message && (
        <p
          role="status"
          aria-live="polite"
          className="max-w-sm text-right text-xs leading-5 text-slate-600"
        >
          {message}
        </p>
      )}

      {/* File processing warning */}
      {pending && (
        <p
          role="status"
          className="max-w-sm text-right text-xs leading-5 text-amber-700"
        >
          Wait for your files to finish uploading and verification.
        </p>
      )}

      {/* Backend errors */}
      {command.error && (
        <div className="w-full max-w-sm text-left">
          <ErrorNotice error={command.error} />
        </div>
      )}
    </section>
  )
}

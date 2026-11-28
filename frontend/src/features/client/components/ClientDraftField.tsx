import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleAlert,
  Eraser,
  MessageCircle,
} from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { ConfirmDialog } from '@/shared/components/Feedback'
import { AiAssistant } from '@/features/ai/components/AiAssistant'
import { ClientComments } from '@/features/review/components/ClientComments'
import { initialValue } from '@/shared/utils/domain'
import { useInteraction } from '../hooks/useInteraction'
import { useSaveDraftMutation } from '../api/clientAnswersApi'
import { DraftAutosave, pendingDrafts } from '../hooks/draftAutosave'
import type { CollectionData } from '../schemas/collectionSchema'
import type { AnswerValue } from '../types/client.types'

import { TypedValue } from './TypedValue'
import { ClientSubmissionHistory } from './ClientSubmissionHistory'
import { SubmissionControls } from './SubmissionControls'

type Item = CollectionData['sections'][number]['items'][number]

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '')
}

function usefulInstructions(label: string, instructions?: string | null) {
  const original = instructions?.trim() || ''
  if (!original) return ''

  const question = normalizeText(label)
  const instruction = normalizeText(original)

  const duplicates = [
    question,
    `provide accurate ${question}`,
    `please provide ${question}`,
    `provide ${question}`,
    `enter ${question}`,
  ]

  return duplicates.includes(instruction) ? '' : original
}

export function ClientDraftField({
  item,
  expanded,
  onToggle,
  projectId,
  structureVersion,
  onSaved,
  canUpload = false,
  canRespond = false,
  aiEnabled = false,
}: {
  item: Item
  expanded: boolean
  onToggle: () => void
  projectId: string
  structureVersion: number
  onSaved: () => void
  canUpload?: boolean
  canRespond?: boolean
  aiEnabled?: boolean
}) {
  const interaction = useInteraction(projectId)

  const [clearOpen, setClearOpen] = useState(false)
  const [conversationLoaded, setConversationLoaded] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [save] = useSaveDraftMutation()

  const [draft] = useState(() => {
    const key = projectId + '/' + item.id
    let existing = pendingDrafts.get(key)

    if (!existing) {
      existing = new DraftAutosave(
        (item.answer?.value || initialValue(item.type)) as AnswerValue,
        item.answer?.version || 0,
        structureVersion,
        async (command) => {
          const result = await save({
            projectId,
            itemId: item.id,
            command,
          }).unwrap()

          onSaved()
          return result
        },
      )

      pendingDrafts.set(key, existing)
    }

    return existing
  })

  const state = useSyncExternalStore(draft.subscribe, draft.snapshot)

  const form = useForm<{ value: AnswerValue }>({
    values: { value: state.value },
  })

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (draft.state.dirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', beforeUnload)

    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      draft.pause()
    }
  }, [draft])

  const instructions = usefulInstructions(item.label, item.instructions)

  const statusLabel =
    item.state === 'NOT_STARTED'
      ? 'To do'
      : item.state === 'DRAFT'
        ? 'Draft'
        : item.state === 'SUBMITTED'
          ? 'Submitted'
          : item.state === 'APPROVED'
            ? 'Approved'
            : 'Changes requested'

  const statusColor =
    item.state === 'APPROVED'
      ? 'text-emerald-700'
      : item.state === 'SUBMITTED'
        ? 'text-blue-700'
        : item.state === 'CHANGES_REQUESTED'
          ? 'text-amber-700'
          : 'text-slate-500'

  const saveStatus = !item.canEdit
    ? item.state === 'APPROVED'
      ? ''
      : item.state === 'SUBMITTED'
        ? 'Submitted · read-only'
        : 'Editing unavailable'
    : state.conflict
      ? 'Save conflict'
      : state.error
        ? 'Not saved'
        : state.dirty
          ? state.status || 'Unsaved changes'
          : state.status === 'No saved answer'
            ? ''
            : state.status || 'Saved'

  const isTextAnswer = item.type === 'SHORT_TEXT' || item.type === 'LONG_TEXT'

  const characterCount = isTextAnswer
    ? String((state.value as { text?: string }).text || '').length
    : 0

  const maxCharacters =
    item.validation.maxLength || (item.type === 'SHORT_TEXT' ? 200 : 10000)

  return (
    <article
      id={'item-' + item.id}
      aria-labelledby={'question-' + item.id}
      onFocusCapture={() => interaction(item.id)}
      className="client-question border-b border-slate-200 last:border-b-0"
    >
      {/* Question header */}
      <h3 className="m-0 text-sm font-semibold">
        <button
          type="button"
          id={'question-' + item.id}
          aria-expanded={expanded}
          aria-controls={'answer-body-' + item.id}
          onClick={onToggle}
          className="client-question-trigger flex w-full cursor-pointer items-center gap-3 rounded-md px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500 sm:px-5"
        >
          <span
            aria-hidden="true"
            className={
              item.state === 'APPROVED'
                ? 'shrink-0 text-emerald-600'
                : item.state === 'SUBMITTED'
                  ? 'shrink-0 text-blue-600'
                  : item.state === 'CHANGES_REQUESTED'
                    ? 'shrink-0 text-amber-600'
                    : 'shrink-0 text-slate-400'
            }
          >
            {['SUBMITTED', 'APPROVED'].includes(item.state) ? (
              <Check size={18} strokeWidth={2.5} />
            ) : item.state === 'CHANGES_REQUESTED' ? (
              <CircleAlert size={18} />
            ) : (
              <Circle size={18} />
            )}
          </span>

          <span className="min-w-0 flex-1 text-[14px] leading-5 font-semibold text-slate-900 sm:text-[15px]">
            {item.label}
            {item.required && (
              <span className="client-required" aria-label="Required"> *</span>
            )}
          </span>

          <span className={`client-status client-status-${item.state.toLowerCase()} shrink-0 text-xs font-medium ${statusColor}`}>
            {statusLabel}
          </span>

          {expanded ? (
            <ChevronDown
              size={17}
              aria-hidden="true"
              className="shrink-0 text-slate-500"
            />
          ) : (
            <ChevronRight
              size={17}
              aria-hidden="true"
              className="shrink-0 text-slate-500"
            />
          )}
        </button>
      </h3>

      <div
        id={'answer-body-' + item.id}
        hidden={!expanded}
        className="client-question-content px-4 pt-0 pb-3 sm:px-5"
      >
        {instructions && (
          <p className="mb-2 text-[13px] leading-5 text-slate-600">
            {instructions}
          </p>
        )}

        {/* Autosaved answer */}
        <form
          id={'answer-form-' + item.id}
          aria-describedby={[
            'save-' + item.id,
            ...(state.error ? ['error-' + item.id] : []),
          ].join(' ')}
          onSubmit={(event) => {
            event.preventDefault()
            void draft.flush()
          }}
          onBlur={(event) => {
            if (
              ['INPUT', 'TEXTAREA', 'SELECT'].includes(
                (event.target as HTMLElement).tagName,
              )
            ) {
              void draft.flush()
            }
          }}
        >
          <Controller
            control={form.control}
            name="value"
            render={({ field }) => (
              <TypedValue
                item={item}
                value={field.value}
                compact
                onChange={(value) => {
                  field.onChange(value)
                  draft.edit(value)
                }}
                disabled={!item.canEdit || submitting || aiBusy}
                root={`client/projects/${projectId}`}
                uploadsUnavailable={!canUpload}
                liveUploads={canUpload}
                currentValue={() => draft.state.value}
                onFilesChanged={onSaved}
                beforeDelete={() => draft.flush()}
              />
            )}
          />

          {/* Saved and character count share one row */}
          <div className="mt-1 flex min-h-5 items-center justify-between gap-3">
            <div
              id={'save-' + item.id}
              role="status"
              aria-live="polite"
              className="flex min-w-0 items-center gap-1.5"
            >
              {!state.dirty &&
                !state.error &&
                !state.conflict &&
                item.canEdit &&
                saveStatus && (
                  <Check
                    size={14}
                    aria-hidden="true"
                    className="shrink-0 text-emerald-600"
                  />
                )}

              <span
                className={`text-xs leading-4 ${
                  state.error || state.conflict
                    ? 'text-red-600'
                    : state.dirty
                      ? 'text-amber-700'
                      : 'text-slate-500'
                }`}
              >
                {saveStatus}
              </span>
            </div>

            {isTextAnswer && (
              <span className="shrink-0 text-xs tabular-nums text-slate-500">
                {characterCount.toLocaleString()} /{' '}
                {maxCharacters.toLocaleString()} characters
              </span>
            )}
          </div>

          {state.error && (
            <p
              id={'error-' + item.id}
              role="alert"
              className="mt-1 text-xs leading-5 text-red-700"
            >
              {state.error}
            </p>
          )}
        </form>

        {/* AI assistance remains available */}
        {aiEnabled &&
          item.type === 'LONG_TEXT' &&
          item.ai?.enabled &&
          item.canEdit && (
            <div className="mt-2">
              <AiAssistant
                root={`client/projects/${projectId}`}
                item={{
                  id: item.id,
                  ai: item.ai,
                  answer: { value: state.value },
                }}
                answerVersion={state.version}
                dirty={state.dirty || !!state.conflict || submitting || aiBusy}
                onBusyChange={setAiBusy}
                beforeAccept={() =>
                  !draft.state.dirty &&
                  !draft.state.conflict &&
                  draft.state.version === state.version
                }
                onAccepted={(answer) => {
                  draft.applyAccepted(answer, answer.version - 1)
                  onSaved()
                }}
              />
            </div>
          )}

        {/*
          Compact action row:
          - No top border
          - Only 4px above the buttons
          - Both buttons are 36px tall
        */}
        <div className="client-question-actions mt-3 mb-2 flex flex-wrap items-center justify-between gap-2">
          {item.canEdit ? (
            <button
              type="button"
              disabled={submitting || aiBusy}
              onClick={() => setClearOpen(true)}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-red-200 bg-white px-3 text-[13px] font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Eraser size={15} aria-hidden="true" />
              Clear answer
            </button>
          ) : (
            <span />
          )}

          <SubmissionControls
            item={item}
            projectId={projectId}
            structureVersion={structureVersion}
            draft={draft}
            canRespond={canRespond && !aiBusy}
            onRefresh={onSaved}
            onBusyChange={setSubmitting}
          />
        </div>

        <ConfirmDialog
          open={clearOpen}
          title="Clear this answer?"
          description="Your current draft will be cleared. Previous submitted revisions and uploaded files will be preserved."
          confirmLabel="Clear answer"
          pending={submitting || aiBusy}
          onCancel={() => setClearOpen(false)}
          onConfirm={() => {
            if (!item.canEdit || submitting || aiBusy) return

            draft.edit(initialValue(item.type) as AnswerValue)
            setClearOpen(false)
          }}
        />

        {/* Version history */}
        <div className="border-t border-slate-100 py-1">
          <ClientSubmissionHistory
            projectId={projectId}
            itemId={item.id}
            active={expanded}
            hasSavedAnswer={state.version > 0}
            currentRevisionId={item.currentRevisionId}
            currentState={item.state}
          />
        </div>

        {/* Comments */}
        <details
          className="client-comment-disclosure group border-t border-slate-100"
          onToggle={(event) => {
            if (event.currentTarget.open) {
              setConversationLoaded(true)
            }
          }}
        >
          <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 rounded-md py-1 text-[13px] font-medium text-slate-700 transition-colors hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <MessageCircle
                size={16}
                aria-hidden="true"
                className="text-slate-500"
              />
              Ask a question / comments
            </span>

            <ChevronDown
              size={16}
              aria-hidden="true"
              className="text-slate-500 transition-transform group-open:rotate-180"
            />
          </summary>

          {conversationLoaded && (
            <div className="pb-2 pt-1">
              <ClientComments
                projectId={projectId}
                itemId={item.id}
                canRespond={canRespond && !aiBusy}
              />
            </div>
          )}
        </details>

        {/* Conflict recovery remains unchanged */}
        {state.conflict && (
          <section
            aria-label="Compare draft versions"
            className="mt-3 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4"
          >
            <h4 className="text-sm font-semibold text-amber-950">
              Your answer needs attention
            </h4>

            <p className="text-xs leading-5 text-amber-900">
              Another saved version is available. Compare both versions before
              choosing which one to keep.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <h5 className="mb-1 text-xs font-semibold text-slate-800">
                  Your unsaved answer
                </h5>

                <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-md border border-amber-200 bg-white p-3 text-xs text-slate-800">
                  {JSON.stringify(state.value, null, 2)}
                </pre>
              </div>

              <div className="min-w-0">
                <h5 className="mb-1 text-xs font-semibold text-slate-800">
                  Saved answer
                </h5>

                <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-md border border-amber-200 bg-white p-3 text-xs text-slate-800">
                  {JSON.stringify(state.conflict.value, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => draft.loadServer()}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Use saved answer
              </button>

              <button
                type="button"
                onClick={() => {
                  draft.keepLocal()
                  void draft.flush()
                }}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
              >
                Keep and save my answer
              </button>
            </div>
          </section>
        )}
      </div>
    </article>
  )
}

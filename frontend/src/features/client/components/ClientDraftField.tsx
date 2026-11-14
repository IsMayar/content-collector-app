import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleAlert,
  Save,
  Eraser,
} from 'lucide-react'
import { ConfirmDialog } from '@/shared/components/Feedback'
import { useInteraction } from '../hooks/useInteraction'
import { AiAssistant } from '@/features/ai/components/AiAssistant'
import { ClientComments } from '@/features/review/components/ClientComments'
import { ClientSubmissionHistory } from './ClientSubmissionHistory'
import { SubmissionControls } from './SubmissionControls'
import { useState, useSyncExternalStore, useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { TypedValue } from './TypedValue'
import {
  useSaveDraftMutation,
  useLazyReadDraftQuery,
} from '../api/clientAnswersApi'
import { DraftAutosave, pendingDrafts } from '../hooks/draftAutosave'
import type { CollectionData } from '../schemas/collectionSchema'
import type { AnswerValue } from '../types/client.types'
import { initialValue } from '@/shared/utils/domain'
type Item = CollectionData['sections'][number]['items'][number]
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
  const [read] = useLazyReadDraftQuery()
  const [draft] = useState(() => {
    const key = projectId + '/' + item.id
    let d = pendingDrafts.get(key)
    if (!d) {
      d = new DraftAutosave(
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
      pendingDrafts.set(key, d)
    }
    return d
  })
  const state = useSyncExternalStore(draft.subscribe, draft.snapshot)
  const form = useForm<{ value: AnswerValue }>({
    values: { value: state.value },
  })
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (draft.state.dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', before)
    return () => {
      window.removeEventListener('beforeunload', before)
      draft.pause()
    }
  }, [draft])
  return (
    <article
      onFocusCapture={() => interaction(item.id)}
      id={'item-' + item.id}
      className="client-question"
      aria-labelledby={'question-' + item.id}
    >
      <h3 className="client-question-heading">
        <button
          type="button"
          id={'question-' + item.id}
          className="client-question-toggle"
          aria-expanded={expanded}
          aria-controls={'answer-body-' + item.id}
          onClick={onToggle}
        >
          <span
            className={
              'client-question-state state-' + item.state.toLowerCase()
            }
            aria-hidden="true"
          >
            {['SUBMITTED', 'APPROVED'].includes(item.state) ? (
              <Check size={13} />
            ) : item.state === 'CHANGES_REQUESTED' ? (
              <CircleAlert size={18} />
            ) : (
              <Circle size={18} />
            )}
          </span>
          <span className="client-question-label">{item.label}</span>
          {item.required && <span className="client-required">Required</span>}
          <span className="client-question-status">
            {item.state === 'NOT_STARTED'
              ? 'Not started'
              : item.state === 'DRAFT'
                ? 'Draft'
                : item.state === 'SUBMITTED'
                  ? 'Submitted'
                  : item.state === 'APPROVED'
                    ? 'Approved'
                    : 'Changes requested'}
          </span>
          {expanded ? (
            <ChevronDown
              className="client-question-chevron expanded"
              size={18}
              aria-hidden="true"
            />
          ) : (
            <ChevronRight
              className="client-question-chevron"
              size={18}
              aria-hidden="true"
            />
          )}
        </button>
      </h3>
      <div
        className="client-question-body"
        id={'answer-body-' + item.id}
        hidden={!expanded}
      >
        {item.instructions && (
          <p className="client-question-instructions">{item.instructions}</p>
        )}
        <form
          id={'answer-form-' + item.id}
          onSubmit={(e) => {
            e.preventDefault()
            void draft.flush()
          }}
          onBlur={(e) => {
            if (
              ['INPUT', 'TEXTAREA', 'SELECT'].includes(
                (e.target as HTMLElement).tagName,
              )
            )
              void draft.flush()
          }}
          aria-describedby={'save-' + item.id + ' error-' + item.id}
        >
          <Controller
            control={form.control}
            name="value"
            render={({ field }) => (
              <TypedValue
                item={item}
                value={field.value}
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
          <p id={'save-' + item.id} role="status" aria-live="polite">
            {!item.canEdit
              ? item.state === 'APPROVED'
                ? 'Approved answer · read-only'
                : item.state === 'SUBMITTED'
                  ? 'Submitted answer · read-only'
                  : 'Editing is currently unavailable.'
              : state.status === 'No saved answer'
                ? 'Add your response to get started.'
                : state.status}
          </p>
          {state.error && (
            <p id={'error-' + item.id} role="alert">
              {state.error}
            </p>
          )}
        </form>
        {aiEnabled &&
          item.type === 'LONG_TEXT' &&
          item.ai?.enabled &&
          item.canEdit && (
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
          )}
        <div className="client-answer-actions">
          {item.canEdit && (
            <div className="client-draft-actions">
              <button
                type="submit"
                form={'answer-form-' + item.id}
                className="secondary-button"
                disabled={submitting || aiBusy}
              >
                <Save size={16} aria-hidden="true" /> Save draft
              </button>
              <button
                type="button"
                className="text-link client-clear-answer"
                disabled={submitting || aiBusy}
                onClick={() => setClearOpen(true)}
              >
                <Eraser size={15} aria-hidden="true" /> Clear answer
              </button>
              {state.error && (
                <button
                  type="button"
                  onClick={async () => {
                    if (state.status.startsWith('Conflict')) {
                      try {
                        const result = await read(
                          { projectId, itemId: item.id },
                          false,
                        ).unwrap()
                        draft.compare(result.answer)
                      } catch {
                        /* Error remains visible; no local answer is discarded. */
                      }
                    } else void draft.flush()
                  }}
                >
                  {' '}
                  {state.status.startsWith('Conflict')
                    ? 'Compare saved answer'
                    : 'Retry save'}
                </button>
              )}
            </div>
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
          description="This will clear your current draft and autosave the change. Submitted revisions and uploaded files will be kept."
          confirmLabel="Clear answer"
          pending={submitting || aiBusy}
          onCancel={() => setClearOpen(false)}
          onConfirm={() => {
            if (!item.canEdit || submitting || aiBusy) return
            draft.edit(initialValue(item.type) as AnswerValue)
            setClearOpen(false)
          }}
        />
        <ClientSubmissionHistory
          projectId={projectId}
          itemId={item.id}
          active={expanded}
          hasSavedAnswer={state.version > 0}
          currentRevisionId={item.currentRevisionId}
          currentState={item.state}
        />
        <details
          className="client-conversation-disclosure"
          onToggle={(event) => {
            if (event.currentTarget.open) setConversationLoaded(true)
          }}
        >
          <summary>
            Conversation <span>Messages with your agency</span>
          </summary>
          {conversationLoaded && (
            <ClientComments
              projectId={projectId}
              itemId={item.id}
              canRespond={canRespond && !aiBusy}
            />
          )}
        </details>
        {state.conflict && (
          <section aria-label="Compare draft versions">
            <h4>Your unsaved answer</h4>
            <pre>{JSON.stringify(state.value, null, 2)}</pre>
            <h4>Saved answer</h4>
            <pre>{JSON.stringify(state.conflict.value, null, 2)}</pre>
            <button onClick={() => draft.loadServer()}>
              Load saved answer
            </button>
            <button
              onClick={() => {
                draft.keepLocal()
                void draft.flush()
              }}
            >
              Save my answer against this version
            </button>
          </section>
        )}
      </div>
    </article>
  )
}

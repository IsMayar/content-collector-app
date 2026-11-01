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
  projectId,
  structureVersion,
  onSaved,
  canUpload = false,
  canRespond = false,
}: {
  item: Item
  projectId: string
  structureVersion: number
  onSaved: () => void
  canUpload?: boolean
  canRespond?: boolean
}) {
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
      id={'item-' + item.id}
      className="product-panel"
      aria-labelledby={'question-' + item.id}
    >
      <h3 className="answer-title" id={'question-' + item.id}>
        {item.label}
      </h3>
      <p>{item.instructions}</p>
      <small>{item.required ? 'Required for submission' : 'Optional'}</small>
      {item.example && (
        <details>
          <summary>Example answer</summary>
          <p>{item.example}</p>
        </details>
      )}
      <form
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
              disabled={!item.canEdit || submitting}
              root={`client/projects/${projectId}`}
              preview={!canUpload}
              liveUploads={canUpload}
              currentValue={() => draft.state.value}
              onFilesChanged={onSaved}
              beforeDelete={() => draft.flush()}
            />
          )}
        />
        <p id={'save-' + item.id} role="status" aria-live="polite">
          {state.status}
        </p>
        {state.error && (
          <p id={'error-' + item.id} role="alert">
            {state.error}
          </p>
        )}
        {item.canEdit && (
          <div className="actions">
            <button
              type="submit"
              className="secondary-button"
              disabled={submitting}
            >
              Save draft
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={submitting}
              onClick={() => draft.edit({} as AnswerValue)}
            >
              Clear answer
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
      </form>
      <SubmissionControls
        item={item}
        projectId={projectId}
        structureVersion={structureVersion}
        draft={draft}
        canRespond={canRespond}
        onRefresh={onSaved}
        onBusyChange={setSubmitting}
      />
      <ClientSubmissionHistory projectId={projectId} itemId={item.id} />
      <ClientComments
        projectId={projectId}
        itemId={item.id}
        canRespond={canRespond}
      />
      {state.conflict && (
        <section aria-label="Compare draft versions">
          <h4>Your unsaved answer</h4>
          <pre>{JSON.stringify(state.value, null, 2)}</pre>
          <h4>Saved answer</h4>
          <pre>{JSON.stringify(state.conflict.value, null, 2)}</pre>
          <button onClick={() => draft.loadServer()}>Load saved answer</button>
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
    </article>
  )
}

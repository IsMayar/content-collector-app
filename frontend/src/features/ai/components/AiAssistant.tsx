import type { AiDraftJob } from '@/features/ai/types/ai.types'
import type { Answer, ClientItem } from '@/features/client/types/client.types'
import {
  aiCommandSchema,
  aiCreatedSchema,
  aiAcceptedSchema,
} from '../schemas/aiSchema'
import { usePortalData } from '@/services/api/resourceApi'
import { ConfirmDialog, Notice } from '@/shared/components/Feedback'
import { Badge, ErrorNotice, Field, Panel } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useRef, useState } from 'react'

export function AiAssistant({
  root,
  item,
  answerVersion,
  dirty,
  onAccepted,
  onBusyChange,
  beforeAccept,
}: {
  root: string
  item: Pick<ClientItem, 'id' | 'ai'> & { answer: { value: Answer['value'] } }
  answerVersion: number
  dirty: boolean
  onAccepted: (answer: Answer) => void
  onBusyChange?: (busy: boolean) => void
  beforeAccept?: () => boolean
}) {
  const command = useCommand(true)
  const [job, setJob] = useState(''),
    [facts, setFacts] = useState(''),
    [message, setMessage] = useState(''),
    [confirm, setConfirm] = useState(false),
    [polling, setPolling] = useState(false),
    [accepted, setAccepted] = useState(''),
    [uncertain, setUncertain] = useState(false)
  const [original, setOriginal] = useState(item.answer.value)
  const busy = useRef(false),
    retry = useRef({ body: '', key: '' }),
    acceptRetry = useRef({ body: '', key: '' })
  const q = usePortalData<{ job: AiDraftJob }>(
    job ? `${root}/ai-drafts/${job}` : '',
    { pollingInterval: polling ? 1000 : 0 },
  )
  const result = q.data?.job?.id === job ? q.data.job : undefined
  if (polling && result && !['QUEUED', 'RUNNING'].includes(result.state))
    setPolling(false)
  const preview =
    !!result?.result && ['SUCCEEDED', 'ACCEPTED'].includes(result.state)
  const unavailable =
    dirty ||
    command.pending ||
    (!!result && ['QUEUED', 'RUNNING'].includes(result.state))
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setMessage('Text copied. Nothing was saved or submitted.')
    } catch {
      setMessage(
        'Copy was unavailable. Select the displayed text to copy it manually.',
      )
    }
  }
  async function accept() {
    if (
      !result?.result ||
      (result.state !== 'SUCCEEDED' &&
        !(result.state === 'ACCEPTED' && uncertain)) ||
      accepted === result.id ||
      dirty ||
      result.baseAnswerVersion !== answerVersion ||
      beforeAccept?.() === false
    )
      return
    const body = { expectedAnswerVersion: answerVersion },
      serialized = JSON.stringify({ job: result.id, ...body })
    if (acceptRetry.current.body !== serialized)
      acceptRetry.current = { body: serialized, key: crypto.randomUUID() }
    busy.current = true
    onBusyChange?.(true)
    setMessage('')
    try {
      const response = await command.run<unknown>(
        `${root}/ai-drafts/${result.id}/accept`,
        body,
        'POST',
        { 'Idempotency-Key': acceptRetry.current.key },
      )
      if (!response) {
        setUncertain(true)
        return
      }
      const parsed = aiAcceptedSchema.safeParse(response)
      if (
        !parsed.success ||
        parsed.data.answer.itemId !== item.id ||
        parsed.data.answer.version !== answerVersion + 1 ||
        parsed.data.answer.value.text !== result.result.draft
      ) {
        setMessage(
          'The service returned an incompatible acceptance response. Your local answer has been kept.',
        )
        return
      }
      setUncertain(false)
      setAccepted(result.id)
      setConfirm(false)
      onAccepted(parsed.data.answer)
      setMessage(
        'Suggestion saved as an ordinary draft. It has not been submitted.',
      )
      acceptRetry.current = { body: '', key: '' }
    } finally {
      busy.current = false
      onBusyChange?.(false)
    }
  }
  return (
    <Panel
      title={preview ? 'Review your AI suggestion' : 'Create a draft with AI'}
    >
      <p>
        Optional assistance. Only these facts and this question’s instructions
        are sent to the AI provider. Check every claim before using a
        suggestion.
      </p>
      <p className="subtle">
        Generating, copying or discarding a suggestion never saves or submits
        your answer. Regeneration uses your remaining allowance.
      </p>
      <form
        hidden={preview}
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault()
          if (unavailable || busy.current) return
          const v = new FormData(e.currentTarget)
          const parsed = aiCommandSchema.safeParse({
            facts: facts
              .split('\n')
              .map((f) => f.trim())
              .filter(Boolean),
            tone: v.get('tone'),
            targetWords: Number(v.get('words')),
            baseAnswerVersion: answerVersion,
            consent: v.has('consent'),
          })
          if (!parsed.success) {
            setMessage(
              parsed.error.issues[0]?.message ||
                'Check your facts and consent.',
            )
            return
          }
          const serialized = JSON.stringify(parsed.data)
          if (retry.current.body !== serialized)
            retry.current = { body: serialized, key: crypto.randomUUID() }
          busy.current = true
          setMessage('')
          try {
            const response = await command.run<unknown>(
              `${root}/items/${item.id}/ai-drafts`,
              parsed.data,
              'POST',
              { 'Idempotency-Key': retry.current.key },
            )
            if (!response) return
            const queued = aiCreatedSchema.safeParse(response)
            if (!queued.success) {
              setMessage(
                'The service returned an incompatible AI response. Your notes and answer are unchanged.',
              )
              return
            }
            setOriginal(item.answer.value)
            setJob(queued.data.jobId)
            setPolling(true)
            setAccepted('')
            setUncertain(false)
            retry.current = { body: '', key: '' }
          } finally {
            busy.current = false
          }
        }}
      >
        <Field label="Facts to include (one per line)">
          <textarea
            value={facts}
            onChange={(e) => setFacts(e.target.value)}
            required
            maxLength={5000}
            placeholder="Add three to five facts you know to be true"
          />
        </Field>
        <div className="form-grid">
          <Field label="Tone">
            <select name="tone">
              <option>Clear and friendly</option>
              <option>Professional</option>
              <option>Concise</option>
            </select>
          </Field>
          <Field label="Target words">
            <input
              name="words"
              type="number"
              min={30}
              max={500}
              defaultValue={item.ai?.targetWords || 150}
            />
          </Field>
        </div>
        <label className="check-row">
          <input required name="consent" type="checkbox" />I consent to sending
          these facts and item instructions to the AI provider. I will review
          the suggestion.
        </label>
        {dirty && (
          <Notice>
            Save your draft before generating or accepting a suggestion.
          </Notice>
        )}
        <button className="secondary-button" disabled={unavailable}>
          Draft from my notes
        </button>
      </form>
      {!confirm && <ErrorNotice error={command.error} />}
      <ErrorNotice
        error={
          q.isError
            ? 'The suggestion could not be loaded. Your answer is unchanged.'
            : ''
        }
      />
      {!confirm && message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}
      {result && (
        <div className="ai-suggestion">
          <Badge>{accepted === result.id ? 'ACCEPTED' : result.state}</Badge>
          {['QUEUED', 'RUNNING'].includes(result.state) && (
            <p role="status">
              Preparing your suggestion… You can continue writing manually.
            </p>
          )}
          {['FAILED', 'REFUSED', 'EXPIRED'].includes(result.state) && (
            <Notice error>
              {result.state === 'REFUSED'
                ? 'The provider declined this request.'
                : result.state === 'EXPIRED'
                  ? 'This suggestion has expired.'
                  : 'AI assistance is temporarily unavailable.'}{' '}
              Your notes and answer are unchanged. You can keep writing
              manually.
            </Notice>
          )}
          {preview && result.result && (
            <>
              <div className="draft-comparison">
                <section>
                  <h3>Your original saved answer</h3>
                  <p className="preserve-text">
                    {'text' in original
                      ? String(original.text)
                      : 'No text saved yet.'}
                  </p>
                  <button
                    className="text-link"
                    onClick={() =>
                      void copy('text' in original ? String(original.text) : '')
                    }
                  >
                    Copy original answer
                  </button>
                </section>
                <section>
                  <h3>AI suggestion — not your saved answer</h3>
                  <p className="preserve-text">{result.result.draft}</p>
                  <button
                    className="text-link"
                    onClick={() => void copy(result.result!.draft)}
                  >
                    Copy suggestion
                  </button>
                </section>
              </div>
              <details>
                <summary>Facts used, missing details and warnings</summary>
                <ul>
                  {[
                    ...result.result.factsUsed,
                    ...result.result.missingFacts,
                    ...result.result.warnings,
                  ].map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </details>
              {result.baseAnswerVersion !== answerVersion &&
                accepted !== result.id &&
                result.state !== 'ACCEPTED' && (
                  <Notice error>
                    Your answer changed. Compare or copy this suggestion; your
                    newer answer will be kept.
                  </Notice>
                )}
              <button
                className="primary-button"
                disabled={
                  (result.state !== 'SUCCEEDED' &&
                    !(result.state === 'ACCEPTED' && uncertain)) ||
                  accepted === result.id ||
                  dirty ||
                  result.baseAnswerVersion !== answerVersion ||
                  command.pending
                }
                onClick={() => setConfirm(true)}
              >
                Use this draft
              </button>
            </>
          )}
          {!['QUEUED', 'RUNNING'].includes(result.state) && (
            <div className="actions">
              <button
                className="secondary-button"
                disabled={command.pending}
                onClick={() => {
                  setJob('')
                  setMessage(
                    'Your notes are ready to edit. Generate again within your allowance.',
                  )
                }}
              >
                Regenerate
              </button>
              <button
                className="danger-link"
                disabled={command.pending}
                onClick={() => {
                  setJob('')
                  setMessage('Suggestion discarded. Your answer is unchanged.')
                }}
              >
                Discard suggestion
              </button>
            </div>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        title="Use this AI draft?"
        description={
          <>
            <p>
              This replaces the saved answer shown above with the AI suggestion
              as an ordinary draft. Your original answer is retained for
              recovery for the suggestion’s remaining 30-day lifetime. Nothing
              is submitted for review.
            </p>
            {confirm && <ErrorNotice error={command.error} />}
            {confirm && message && <p role="status">{message}</p>}
          </>
        }
        confirmLabel="Save as draft"
        pending={command.pending}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void accept()}
      />
    </Panel>
  )
}

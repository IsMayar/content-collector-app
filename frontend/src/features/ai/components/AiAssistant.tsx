import type { AiDraftJob } from '@/features/ai/types/ai.types'
import type { Answer, ClientItem } from '@/features/client/types/client.types'
import { usePortalData } from '@/services/api/resourceApi'
import { Notice } from '@/shared/components/Feedback'
import { Badge, ErrorNotice, Field, Panel } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useState } from 'react'

export function AiAssistant({
  root,
  item,
  answerVersion,
  dirty,
  onAccepted,
}: {
  root: string
  item: ClientItem
  answerVersion: number
  dirty: boolean
  onAccepted: (answer: Answer) => void
}) {
  const command = useCommand(true)
  const [job, setJob] = useState('')
  const [facts, setFacts] = useState('')
  const q = usePortalData<{ job: AiDraftJob }>(
    job ? `${root}/ai-drafts/${job}` : '',
    { pollingInterval: job ? 1000 : 0 },
  )
  const result = q.data?.job
  return (
    <Panel
      title={result?.result ? 'Review your draft' : 'Create a draft with AI'}
    >
      <p className="subtle">
        Optional writing assistance. Add facts you know to be true; suggestions
        never submit your work.
      </p>
      <div className="reference-info">
        ✓ Uses your supplied facts only · Review before accepting
      </div>
      <form
        hidden={!!result?.result}
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault()
          const v = new FormData(e.currentTarget)
          const response = await command.run<{ job: AiDraftJob }>(
            `${root}/items/${item.id}/ai-drafts`,
            {
              facts: facts.split('\n').filter((f) => f.trim()),
              tone: v.get('tone'),
              targetWords: Number(v.get('words')),
              baseAnswerVersion: answerVersion,
              consent: v.has('consent'),
            },
          )
          if (response) setJob(response.job.id)
        }}
      >
        <Field label="Facts to include (one per line)">
          <textarea
            value={facts}
            onChange={(e) => setFacts(e.target.value)}
            required
            maxLength={5000}
            placeholder="Founded in 2019&#10;Family-owned practice&#10;Open Monday to Friday"
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
          <input required name="consent" type="checkbox" />
          Use these facts to prepare a suggestion. I will check it before
          accepting.
        </label>
        {dirty && (
          <Notice>
            Save your draft before generating. This keeps the suggestion tied to
            the right answer version.
          </Notice>
        )}
        <button
          className="secondary-button"
          disabled={
            dirty ||
            command.pending ||
            (!!result && ['QUEUED', 'RUNNING'].includes(result.state))
          }
        >
          Generate suggestion
        </button>
      </form>
      <ErrorNotice error={command.error} />
      {result && (
        <div className="ai-suggestion">
          <Badge>{result.state}</Badge>
          {['QUEUED', 'RUNNING'].includes(result.state) && (
            <p role="status">Preparing your suggestion…</p>
          )}
          {result.state === 'FAILED' && (
            <Notice error>
              Assistance is temporarily unavailable. Your draft is unchanged.
              Generate again to retry.
            </Notice>
          )}
          {result.result &&
            ['SUCCEEDED', 'ACCEPTED'].includes(result.state) && (
              <>
                <div className="draft-comparison">
                  <section>
                    <h3>Existing answer</h3>
                    <p className="preserve-text">
                      {'text' in item.answer.value
                        ? String(item.answer.value.text)
                        : 'No text saved yet.'}
                    </p>
                  </section>
                  <section>
                    <h3>AI suggested draft</h3>
                    <p className="preserve-text">{result.result.draft}</p>
                    <small>
                      {result.result.draft.trim().split(/\s+/).length} words
                    </small>
                  </section>
                </div>
                <details>
                  <summary>Facts and review notes</summary>
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
                  result.state !== 'ACCEPTED' && (
                    <Notice error>
                      Your answer changed. Generate a new suggestion to avoid
                      overwriting newer work.
                    </Notice>
                  )}
                <button
                  className="primary-button"
                  disabled={
                    result.state !== 'SUCCEEDED' ||
                    dirty ||
                    result.baseAnswerVersion !== answerVersion ||
                    command.pending
                  }
                  onClick={async () => {
                    const response = await command.run<{ answer: Answer }>(
                      `${root}/ai-drafts/${result.id}/accept`,
                      { expectedAnswerVersion: answerVersion },
                    )
                    if (response) onAccepted(response.answer)
                  }}
                >
                  Accept as draft
                </button>
                <div className="actions">
                  <button
                    className="secondary-button"
                    onClick={() => setJob('')}
                  >
                    Regenerate
                  </button>
                  <button
                    className="danger-link"
                    onClick={() => {
                      setJob('')
                      setFacts('')
                    }}
                  >
                    Discard suggestion
                  </button>
                </div>
                <p className="subtle">
                  You still choose when to submit for review.
                </p>
              </>
            )}
        </div>
      )}
    </Panel>
  )
}

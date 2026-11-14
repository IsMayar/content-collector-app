import { AiAssistant } from '@/features/ai/components/AiAssistant'
import { fetchLatest } from '@/features/client/api/clientApi'
import { TypedValue } from '@/features/client/components/TypedValue'
import type {
  Answer,
  AnswerValue,
  ClientItem,
} from '@/features/client/types/client.types'
import { ConfirmDialog, Notice } from '@/shared/components/Feedback'
import { Modal } from '@/shared/components/Modal'
import { Badge, ErrorNotice, Field, Panel } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { validateAnswer } from '@/shared/utils/domain'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
export function AnswerEditor({
  root,
  item,
  structureVersion,
  onRefresh,
}: {
  root: string
  item: ClientItem
  structureVersion: number
  onRefresh: () => void
}) {
  const [value, setValue] = useState<AnswerValue>(
    item.answer.value as AnswerValue,
  )
  const [version, setVersion] = useState(item.answer.version)
  const [saved, setSaved] = useState('All changes saved')
  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const command = useCommand(true)
  const latest = useRef({ value, version, dirty })
  latest.current = { value, version, dirty }
  const saving = useRef(false)
  const [conflict, setConflict] = useState(false)
  const [comment, setComment] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const [confirm, setConfirm] = useState<'submit' | 'withdraw' | ''>('')
  const enabled = item.canEdit
  async function save() {
    if (saving.current || !latest.current.dirty || conflict) return false
    saving.current = true
    setSaved('Saving…')
    const snapshot = latest.current.value
    const result = await command.run<{ answer: Answer }>(
      `${root}/items/${item.id}/answer`,
      {
        value: snapshot,
        expectedVersion: latest.current.version,
        expectedStructureVersion: structureVersion,
        saveOperationId: crypto.randomUUID(),
      },
      'PUT',
    )
    saving.current = false
    if (result) {
      setVersion(result.answer.version)
      latest.current.version = result.answer.version
      if (JSON.stringify(latest.current.value) === JSON.stringify(snapshot)) {
        setDirty(false)
        latest.current.dirty = false
        setSaved('All changes saved')
      } else setSaved('Unsaved changes')
      return true
    }
    setSaved('Couldn’t save. Your text is kept in this tab.')
    setConflict(true)
    return false
  }
  const autoSave = useEffectEvent(() => void save())
  useEffect(() => {
    if (!dirty || !enabled || conflict) return
    const timer = setTimeout(autoSave, 800)
    return () => clearTimeout(timer)
  }, [value, dirty, enabled, conflict, version])
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (latest.current.dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    const guard = (e: MouseEvent) => {
      if (!latest.current.dirty) return
      const target = (e.target as HTMLElement).closest(
        'a, .client-checklist button, [data-portal-nav]',
      )
      if (
        target &&
        !window.confirm(
          'Your changes have not saved. Leave this editor and discard them?',
        )
      ) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', before)
    document.addEventListener('click', guard, true)
    return () => {
      window.removeEventListener('beforeunload', before)
      document.removeEventListener('click', guard, true)
    }
  }, [])
  function update(next: AnswerValue) {
    setValue(next)
    setDirty(true)
    setSaved('Unsaved changes')
    setErrors([])
  }
  async function submit() {
    if (dirty && !(await save())) return
    const validation = validateAnswer(item, latest.current.value, item.assets)
    if (validation.length) {
      setErrors(validation)
      setConfirm('')
      return
    }
    const expected = latest.current.version
    const result = await command.run(`${root}/items/${item.id}/submit`, {
      expectedAnswerVersion: expected,
      expectedStructureVersion: structureVersion,
    })
    if (result) {
      setConfirm('')
      onRefresh()
    }
  }
  return (
    <div className="answer-layout">
      <Panel>
        <div className="editor-heading">
          <span className="eyebrow">
            {item.type.replaceAll('_', ' ')} ·{' '}
            {item.required ? 'REQUIRED' : 'OPTIONAL'}
          </span>
          <Badge>{item.state}</Badge>
        </div>
        <h2 className="answer-title">{item.label}</h2>
        <p>{item.instructions}</p>
        {item.state === 'CHANGES_REQUESTED' && (
          <Notice error>
            Changes requested. Review your agency’s feedback and update your
            response below.
          </Notice>
        )}
        {['SUBMITTED', 'APPROVED'].includes(item.state) && (
          <Notice>
            {item.state === 'APPROVED'
              ? 'This exact revision has been approved.'
              : 'Your submission is waiting for review. Withdraw it to make changes.'}
          </Notice>
        )}
        <TypedValue
          item={item}
          value={value}
          onChange={update}
          disabled={!enabled}
          root={root}
        />
        {enabled && item.type === 'LONG_TEXT' && item.ai?.enabled && (
          <button
            className="secondary-button ai-launch"
            onClick={() => setAiOpen(true)}
          >
            ✧ Help me draft
          </button>
        )}
        <div className="save-status" role="status">
          {saved}
        </div>
        <ErrorNotice error={command.error} />
        {errors.map((e) => (
          <p key={e} role="alert" className="form-field-error">
            {e}
          </p>
        ))}
        {conflict && (
          <div className="conflict-panel">
            <h3>We found different versions of this content</h3>
            <div className="draft-comparison">
              <section>
                <h4>Your local draft</h4>
                <pre className="code-wrap">
                  {JSON.stringify(value, null, 2)}
                </pre>
              </section>
              <section>
                <h4>Last retrieved server draft</h4>
                <pre className="code-wrap">
                  {JSON.stringify(item.answer.value, null, 2)}
                </pre>
              </section>
            </div>
            <button
              className="secondary-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    JSON.stringify(value, null, 2),
                  )
                  setSaved('Draft copied.')
                } catch {
                  setSaved('Copy unavailable. Select your local draft above.')
                }
              }}
            >
              Copy my draft
            </button>
            <p>
              Your local response is still in this editor. Compare it with the
              latest saved response before retrying.
            </p>
            <button
              className="secondary-button"
              onClick={async () => {
                const response = await fetchLatest(`${root}/items/${item.id}`)
                if (response) {
                  setVersion(response.answer.version)
                  setConflict(false)
                  setSaved(
                    'Latest version loaded. Your local response is retained; choose Save draft to replace the current draft.',
                  )
                  onRefresh()
                }
              }}
            >
              Load latest version, keep my input
            </button>
          </div>
        )}
        <div className="actions">
          {enabled && (
            <>
              <button
                className="secondary-button"
                disabled={!dirty || command.pending || conflict}
                onClick={() => void save()}
              >
                Save draft
              </button>
              <button
                className="primary-button"
                disabled={command.pending || conflict}
                onClick={() => setConfirm('submit')}
              >
                Submit for review
              </button>
            </>
          )}
          {item.state === 'SUBMITTED' && (
            <button
              className="secondary-button"
              onClick={() => setConfirm('withdraw')}
            >
              Withdraw submission
            </button>
          )}
        </div>
        <p className="subtle">
          Drafts are private work in progress. Submitting creates an immutable
          revision for your agency to review.
        </p>
      </Panel>
      {aiOpen && enabled && item.type === 'LONG_TEXT' && item.ai?.enabled && (
        <Modal title="Create a draft with AI" onClose={() => setAiOpen(false)}>
          <AiAssistant
            root={root}
            item={item}
            answerVersion={version}
            dirty={dirty}
            onAccepted={(answer) => {
              setValue(answer.value as AnswerValue)
              setVersion(answer.version)
              setDirty(false)
              setSaved('Accepted suggestion saved as a draft.')
              onRefresh()
              setAiOpen(false)
            }}
          />
        </Modal>
      )}
      <aside className="answer-comments">
        <Panel title="Comments">
          <p className="subtle">Visible to you and your agency.</p>
          <div className="comments">
            {item.comments.map((c) => (
              <article key={c.id}>
                <strong>{c.authorDisplayName}</strong>
                <time>{new Date(c.createdAt).toLocaleString()}</time>
                <p>{c.body}</p>
              </article>
            ))}
          </div>
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault()
              if (
                await command.run(`${root}/items/${item.id}/comments`, {
                  body: comment,
                })
              ) {
                setComment('')
                onRefresh()
              }
            }}
          >
            <Field label="Add a comment">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                required
                maxLength={4000}
              />
            </Field>
            <button className="secondary-button" disabled={command.pending}>
              Send comment
            </button>
          </form>
        </Panel>
      </aside>
      <ConfirmDialog
        open={!!confirm}
        pending={command.pending}
        title={
          confirm === 'submit'
            ? 'Ready for review?'
            : 'Withdraw this submission?'
        }
        description={
          confirm === 'submit'
            ? 'This saves an immutable copy of your current answer and ready files. Your agency will review this exact revision.'
            : 'This returns the current item to draft. Previous submission history is retained.'
        }
        confirmLabel={confirm === 'submit' ? 'Submit for review' : 'Withdraw'}
        onCancel={() => setConfirm('')}
        onConfirm={() => {
          if (confirm === 'submit') void submit()
          else
            void (async () => {
              if (
                await command.run(`${root}/items/${item.id}/withdraw`, {
                  expectedItemVersion: item.version,
                })
              ) {
                setConfirm('')
                onRefresh()
              }
            })()
        }}
      />
    </div>
  )
}

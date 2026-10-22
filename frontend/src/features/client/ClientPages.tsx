import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { Check, CloudUpload, FileText, LockKeyhole } from 'lucide-react'
import { clientApi } from '@/api/clientApi'
import { useAppDispatch } from '@/app/hooks'
import { usePortalData } from '@/api/productApi'
import type {
  Answer,
  AnswerValue,
  AssetSummary,
  ClientChecklist,
  ClientItem,
  NotificationPreferences,
  UploadReservation,
} from '@/api/contracts'
import {
  Badge,
  DualProgress,
  Empty,
  ErrorNotice,
  Field,
  Heading,
  Panel,
  QueryState,
  useCommand,
} from '@/components/ProductUI'
import { ConfirmDialog, Notice } from '@/components/Feedback'
import { formatBytes, validateAnswer } from '@/lib/domain'
import { AiAssistant } from '@/features/settings/AiAssistant'
import { downloadFile } from '@/lib/download'

export function ClientAccessPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [token, setToken] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get('token') || '',
  )
  const command = useCommand(true)
  const [message, setMessage] = useState('')
  const [fresh, setFresh] = useState('')
  useEffect(() => {
    if (location.hash) navigate('/client/access', { replace: true })
  }, [location.hash, navigate])
  return (
    <div className="access-card">
      <span className="access-emblem">
        <LockKeyhole size={28} />
      </span>
      <Heading
        eyebrow="YOUR PRIVATE PROJECT SPACE"
        title="A little detail. A big difference."
        description="You’re here to bring your project to life. Open your private checklist to get started."
      />
      {token ? (
        <>
          <Notice>
            Your invitation is only used when you choose to open the project.
          </Notice>
          <button
            className="primary-button"
            disabled={command.pending}
            onClick={async () => {
              const result = await command.run<{ projectId: string }>(
                'client-access/exchange',
                { token },
              )
              if (result) {
                setToken('')
                dispatch(clientApi.util.resetApiState())
                navigate(`/client/projects/${result.projectId}`)
              }
            }}
          >
            Open my project →
          </button>
        </>
      ) : (
        <p>
          Use the private link from your agency, or request a fresh invitation
          below.
        </p>
      )}
      <ErrorNotice error={command.error} />
      <details open={!token}>
        <summary>Need a fresh link?</summary>
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault()
            const v = Object.fromEntries(new FormData(e.currentTarget))
            const result = await command.run<{
              message: string
              demoUrl?: string
            }>('client-access/request-link', v)
            if (result) {
              setMessage(result.message)
              setFresh(result.demoUrl || '')
            }
          }}
        >
          <Field label="Your email">
            <input required name="email" type="email" autoComplete="email" />
          </Field>
          <Field label="Project ID">
            <input
              required
              name="projectId"
              defaultValue={
                new URLSearchParams(location.search).get('projectId') || ''
              }
              placeholder="From your agency’s invitation"
            />
          </Field>
          <button disabled={command.pending} className="secondary-button">
            Request fresh link
          </button>
        </form>
      </details>
      {message && <Notice>{message}</Notice>}
      {fresh && (
        <Link
          to={fresh}
          onClick={() =>
            setToken(
              new URLSearchParams(fresh.split('#')[1]).get('token') || '',
            )
          }
        >
          Open synthetic fresh invitation
        </Link>
      )}
    </div>
  )
}
export function ClientProjectPage() {
  const { projectId } = useParams()
  const root = `client/projects/${projectId}`
  const q = usePortalData<ClientChecklist>(`${root}/checklist`)
  const [selected, setSelected] = useState('')
  const [settings, setSettings] = useState(false)
  const command = useCommand(true)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)
  const data = q.data
  const items = data?.sections.flatMap((s) => s.items) || []
  const active = items.find((i) => i.id === selected) || items[0]
  if (q.isError)
    return (
      <div className="access-card">
        <Heading
          eyebrow="PRIVATE PROJECT ACCESS"
          title="Let’s reconnect to your project"
          description="Your session may have expired, access may have changed, or the connection may be unavailable."
        />
        <ErrorNotice error={command.error} />
        <div className="actions">
          <button className="secondary-button" onClick={() => void q.refetch()}>
            Try again
          </button>
          <Link
            className="primary-button"
            to={`/client/access?projectId=${projectId}`}
          >
            Request a fresh link
          </Link>
        </div>
        <p>
          Saved drafts remain with the project. Your agency can help if access
          has been revoked.
        </p>
      </div>
    )
  return (
    <QueryState query={q}>
      {data && (
        <>
          <Heading
            eyebrow={`${data.project.agencyDisplayName} / PRIVATE CLIENT SPACE`}
            title={data.project.title}
            description={`Let’s bring the details together. Due ${data.project.dueDate}`}
          >
            <button
              className="secondary-button"
              onClick={() => setSettings(!settings)}
            >
              Notifications
            </button>
            <button
              className="secondary-button"
              onClick={() => setConfirm(true)}
            >
              Leave project
            </button>
          </Heading>
          <div className="client-progress">
            <DualProgress progress={data.progress} />
            <p>
              <strong>{data.progress.clientActionRequired}</strong> required
              items need your attention.
            </p>
          </div>
          {data.project.state !== 'ACTIVE' && (
            <Notice>
              This project is {data.project.state.toLowerCase()}. You can read
              your content; editing is paused.
            </Notice>
          )}
          {settings && <ClientPreferences root={root} />}
          <div className="client-workspace">
            <aside className="client-checklist">
              <nav aria-label="Collection checklist">
                {data.sections.map((s, index) => (
                  <section key={s.id}>
                    <h2>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      {s.title}
                    </h2>
                    {s.items.map((i) => (
                      <button
                        key={i.id}
                        className={active?.id === i.id ? 'selected' : ''}
                        aria-current={active?.id === i.id ? 'step' : undefined}
                        onClick={() => setSelected(i.id)}
                      >
                        <span
                          className={`item-dot dot-${i.state.toLowerCase()}`}
                        >
                          {i.state === 'APPROVED' ? <Check size={12} /> : ''}
                        </span>
                        <span>
                          {i.label}
                          {i.required ? ' *' : ''}
                        </span>
                      </button>
                    ))}
                  </section>
                ))}
              </nav>
              <p className="subtle">* Required for this project</p>
            </aside>
            <div className="client-editor">
              {active ? (
                <AnswerEditor
                  key={active.id}
                  root={root}
                  item={active}
                  structureVersion={data.project.structureVersion}
                  onRefresh={() => void q.refetch()}
                />
              ) : (
                <Empty
                  title="You’re all caught up"
                  description="There are no visible items in this checklist."
                />
              )}
            </div>
          </div>
          <ConfirmDialog
            open={confirm}
            pending={command.pending}
            title="Leave this project?"
            description="Your saved drafts stay with the project. You’ll need a fresh invitation to return."
            confirmLabel="Leave project"
            onCancel={() => setConfirm(false)}
            onConfirm={() => {
              void (async () => {
                if (await command.run('client-access/logout', {})) {
                  dispatch(clientApi.util.resetApiState())
                  navigate('/client/access')
                }
              })()
            }}
          />
          <ErrorNotice error={command.error} />
        </>
      )}
    </QueryState>
  )
}
function AnswerEditor({
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
        'a, .client-checklist button',
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
    <>
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
        {item.example && <p className="example">For example: {item.example}</p>}
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
            <h3>Let’s keep your work safe</h3>
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
            <pre>{JSON.stringify(item.answer.value, null, 2)}</pre>
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
      {enabled && item.type === 'LONG_TEXT' && item.ai?.enabled && (
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
          }}
        />
      )}
      <Panel title="Project conversation">
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
    </>
  )
}
async function fetchLatest(
  path: string,
): Promise<{ answer: Answer } | undefined> {
  // Use the same client RTK endpoint, including session/CSRF behavior.
  const { store } = await import('@/app/store')
  const { portalApi } = await import('@/api/productApi')
  const request = store.dispatch(
    portalApi.endpoints.portalRead.initiate(path, {
      forceRefetch: true,
      subscribe: false,
    }),
  )
  try {
    return (await request.unwrap()) as { answer: Answer }
  } catch {
    return undefined
  } finally {
    request.unsubscribe()
  }
}
export function TypedValue({
  item,
  value,
  onChange,
  disabled,
  root,
}: {
  item: Pick<ClientItem, 'id' | 'label' | 'type' | 'validation' | 'assets'>
  value: AnswerValue
  onChange: (v: AnswerValue) => void
  disabled: boolean
  root: string
}) {
  const data = value as unknown as Record<string, unknown>
  const rules = item.validation
  if (
    item.type === 'SHORT_TEXT' ||
    item.type === 'LONG_TEXT' ||
    item.type === 'URL'
  )
    return (
      <Field
        label="Your response"
        hint={
          item.type === 'URL'
            ? 'Use an HTTP or HTTPS link.'
            : `${String(data.text || '').length} / ${rules.maxLength || (item.type === 'SHORT_TEXT' ? 200 : 10000)} characters`
        }
      >
        {item.type === 'LONG_TEXT' ? (
          <textarea
            rows={9}
            value={String(data.text || '')}
            disabled={disabled}
            maxLength={rules.maxLength || 10000}
            onChange={(e) => onChange({ text: e.target.value })}
          />
        ) : (
          <input
            type={
              item.type === 'URL'
                ? 'url'
                : rules.format === 'email'
                  ? 'email'
                  : 'text'
            }
            value={String(data.text || data.url || '')}
            disabled={disabled}
            maxLength={rules.maxLength || 200}
            onChange={(e) =>
              onChange(
                item.type === 'URL'
                  ? { url: e.target.value }
                  : { text: e.target.value },
              )
            }
          />
        )}
      </Field>
    )
  if (item.type === 'SINGLE_SELECT')
    return (
      <Field label="Choose one">
        <select
          disabled={disabled}
          value={String(data.optionKey || '')}
          onChange={(e) => onChange({ optionKey: e.target.value })}
        >
          <option value="">Choose an option</option>
          {rules.options?.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    )
  if (item.type === 'MULTI_SELECT')
    return (
      <fieldset className="option-list" disabled={disabled}>
        <legend>Choose all that apply</legend>
        {rules.options?.map((o) => (
          <label key={o.key} className="check-row">
            <input
              type="checkbox"
              checked={((data.optionKeys as string[]) || []).includes(o.key)}
              onChange={(e) =>
                onChange({
                  optionKeys: e.target.checked
                    ? [...((data.optionKeys as string[]) || []), o.key]
                    : ((data.optionKeys as string[]) || []).filter(
                        (k) => k !== o.key,
                      ),
                })
              }
            />
            {o.label}
          </label>
        ))}
      </fieldset>
    )
  if (item.type === 'FILE' || item.type === 'IMAGE')
    return (
      <UploadQueue
        root={root}
        itemId={item.id}
        image={item.type === 'IMAGE'}
        assets={item.assets}
        selected={(data.assetIds as string[]) || []}
        onChange={(assetIds) => onChange({ assetIds })}
        disabled={disabled}
      />
    )
  if (item.type === 'REPEATER') {
    const rows = (value as Extract<AnswerValue, { rows: unknown }>).rows || []
    return (
      <div className="repeater">
        {rows.map((row, index) => (
          <fieldset key={row.rowId} disabled={disabled}>
            <legend>Entry {index + 1}</legend>
            {rules.columns?.map((column) => {
              const cell = row.values[column.key]
              const update = (v: typeof cell) =>
                onChange({
                  rows: rows.map((r) =>
                    r.rowId === row.rowId
                      ? { ...r, values: { ...r.values, [column.key]: v } }
                      : r,
                  ),
                })
              if (column.type === 'IMAGE')
                return (
                  <div key={column.key}>
                    <h3>{column.label}</h3>
                    <UploadQueue
                      root={root}
                      itemId={item.id}
                      image
                      assets={item.assets}
                      selected={Array.isArray(cell) ? cell : []}
                      onChange={update}
                      disabled={disabled}
                    />
                  </div>
                )
              return (
                <Field
                  key={column.key}
                  label={`${column.label}${column.required ? ' *' : ''}`}
                >
                  {column.type === 'SINGLE_SELECT' ? (
                    <select
                      value={String(cell || '')}
                      onChange={(e) => update(e.target.value)}
                    >
                      <option value="">Choose</option>
                      {column.options?.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : column.type === 'LONG_TEXT' ? (
                    <textarea
                      value={String(cell || '')}
                      maxLength={10000}
                      onChange={(e) => update(e.target.value)}
                    />
                  ) : (
                    <input
                      type={
                        column.type === 'NUMBER'
                          ? 'number'
                          : column.type === 'URL'
                            ? 'url'
                            : 'text'
                      }
                      value={String(cell ?? '')}
                      onChange={(e) =>
                        update(
                          column.type === 'NUMBER' && e.target.value !== ''
                            ? Number(e.target.value)
                            : e.target.value,
                        )
                      }
                    />
                  )}
                </Field>
              )
            })}
            <div className="actions">
              <button
                type="button"
                className="secondary-button"
                disabled={!index}
                onClick={() => {
                  const next = [...rows]
                  ;[next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ]
                  onChange({ rows: next })
                }}
              >
                Move up
              </button>
              <button
                type="button"
                className="danger-link"
                onClick={() =>
                  onChange({ rows: rows.filter((r) => r.rowId !== row.rowId) })
                }
              >
                Remove entry
              </button>
            </div>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={disabled || rows.length >= (rules.maxRows || 20)}
          className="secondary-button"
          onClick={() =>
            onChange({
              rows: [
                ...rows,
                {
                  rowId: crypto.randomUUID(),
                  values: Object.fromEntries(
                    (rules.columns || []).map((c) => [
                      c.key,
                      c.type === 'IMAGE' ? [] : '',
                    ]),
                  ),
                },
              ],
            })
          }
        >
          ＋ Add entry ({rows.length}/{rules.maxRows || 20})
        </button>
      </div>
    )
  }
  return null
}
type Transfer = {
  id: string
  file: File
  progress: number
  state:
    'queued' | 'uploading' | 'processing' | 'ready' | 'failed' | 'cancelled'
  assetId?: string
  uploadId?: string
  error?: string
  controller?: AbortController
}
function UploadQueue({
  root,
  itemId,
  image,
  assets,
  selected,
  onChange,
  disabled,
}: {
  root: string
  itemId: string
  image: boolean
  assets: AssetSummary[]
  selected: string[]
  onChange: (ids: string[]) => void
  disabled: boolean
}) {
  const command = useCommand(true)
  const [queue, setQueue] = useState<Transfer[]>([])
  const [keep, setKeep] = useState(true)
  const [error, setError] = useState('')
  const active = useRef(0)
  const started = useRef(new Set<string>())
  const cancelled = useRef(new Set<string>())
  const queueRef = useRef(queue)
  queueRef.current = queue
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const unmounted = useRef(false)
  useEffect(() => {
    unmounted.current = false
    return () => {
      unmounted.current = true
      for (const t of queueRef.current) t.controller?.abort()
    }
  }, [])
  function patch(id: string, changes: Partial<Transfer>) {
    if (!unmounted.current)
      setQueue((q) => q.map((t) => (t.id === id ? { ...t, ...changes } : t)))
  }
  async function transfer(t: Transfer) {
    active.current++
    patch(t.id, { state: 'uploading', error: undefined, progress: 0 })
    let reservation: UploadReservation | undefined
    try {
      reservation = await command.run<UploadReservation>(`${root}/uploads`, {
        itemId,
        originalName: t.file.name,
        contentType: t.file.type || 'application/octet-stream',
        bytes: t.file.size,
        keepOriginal: keep,
      })
      if (!reservation)
        throw Error('Reservation failed. Check type, size and workspace quota.')
      if (cancelled.current.has(t.id)) throw Error('Upload cancelled.')
      patch(t.id, {
        assetId: reservation.assetId,
        uploadId: reservation.uploadId,
      })
      const controller = new AbortController()
      patch(t.id, { controller })
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', reservation!.putUrl)
        Object.entries(reservation!.requiredHeaders).forEach(([k, v]) =>
          xhr.setRequestHeader(k, v),
        )
        xhr.upload.onprogress = (e) =>
          patch(t.id, {
            progress: e.lengthComputable
              ? Math.round((e.loaded / e.total) * 90)
              : 40,
          })
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(
                Error(
                  xhr.status === 403
                    ? 'Upload link expired. Retry for a fresh link.'
                    : 'Transfer failed.',
                ),
              )
        xhr.onerror = () =>
          reject(Error('Connection interrupted. Retry this file.'))
        xhr.onabort = () => reject(Error('Upload cancelled.'))
        controller.signal.addEventListener('abort', () => xhr.abort())
        xhr.send(t.file)
      })
      if (
        !(await command.run(
          `${root}/uploads/${reservation.uploadId}/finalize`,
          {},
        ))
      )
        throw Error('Could not finalize the upload.')
      patch(t.id, { state: 'processing', progress: 100 })
      let state = 'PROCESSING'
      for (
        let attempts = 0;
        attempts < 40 &&
        state === 'PROCESSING' &&
        !unmounted.current &&
        !controller.signal.aborted;
        attempts++
      ) {
        await new Promise((r) => setTimeout(r, 600))
        const result = await fetchLatestAsset(
          `${root}/assets/${reservation.assetId}`,
        )
        state = result?.state || 'FAILED'
        if (state === 'REJECTED' || state === 'FAILED')
          throw Error(result?.rejectionCode || 'File processing failed.')
      }
      if (controller.signal.aborted) throw Error('Upload cancelled.')
      if (state !== 'READY')
        throw Error(
          'Processing is taking longer than expected. Retry status later.',
        )
      patch(t.id, { state: 'ready' })
      onChange([...new Set([...selectedRef.current, reservation.assetId])])
    } catch (e) {
      patch(t.id, {
        state: cancelled.current.has(t.id) ? 'cancelled' : 'failed',
        error: e instanceof Error ? e.message : 'Upload failed.',
      })
      if (reservation)
        await command.run(
          `${root}/uploads/${reservation.uploadId}`,
          undefined,
          'DELETE',
        )
    } finally {
      active.current--
      started.current.delete(t.id)
      if (!unmounted.current) setQueue((q) => [...q])
    }
  }
  const startTransfer = useEffectEvent((t: Transfer) => void transfer(t))
  useEffect(() => {
    for (const t of queue) {
      if (active.current >= 3) break
      if (t.state === 'queued' && !started.current.has(t.id)) {
        started.current.add(t.id)
        startTransfer(t)
      }
    }
  }, [queue])
  function add(files: FileList | null) {
    if (!files) return
    if (queue.length + files.length > 50) {
      setError('Choose no more than 50 files in a batch.')
      return
    }
    const valid: Transfer[] = []
    for (const file of files) {
      if (file.size > (image ? 50 : 100) * 1024 * 1024) {
        setError(`${file.name} exceeds ${image ? 50 : 100} MiB.`)
        continue
      }
      valid.push({
        id: crypto.randomUUID(),
        file,
        progress: 0,
        state: 'queued',
      })
    }
    setQueue((q) => [...q, ...valid])
  }
  return (
    <div className="upload-area">
      <label className="upload-drop">
        <CloudUpload size={28} />
        <strong>{image ? 'Add images' : 'Add project files'}</strong>
        <span>
          {image
            ? 'JPEG, PNG, WebP, HEIC/HEIF · 50 MiB each'
            : 'Images, PDF, DOCX, TXT, SVG · 100 MiB each'}
        </span>
        <input
          aria-label={
            image
              ? 'Choose images from library or files'
              : 'Choose project files'
          }
          type="file"
          multiple
          accept={
            image
              ? '.jpg,.jpeg,.png,.webp,.heic,.heif'
              : '.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,.docx,.txt,.svg'
          }
          disabled={disabled}
          onChange={(e) => {
            add(e.target.files)
            e.target.value = ''
          }}
        />
      </label>
      {image && (
        <Field label="Take a photo">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={disabled}
            onChange={(e) => add(e.target.files)}
          />
        </Field>
      )}
      <label className="check-row">
        <input
          type="checkbox"
          checked={keep}
          disabled={disabled}
          onChange={(e) => setKeep(e.target.checked)}
        />
        Keep originals for this upload
      </label>
      <small>
        Turning this off saves space. Discarded originals cannot be recovered.
        Only ready files can be submitted.
      </small>
      <ErrorNotice error={error || command.error} />
      {queue.map((t) => (
        <div className="upload-row" key={t.id}>
          <FileText size={20} />
          <div className="grow">
            <strong>{t.file.name}</strong>
            <small>
              {formatBytes(t.file.size)} · {t.state}
            </small>
            <progress
              value={t.progress}
              max={100}
              aria-label={`${t.file.name} upload progress`}
            />
            {t.error && <p role="alert">{t.error}</p>}
          </div>
          {['failed', 'cancelled'].includes(t.state) && (
            <button
              className="secondary-button"
              onClick={() => {
                cancelled.current.delete(t.id)
                patch(t.id, { state: 'queued' })
              }}
            >
              Retry
            </button>
          )}
          {['queued', 'uploading', 'processing'].includes(t.state) && (
            <button
              className="secondary-button"
              onClick={() => {
                cancelled.current.add(t.id)
                t.controller?.abort()
                patch(t.id, { state: 'cancelled' })
                if (t.uploadId)
                  void command.run(
                    `${root}/uploads/${t.uploadId}`,
                    undefined,
                    'DELETE',
                  )
              }}
            >
              Cancel
            </button>
          )}
        </div>
      ))}
      {assets
        .filter((a) => a.state !== 'DELETED')
        .map((a) => (
          <div className="upload-row" key={a.id}>
            <label className="check-row grow">
              <input
                type="checkbox"
                disabled={disabled || a.state !== 'READY'}
                checked={selected.includes(a.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...selected, a.id]
                      : selected.filter((id) => id !== a.id),
                  )
                }
              />
              <span>
                <strong>{a.originalName}</strong>
                <small>
                  {formatBytes(a.retainedBytes)} ·{' '}
                  {a.keepOriginal ? 'Original retained' : 'Working copy only'}
                </small>
              </span>
            </label>
            <Badge>{a.state}</Badge>
            {a.state === 'READY' && (
              <button
                className="text-link"
                onClick={async () => {
                  const result = await command.run<{ url: string }>(
                    `${root}/assets/${a.id}/download`,
                    { variant: 'WORKING' },
                  )
                  if (result) {
                    try {
                      await downloadFile(result.url, a.originalName)
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : 'Download failed.',
                      )
                    }
                  }
                }}
              >
                Download
              </button>
            )}
            {!disabled && !selected.includes(a.id) && (
              <button
                className="danger-link"
                onClick={() =>
                  void command.run(
                    `${root}/assets/${a.id}`,
                    undefined,
                    'DELETE',
                  )
                }
              >
                Delete
              </button>
            )}
          </div>
        ))}
    </div>
  )
}
async function fetchLatestAsset(path: string) {
  const { store } = await import('@/app/store')
  const { portalApi } = await import('@/api/productApi')
  const req = store.dispatch(
    portalApi.endpoints.portalRead.initiate(path, {
      forceRefetch: true,
      subscribe: false,
    }),
  )
  try {
    return ((await req.unwrap()) as { asset: AssetSummary }).asset
  } catch {
    return undefined
  } finally {
    req.unsubscribe()
  }
}
function ClientPreferences({ root }: { root: string }) {
  const q = usePortalData<NotificationPreferences>(
    `${root}/notification-preferences`,
  )
  const command = useCommand(true)
  const [verification, setVerification] = useState('')
  const [message, setMessage] = useState('')
  return (
    <Panel title="Your notification preferences">
      <ErrorNotice error={command.error} />
      {message && <Notice>{message}</Notice>}
      {q.data && (
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault()
            const v = new FormData(e.currentTarget)
            if (
              await command.run(
                `${root}/notification-preferences`,
                {
                  emailEnabled: v.has('emailEnabled'),
                  timezone: v.get('timezone'),
                },
                'PUT',
              )
            )
              setMessage('Preferences saved.')
          }}
        >
          <label className="check-row">
            <input
              name="emailEnabled"
              type="checkbox"
              defaultChecked={q.data.emailEnabled}
            />
            Email reminders
          </label>
          <Field label="Your timezone">
            <input
              name="timezone"
              defaultValue={q.data.timezone || 'America/New_York'}
              required
            />
          </Field>
          <button className="secondary-button">Save preferences</button>
        </form>
      )}
      <h3>Optional US SMS reminders</h3>
      <p>
        Consent is optional. Message and data rates may apply. Reply STOP to opt
        out. No real messages are sent in this demo.
      </p>
      <Badge>{q.data?.smsStatus || 'NOT_CONFIGURED'}</Badge>
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault()
          const v = new FormData(e.currentTarget)
          const result = await command.run<{ verificationId: string }>(
            `${root}/sms/verification`,
            {
              phoneE164: v.get('phone'),
              consent: v.has('consent'),
              consentTextVersion: '2026-10-22',
            },
          )
          if (result) {
            setVerification(result.verificationId)
            setMessage('Synthetic verification code: 123456')
          }
        }}
      >
        <Field label="US mobile number">
          <input
            type="tel"
            name="phone"
            pattern="\+1[0-9]{10}"
            placeholder="+15555550123"
            required
          />
        </Field>
        <label className="check-row">
          <input required name="consent" type="checkbox" />I agree to project
          reminder texts at this number.
        </label>
        <button className="secondary-button" disabled={command.pending}>
          Send verification code
        </button>
      </form>
      {verification && (
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault()
            const code = new FormData(e.currentTarget).get('code')
            if (
              await command.run(`${root}/sms/confirm`, {
                verificationId: verification,
                code,
              })
            ) {
              setMessage('SMS consent verified in the demo.')
              setVerification('')
            }
          }}
        >
          <Field label="Verification code">
            <input
              name="code"
              inputMode="numeric"
              required
              pattern="[0-9]{6}"
            />
          </Field>
          <button className="secondary-button">Verify</button>
        </form>
      )}
      <button
        className="danger-link"
        onClick={async () => {
          if (await command.run(`${root}/sms/consent`, undefined, 'DELETE'))
            setMessage('SMS reminders stopped.')
        }}
      >
        Opt out of SMS
      </button>
    </Panel>
  )
}

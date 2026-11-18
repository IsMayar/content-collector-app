import { UnsavedDraftRecovery } from '../components/UnsavedDraftRecovery'
import { CollectionPortal } from '../components/CollectionPortal'
import { useClientChecklist } from '@/features/client/api/portalApi'
import { PortalFoundation } from '@/features/client/components/PortalFoundation'
import { useAppSelector } from '@/shared/hooks/useAppStore'
import { AnswerEditor } from '@/features/client/components/AnswerEditor'
import { ClientPreferences } from '@/features/client/components/ClientPreferences'
import { clientApi } from '@/services/api/clientApi'
import { ConfirmDialog, Notice, StatePanel } from '@/shared/components/Feedback'
import {
  Badge,
  DualProgress,
  Empty,
  ErrorNotice,
  Heading,
  Panel,
  QueryState,
} from '@/shared/components/ProductUI'
import { useAppDispatch } from '@/shared/hooks/useAppStore'
import { useCommand } from '@/shared/hooks/useCommand'
import {
  ArrowRight,
  Check,
  FileText,
  LockKeyhole,
  RefreshCw,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
export function ClientProjectPage() {
  const { projectId } = useParams()
  const root = `client/projects/${projectId}`
  const q = useClientChecklist(projectId || '')
  const blocked = useAppSelector((s) => s.clientAccess.blocked)
  const [selected, setSelected] = useState('')
  const [settings, setSettings] = useState(false)
  const [view, setView] = useState('home')
  const command = useCommand(true)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)
  const foundation = q.data && 'capabilities' in q.data ? q.data : undefined
  const data = q.data && !('capabilities' in q.data) ? q.data : undefined
  const items = data?.sections.flatMap((s) => s.items) || []
  const active = items.find((i) => i.id === selected) || items[0]
  if (q.isError || blocked)
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-1 items-center py-5 sm:py-10">
        <section
          aria-labelledby="client-reconnect-title"
          className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <LockKeyhole size={23} aria-hidden="true" />
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.1em] text-blue-700">
            Private project access
          </p>
          <h1
            id="client-reconnect-title"
            className="mt-2 text-[26px] font-bold leading-tight tracking-tight text-[#0A1A2F] sm:text-[30px]"
          >
            Reconnect to your project
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {blocked
              ? 'Your project access is no longer available in this session. Request a new link to continue.'
              : 'We couldn’t open your project right now. Check your connection and try again, or request a new access link.'}
          </p>

          <div className="mt-5">
            <ErrorNotice error={command.error} />
            <UnsavedDraftRecovery projectId={projectId || ''} />
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {!blocked && (
              <button
                type="button"
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                onClick={() => void q.refetch()}
              >
                <RefreshCw size={16} aria-hidden="true" />
                Try again
              </button>
            )}
            <Link
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 text-center text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              to={
                '/client/access?projectId=' +
                encodeURIComponent(projectId || '')
              }
            >
              Request a new link
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
            A new link must be requested through your agency's invitation flow.
            If your access has changed, contact your agency project
            representative.
          </p>
        </section>
      </div>
    )
  if (
    q.isLoading ||
    (foundation && !('collection' in foundation) && q.isFetching)
  )
    return (
      <StatePanel
        kind="loading"
        title="Opening your project"
        description="Checking your private project access…"
      />
    )
  if (foundation && 'collection' in foundation)
    return (
      <CollectionPortal data={foundation} onRefresh={() => void q.refetch()} />
    )
  if (foundation) return <PortalFoundation data={foundation} />
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
          <nav
            className="reference-tabs portal-tabs"
            aria-label="Client project views"
          >
            {[
              ['home', 'Checklist'],
              ['files', 'Files'],
              ['activity', 'Activity'],
            ].map(([key, label]) => (
              <button
                key={key}
                data-portal-nav
                className={
                  view === key || (key === 'home' && view === 'editor')
                    ? 'active'
                    : ''
                }
                aria-pressed={
                  view === key || (key === 'home' && view === 'editor')
                }
                onClick={() => setView(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          {view === 'home' && (
            <section className="portal-home">
              <div>
                <span className="eyebrow">CLIENT CHECKLIST</span>
                <h1>Share your content</h1>
                <p>
                  Complete the items below so {data.project.agencyDisplayName}{' '}
                  can build your project. You can save progress and come back
                  anytime.
                </p>
                <p>Due date · {data.project.dueDate}</p>
              </div>
              <div className="client-progress">
                <DualProgress progress={data.progress} />
                <p>
                  <strong>{data.progress.clientActionRequired}</strong> required
                  items need your attention.
                </p>
              </div>
            </section>
          )}
          {view === 'home' && (
            <div className="portal-sections">
              {data.sections.map((s) => {
                const complete = s.items.filter((i) =>
                  ['SUBMITTED', 'APPROVED'].includes(i.state),
                ).length
                const approved =
                  s.items.length > 0 &&
                  s.items.every((i) => i.state === 'APPROVED')
                const next =
                  s.items.find(
                    (i) => !['SUBMITTED', 'APPROVED'].includes(i.state),
                  ) || s.items[0]
                return (
                  <article key={s.id} className="portal-section-row">
                    <span
                      className={`section-ring ${approved ? 'complete' : ''}`}
                    >
                      {approved ? <Check size={18} /> : ''}
                    </span>
                    <div className="grow">
                      <h2>{s.title}</h2>
                      <p>{s.items.length} content items</p>
                    </div>
                    <span>
                      {complete} of {s.items.length}
                    </span>
                    <Badge>
                      {approved
                        ? 'APPROVED'
                        : complete
                          ? 'DRAFT'
                          : 'NOT_STARTED'}
                    </Badge>
                    <button
                      className="secondary-button"
                      disabled={!next}
                      onClick={() => {
                        setSelected(next.id)
                        setView('editor')
                      }}
                    >
                      {approved ? 'View details' : 'Continue section'}
                    </button>
                  </article>
                )
              })}
            </div>
          )}
          {view === 'files' && (
            <Panel title="Your project files">
              <p>Choose a content item to upload or manage its files.</p>
              <div className="portal-sections">
                {items
                  .filter((i) => ['IMAGE', 'FILE'].includes(i.type))
                  .map((i) => (
                    <button
                      className="portal-section-row"
                      key={i.id}
                      onClick={() => {
                        setSelected(i.id)
                        setView('editor')
                      }}
                    >
                      <FileText />
                      <strong>{i.label}</strong>
                      <span>
                        {i.assets.filter((a) => a.state !== 'DELETED').length}{' '}
                        files
                      </span>
                      <span>Open</span>
                    </button>
                  ))}
              </div>
            </Panel>
          )}
          {view === 'activity' && (
            <Panel title="Project feedback">
              {items.flatMap((i) =>
                i.comments.map((c) => (
                  <article className="feedback-entry" key={c.id}>
                    <strong>
                      {c.authorDisplayName} · {i.label}
                    </strong>
                    <time>{new Date(c.createdAt).toLocaleString()}</time>
                    <p>{c.body}</p>
                    <button
                      className="text-link"
                      onClick={() => {
                        setSelected(i.id)
                        setView('editor')
                      }}
                    >
                      View response
                    </button>
                  </article>
                )),
              )}
              {!items.some((i) => i.comments.length) && (
                <p>No feedback yet. Your agency’s comments will appear here.</p>
              )}
            </Panel>
          )}
          {data.project.state !== 'ACTIVE' && (
            <Notice>
              This project is {data.project.state.toLowerCase()}. You can read
              your content; editing is paused.
            </Notice>
          )}
          {settings && <ClientPreferences root={root} />}
          {view === 'editor' && (
            <>
              <button
                data-portal-nav
                className="text-link back-checklist"
                onClick={() => setView('home')}
              >
                Back to checklist
              </button>
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
                            aria-current={
                              active?.id === i.id ? 'step' : undefined
                            }
                            onClick={() => setSelected(i.id)}
                          >
                            <span
                              className={`item-dot dot-${i.state.toLowerCase()}`}
                            >
                              {i.state === 'APPROVED' ? (
                                <Check size={12} />
                              ) : (
                                ''
                              )}
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
            </>
          )}
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

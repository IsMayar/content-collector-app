import { env } from '@/config/env'
import { BillingPage } from '@/features/billing/pages/BillingPage'
import { DigestPreview } from '@/features/analytics/components/DigestPreview'
import { AccountPanel } from '@/features/auth/components/AccountPanel'
import type { SessionSummary } from '@/features/auth/types/auth.types'
import type { WorkspaceDetail } from '@/features/workspace/types/workspace.types'
import { useData } from '@/services/api/resourceApi'
import { ConfirmDialog, Notice } from '@/shared/components/Feedback'
import {
  Badge,
  ErrorNotice,
  Field,
  Heading,
  Panel,
  QueryState,
} from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router'

export function SettingsPage() {
  const { id, owner, base, user } = useWorkspace()
  const [search] = useSearchParams()
  const { hash } = useLocation()
  const digest = useRef<HTMLElement>(null)
  useEffect(() => {
    if (hash === '#daily-digest' || search.get('view') === 'digest') {
      digest.current?.scrollIntoView({ block: 'start' })
      digest.current?.focus({ preventScroll: true })
    }
  }, [hash, search])
  const requestedView = search.get('view') || 'account'
  const aliases = new Map([
    ['digest', 'account'],
    ['security', 'account'],
    ['usage', 'billing'],
    ['status', 'billing'],
  ])
  const tab =
    aliases.get(requestedView) ||
    (['workspace', 'account', 'privacy', 'billing'].includes(requestedView)
      ? requestedView
      : 'account')
  const q = useData<WorkspaceDetail & { logo: string; digestEnabled: boolean }>(
    `workspaces/${id}${env.mocksEnabled ? '/settings' : ''}`,
    { skip: !owner || tab !== 'workspace' },
  )
  const sessions = useData<{ data: SessionSummary[] }>('me/sessions', {
    skip: tab !== 'account',
  })
  const command = useCommand()
  const [message, setMessage] = useState('')
  const [logo, setLogo] = useState<string | null>(null)
  const [deletion, setDeletion] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  if (requestedView === 'team') return <Navigate replace to={base + '/team'} />
  return (
    <>
      <Heading
        title={
          {
            account: 'My account',
            workspace: 'Workspace settings',
            billing: 'Billing & usage',
            privacy: 'Privacy & data',
          }[tab] || 'Settings'
        }
        description="Manage your account, workspace, billing, and data."
      />
      <div className="settings-content">
        <div className="settings-body">
          {!owner && tab === 'workspace' && (
            <Notice>
              Your workspace owner manages workspace details and team access.
            </Notice>
          )}
          {tab === 'privacy' && (
            <Panel title="Privacy information">
              <p>
                Review the draft policies for information about data handling
                and retention. Final retention periods and legal obligations
                require approval before publication.
              </p>
              <div className="actions">
                <Link to="/privacy" className="secondary-button">
                  Privacy Policy
                </Link>
                <Link to="/terms" className="secondary-button">
                  Terms of Service
                </Link>
              </div>
              <p>
                The documented recovery period for workspace deletion is 30
                days.
              </p>
            </Panel>
          )}

          {tab === 'account' && <AccountPanel />}
          {tab === 'account' && (
            <section
              id="daily-digest"
              ref={digest}
              tabIndex={-1}
              aria-label="Daily digest"
              style={{ scrollMarginTop: 120 }}
            >
              <DigestPreview workspaceId={id} />
            </section>
          )}
          {tab === 'billing' && <BillingPage embedded />}
          {tab === 'workspace' && owner && (
            <div className="workspace-identity min-w-0">
              <Panel title="Workspace details">
                <QueryState query={q}>
                  <div className="space-y-7">
                    <div className="flex flex-col gap-1">
                      <p className="text-sm leading-6 text-slate-500">
                        Set the name and default timezone for your workspace.
                      </p>
                    </div>

                    {q.data && (
                      <form
                        className="space-y-6"
                        key={q.data.workspace.version}
                        onSubmit={async (e) => {
                          e.preventDefault()
                          const v = new FormData(e.currentTarget)
                          if (
                            await command.run(
                              `workspaces/${id}`,
                              {
                                name: v.get('name'),
                                timezone: v.get('timezone'),
                                ...(env.mocksEnabled
                                  ? { logo: logo ?? q.data!.logo }
                                  : {}),
                                expectedVersion: q.data!.workspace.version,
                              },
                              'PATCH',
                            )
                          )
                            setMessage('Workspace preferences saved.')
                        }}
                      >
                        <div className="grid grid-cols-1 gap-x-5 gap-y-5 md:grid-cols-2">
                          <div className="min-w-0">
                            <Field label="Workspace name">
                              <input
                                name="name"
                                required
                                defaultValue={q.data.workspace.name}
                                className="!box-border !h-11 !w-full !min-w-0 !rounded-lg !border !border-slate-300 !bg-white !px-3 !text-sm !text-slate-900 focus:!border-blue-500 focus:!outline-none focus:!ring-2 focus:!ring-blue-500/15"
                              />
                            </Field>
                          </div>
                          <div className="min-w-0">
                            <Field label="Default timezone">
                              <input
                                name="timezone"
                                required
                                defaultValue={q.data.workspace.timezone}
                                className="!box-border !h-11 !w-full !min-w-0 !rounded-lg !border !border-slate-300 !bg-white !px-3 !text-sm !text-slate-900 focus:!border-blue-500 focus:!outline-none focus:!ring-2 focus:!ring-blue-500/15"
                              />
                            </Field>
                          </div>
                        </div>

                        {env.mocksEnabled && (
                          <div className="space-y-3 border-t border-slate-200 pt-5">
                            <div>
                              <h3 className="text-sm font-semibold text-slate-900">
                                Workspace logo
                              </h3>
                              <p className="mt-1 text-xs leading-5 text-slate-500">
                                PNG, JPEG or WebP, up to 1 MB.
                              </p>
                            </div>
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                              {(logo ?? q.data.logo) && (
                                <img
                                  className="workspace-logo !h-14 !w-14 shrink-0 !rounded-xl !border !border-slate-200 !object-contain"
                                  src={logo ?? q.data.logo}
                                  alt="Workspace logo preview"
                                />
                              )}
                              <div className="min-w-0 flex-1 space-y-2">
                                <Field label="Upload logo">
                                  <input
                                    className="!block !w-full !min-w-0 !rounded-lg !border !border-slate-300 !bg-white !p-2 !text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700"
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0]
                                      if (!file) return
                                      if (
                                        file.size > 1e6 ||
                                        ![
                                          'image/png',
                                          'image/jpeg',
                                          'image/webp',
                                        ].includes(file.type)
                                      ) {
                                        setMessage(
                                          'Choose a PNG, JPEG or WebP under 1 MB.',
                                        )
                                        return
                                      }
                                      const reader = new FileReader()
                                      reader.onload = () =>
                                        setLogo(String(reader.result))
                                      reader.readAsDataURL(file)
                                    }}
                                  />
                                </Field>
                                <button
                                  type="button"
                                  className="danger-link !text-sm"
                                  onClick={() => setLogo('')}
                                >
                                  Remove logo
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-5">
                          <button
                            type="submit"
                            className="primary-button !inline-flex !min-h-10 items-center justify-center !rounded-lg !px-5"
                            disabled={command.pending}
                          >
                            Save workspace
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="border-t border-slate-200 pt-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className="profile-avatar !flex !h-11 !w-11 shrink-0 !items-center !justify-center !rounded-full !bg-slate-100 !text-sm !font-semibold !text-slate-700"
                            aria-hidden="true"
                          >
                            {user?.displayName.slice(0, 2).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-500">
                              Workspace owner
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <strong className="break-words text-sm font-semibold text-slate-900">
                                {user?.displayName}
                              </strong>
                              <Badge>OWNER</Badge>
                            </div>
                            <p className="mt-1 break-all text-xs text-slate-500">
                              {user?.email}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </QueryState>
              </Panel>
            </div>
          )}
          {tab === 'account' && (
            <Panel title="Active sessions">
              <QueryState query={sessions}>
                <p className="subtle">
                  Revoke other sessions when a device is no longer yours.
                </p>
                {sessions.data?.data.map((s) => (
                  <div className="access-row" key={s.id}>
                    <div className="grow">
                      <strong>{s.label}</strong>
                      <p>
                        Last active {new Date(s.lastSeenAt).toLocaleString()}
                      </p>
                    </div>
                    {s.current ? (
                      <Badge>CURRENT</Badge>
                    ) : (
                      <button
                        className="secondary-button"
                        onClick={async () => {
                          if (
                            await command.run(
                              `me/sessions/${s.id}`,
                              undefined,
                              'DELETE',
                            )
                          )
                            setMessage('Other session revoked.')
                        }}
                      >
                        Revoke session
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className="secondary-button"
                  disabled={
                    command.pending ||
                    !sessions.data?.data.some((s) => !s.current)
                  }
                  onClick={async () => {
                    for (const session of sessions.data?.data.filter(
                      (s) => !s.current,
                    ) || []) {
                      if (
                        !(await command.run(
                          `me/sessions/${session.id}`,
                          undefined,
                          'DELETE',
                        ))
                      )
                        return
                    }
                    setMessage('Other sessions revoked.')
                  }}
                >
                  Sign out other sessions
                </button>
              </QueryState>
            </Panel>
          )}
          {tab === 'workspace' && owner && env.mocksEnabled && (
            <Panel title="Request workspace deletion">
              <p>
                Schedule deletion after a 30-day recovery period. Access becomes
                read-only immediately. Export approved content before
                proceeding.
              </p>
              <button className="danger-link" onClick={() => setDeletion(true)}>
                Request workspace deletion
              </button>
            </Panel>
          )}
        </div>
      </div>
      <ErrorNotice error={command.error} />
      {message && <Notice>{message}</Notice>}
      <ConfirmDialog
        open={deletion}
        pending={command.pending}
        title="Schedule workspace deletion?"
        description={
          <>
            <Field label="Current password">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Type the workspace name">
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </Field>
            <ErrorNotice error={command.error} />
          </>
        }
        confirmLabel="Schedule deletion"
        onCancel={() => {
          setDeletion(false)
          setPassword('')
        }}
        onConfirm={() =>
          void (async () => {
            const result = await command.run<{ deleteAfter: string }>(
              `workspaces/${id}/deletion-request`,
              { currentPassword: password, confirmation },
            )
            if (result) {
              setMessage(
                `Deletion scheduled for ${new Date(result.deleteAfter).toLocaleDateString()}.`,
              )
              setDeletion(false)
              setPassword('')
            }
          })()
        }
      />
    </>
  )
}

import { env } from '@/config/env'
import { BillingPage } from '@/features/billing/pages/BillingPage'
import { DigestPreview } from '@/features/analytics/components/DigestPreview'
import { AccountPanel } from '@/features/auth/components/AccountPanel'
import { OwnershipPanel } from '@/features/workspace/components/OwnershipPanel'
import type { SessionSummary } from '@/features/auth/types/auth.types'
import type { WorkspaceDetail } from '@/features/workspace/types/workspace.types'
import { useData } from '@/services/api/resourceApi'
import { ConfirmDialog, Notice } from '@/shared/components/Feedback'
import {
  ErrorNotice,
  Field,
  Panel,
  QueryState,
} from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import { Laptop2, Settings2, ShieldCheck, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router'
import './SettingsPage.css'

const inputClass =
  'mt-2 block box-border h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-blue-600 focus:ring-2 focus:ring-inset focus:ring-blue-500/20'

const outlinedButton =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50'

const primaryButton =
  'inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50'

export function SettingsPage() {
  const { id, owner, base, user } = useWorkspace()
  const [search] = useSearchParams()
  const { hash } = useLocation()

  const requestedView = search.get('view') || 'account'

  const aliases = new Map([
    ['digest', 'notifications'],
    ['security', 'account'],
    ['usage', 'billing'],
    ['status', 'billing'],
  ])

  const tab =
    hash === '#daily-digest' && requestedView === 'account'
      ? 'notifications'
      : aliases.get(requestedView) ||
        ([
          'account',
          'notifications',
          'workspace',
          'billing',
          'privacy',
        ].includes(requestedView)
          ? requestedView
          : 'account')

  const workspace = useData<
    WorkspaceDetail & {
      logo: string
      digestEnabled: boolean
    }
  >(`workspaces/${id}${env.mocksEnabled ? '/settings' : ''}`, {
    skip: !owner || tab !== 'workspace',
  })

  const sessions = useData<{ data: SessionSummary[] }>('me/sessions', {
    skip: tab !== 'account',
  })

  const command = useCommand()

  const [message, setMessage] = useState('')
  const [logo, setLogo] = useState<string | null>(null)

  const [deletion, setDeletion] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')

  if (requestedView === 'team') {
    return <Navigate replace to={base + '/team'} />
  }

  const titles: Record<string, string> = {
    account: 'My account',
    notifications: 'Notifications',
    workspace: 'Workspace settings',
    billing: 'Billing & usage',
    privacy: 'Privacy & data',
  }

  const descriptions: Record<string, string> = {
    account: 'Manage your profile, security, and signed-in devices.',
    notifications: 'Choose which project updates you receive by email.',
    workspace: 'Manage your workspace details and ownership.',
    billing: 'Review your plan, subscription, and resource usage.',
    privacy: 'Policies and information about your data.',
  }

  const ownerInitials =
    user?.displayName
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase() || 'U'

  return (
    <div className="settings-page w-full min-w-0 max-w-[1240px] space-y-4 pb-8">
      {/* PAGE HEADER */}

      <header className="settings-page-header">
        <h1 className="settings-page-title">
          {titles[tab] || 'Settings'}
        </h1>

        <p className="mt-1 text-sm leading-6 text-slate-600">
          {descriptions[tab]}
        </p>
      </header>

      {/* SETTINGS NAVIGATION REMAINS IN PROFILE DROPDOWN */}

      {!owner && tab === 'workspace' && (
        <Notice>
          Your workspace owner manages workspace details and team access.
        </Notice>
      )}

      {/* ACCOUNT SETTINGS */}

      {tab === 'account' && (
        <div className="settings-account-grid grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <AccountPanel />

          <section
            aria-labelledby="active-sessions-heading"
            className="settings-card settings-sessions min-w-0 rounded-xl border border-slate-200 bg-white p-4"
          >
            <header className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Laptop2 size={19} aria-hidden="true" />
              </span>

              <div>
                <h2
                  id="active-sessions-heading"
                  className="text-lg font-semibold text-[#0A1A2F]"
                >
                  Active sessions
                </h2>

                <p className="mt-1 text-sm leading-5 text-slate-500">
                  Review browsers signed in to your account.
                </p>
              </div>
            </header>

            <QueryState query={sessions}>
              <div className="mt-4 divide-y divide-slate-100">
                {sessions.data?.data.map((session) => (
                  <div
                    key={session.id}
                    className={`flex flex-wrap items-center justify-between gap-3 py-3 ${
                      session.current ? 'rounded-lg bg-blue-50/50 px-3' : ''
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <ShieldCheck
                        size={20}
                        className={`shrink-0 ${
                          session.current ? 'text-blue-600' : 'text-slate-400'
                        }`}
                        aria-hidden="true"
                      />

                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-slate-900">
                          {session.label}
                        </p>

                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Last active{' '}
                          {new Date(session.lastSeenAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {session.current ? (
                      <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        Current
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={command.pending}
                        className={outlinedButton}
                        onClick={async () => {
                          if (
                            await command.run(
                              `me/sessions/${session.id}`,
                              undefined,
                              'DELETE',
                            )
                          ) {
                            setMessage('Other session revoked.')
                            void sessions.refetch()
                          }
                        }}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}

                {sessions.data?.data.length === 0 && (
                  <p className="py-4 text-sm text-slate-500">
                    No active sessions were returned.
                  </p>
                )}
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  className={outlinedButton}
                  disabled={
                    command.pending ||
                    !sessions.data?.data.some((session) => !session.current)
                  }
                  onClick={async () => {
                    for (const session of sessions.data?.data.filter(
                      (row) => !row.current,
                    ) || []) {
                      if (
                        !(await command.run(
                          `me/sessions/${session.id}`,
                          undefined,
                          'DELETE',
                        ))
                      ) {
                        return
                      }
                    }

                    setMessage('Other sessions revoked.')
                    void sessions.refetch()
                  }}
                >
                  Sign out other sessions
                </button>
              </div>
            </QueryState>
          </section>
        </div>
      )}

      {/* NOTIFICATIONS */}

      {tab === 'notifications' && (
        <section id="daily-digest" aria-label="Email notifications">
          <DigestPreview workspaceId={id} />
        </section>
      )}

      {/* BILLING & USAGE */}

      {tab === 'billing' && <BillingPage embedded />}

      {/* PRIVACY */}

      {tab === 'privacy' && (
        <section className="settings-card settings-privacy rounded-xl border border-slate-200 bg-white p-4">
          <div className="settings-section-heading">
            <span className="settings-icon">
              <ShieldCheck size={19} aria-hidden="true" />
            </span>
            <h2>Privacy information</h2>
          </div>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Review the draft policies for data handling and retention. Final
            retention periods and legal obligations require approval before
            publication.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/privacy" className={outlinedButton}>
              Privacy Policy
            </Link>

            <Link to="/terms" className={outlinedButton}>
              Terms of Service
            </Link>
          </div>

          <p className="mt-4 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">
            The documented recovery period for workspace deletion is 30 days.
          </p>
        </section>
      )}

      {/* WORKSPACE SETTINGS */}

      {tab === 'workspace' && owner && (
        <div className="settings-workspace-grid w-full space-y-3">
          {/* GENERAL WORKSPACE CARD */}

          <section
            aria-label="Workspace information"
            className="settings-card overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            {/* WORKSPACE OWNER AT THE TOP */}

            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700"
                aria-hidden="true"
              >
                {ownerInitials}
              </span>

              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500">
                  Workspace owner
                </p>

                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="text-sm font-semibold text-[#0A1A2F]">
                    {user?.displayName}
                  </span>

                  <span className="break-all text-sm text-slate-500">
                    {user?.email}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section
            aria-labelledby="workspace-details-heading"
            className="settings-card rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="settings-section-heading">
              <span className="settings-icon">
                <Settings2 size={19} aria-hidden="true" />
              </span>
              <h2 id="workspace-details-heading">Workspace details</h2>
            </div>
            <QueryState query={workspace}>
              {workspace.data && (
                <form
                  key={workspace.data.workspace.version}
                  className="mt-3"
                  onSubmit={async (event) => {
                    event.preventDefault()

                    const fields = new FormData(event.currentTarget)

                    if (
                      await command.run(
                        `workspaces/${id}`,
                        {
                          name: fields.get('name'),
                          timezone: fields.get('timezone'),
                          ...(env.mocksEnabled &&
                          workspace.data!.entitlements.planKey !== 'FREE'
                            ? {
                                logo: logo ?? workspace.data!.logo,
                              }
                            : {}),
                          expectedVersion: workspace.data!.workspace.version,
                        },
                        'PATCH',
                      )
                    ) {
                      setMessage('Workspace preferences saved.')
                      void workspace.refetch()
                    }
                  }}
                >
                  <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <label className="block min-w-0 text-sm font-medium text-[#0A1A2F]">
                      Workspace name
                      <input
                        name="name"
                        required
                        defaultValue={workspace.data.workspace.name}
                        className={inputClass}
                        autoComplete="organization"
                      />
                    </label>

                    <label className="block min-w-0 text-sm font-medium text-[#0A1A2F]">
                      Default timezone
                      <input
                        name="timezone"
                        required
                        defaultValue={workspace.data.workspace.timezone}
                        className={inputClass}
                        spellCheck={false}
                        aria-describedby="workspace-timezone-help"
                      />
                      <span
                        id="workspace-timezone-help"
                        className="mt-1 block text-xs font-normal leading-5 text-slate-500"
                      >
                        For project dates and scheduled updates.
                      </span>
                    </label>

                    <div className="flex items-end sm:col-span-2 lg:col-span-1 lg:pt-5">
                      <button
                        type="submit"
                        disabled={command.pending}
                        className={`${primaryButton} w-full lg:w-auto`}
                      >
                        {command.pending ? 'Saving…' : 'Save changes'}
                      </button>
                    </div>
                  </div>

                  {/* MOCK-ONLY LOGO FEATURE PRESERVED */}

                  {env.mocksEnabled &&
                    workspace.data.entitlements.planKey !== 'FREE' && (
                      <details className="mt-4 rounded-lg border border-slate-200 px-4 py-3">
                        <summary className="cursor-pointer text-sm font-medium text-slate-700">
                          Workspace logo (preview only)
                        </summary>

                        <div className="mt-4 flex flex-wrap items-center gap-4">
                          {(logo ?? workspace.data.logo) && (
                            <img
                              src={logo ?? workspace.data.logo}
                              alt="Workspace logo preview"
                              className="h-12 w-12 rounded-lg border border-slate-200 object-contain"
                            />
                          )}

                          <div className="min-w-0 flex-1 space-y-2">
                            <label
                              htmlFor="workspace-logo-upload"
                              className="block text-xs font-medium text-slate-600"
                            >
                              Upload PNG, JPEG, or WebP (up to 1 MB)
                            </label>

                            <input
                              id="workspace-logo-upload"
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="block w-full min-w-0 text-xs"
                              onChange={(event) => {
                                const file = event.target.files?.[0]

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

                            <button
                              type="button"
                              className="text-xs font-medium text-red-600 hover:underline"
                              onClick={() => setLogo('')}
                            >
                              Remove logo
                            </button>
                          </div>
                        </div>
                      </details>
                    )}
                </form>
              )}
            </QueryState>
          </section>

          {/* OWNERSHIP TRANSFER — ALWAYS VISIBLE */}

          <section
            aria-labelledby="transfer-heading"
            className="settings-card rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex items-start gap-3 pb-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <UsersRound size={19} aria-hidden="true" />
              </span>

              <div className="min-w-0">
                <h2
                  id="transfer-heading"
                  className="text-base font-semibold text-[#0A1A2F]"
                >
                  Transfer workspace ownership
                </h2>

                <p className="mt-1 text-sm leading-5 text-slate-500">
                  Transfer ownership to another active member. This action
                  requires your current password.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <OwnershipPanel />
            </div>
          </section>

          {/* EXISTING MOCK-ONLY DELETION FEATURE */}

          {env.mocksEnabled && (
            <Panel title="Request workspace deletion">
              <p>
                Schedule deletion after a 30-day recovery period. Access becomes
                read-only immediately. Export approved content before
                proceeding.
              </p>

              <button
                type="button"
                className="text-sm font-medium text-red-600 hover:underline"
                onClick={() => setDeletion(true)}
              >
                Request workspace deletion
              </button>
            </Panel>
          )}
        </div>
      )}

      {/* MESSAGES */}

      <ErrorNotice error={command.error} />

      {message && <Notice>{message}</Notice>}

      {/* DELETION CONFIRMATION */}

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
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            <Field label="Type the workspace name">
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </Field>

            <ErrorNotice error={command.error} />
          </>
        }
        confirmLabel="Schedule deletion"
        onCancel={() => {
          setDeletion(false)
          setPassword('')
          setConfirmation('')
        }}
        onConfirm={() =>
          void (async () => {
            const result = await command.run<{
              deleteAfter: string
            }>(`workspaces/${id}/deletion-request`, {
              currentPassword: password,
              confirmation,
            })

            if (result) {
              setMessage(
                `Deletion scheduled for ${new Date(
                  result.deleteAfter,
                ).toLocaleDateString()}.`,
              )

              setDeletion(false)
              setPassword('')
              setConfirmation('')
            }
          })()
        }
      />
    </div>
  )
}

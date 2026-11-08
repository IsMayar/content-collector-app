import { env } from '@/config/env'
import { BillingPage } from '@/features/billing/pages/BillingPage'
import { TeamPage } from '@/features/workspace/pages/TeamPage'
import { DigestPreview } from '@/features/analytics/components/DigestPreview'
import {
  AccountPanel,
  SettingsNav,
} from '@/features/auth/components/AccountPanel'
import type { SessionSummary } from '@/features/auth/types/auth.types'
import { OwnershipPanel } from '@/features/workspace/components/OwnershipPanel'
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
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

export function SettingsPage() {
  const { id, owner, base, user } = useWorkspace()
  const [search] = useSearchParams()
  const requestedView = search.get('view') || 'account'
  const aliases = new Map([
    ['team', 'workspace'],
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
  return (
    <>
      <Heading
        title="Settings"
        description="Manage your account, workspace, billing, and data."
      />
      <div className="settings-layout settings-redesign">
        <SettingsNav active={tab} />
        <div className="settings-body">
          {!owner && tab === 'workspace' && (
            <Notice>
              Your workspace owner manages workspace details and team access.
            </Notice>
          )}
          <h2 className="settings-section-title">
            {
              {
                account: 'Account & Notifications',
                workspace: 'Workspace & Team',
                billing: 'Billing & Usage',
                privacy: 'Privacy & Data',
              }[tab]
            }
          </h2>
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
          {tab === 'account' && <DigestPreview workspaceId={id} />}
          {tab === 'billing' && <BillingPage embedded />}
          {tab === 'workspace' && owner && (
            <>
              <div className="workspace-identity">
                <Panel title="Workspace details">
                  <QueryState query={q}>
                    {q.data && (
                      <form
                        className="stack-form"
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
                        <div className="form-grid">
                          <Field label="Workspace name">
                            <input
                              name="name"
                              required
                              defaultValue={q.data.workspace.name}
                            />
                          </Field>
                          <Field label="Default timezone">
                            <input
                              name="timezone"
                              required
                              defaultValue={q.data.workspace.timezone}
                            />
                          </Field>
                        </div>
                        {env.mocksEnabled && (
                          <>
                            <Field label="Workspace logo (PNG/JPEG/WebP, 1 MB)">
                              <input
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
                            {(logo ?? q.data.logo) && (
                              <img
                                className="workspace-logo"
                                src={logo ?? q.data.logo}
                                alt="Workspace logo preview"
                              />
                            )}
                            <button
                              type="button"
                              className="danger-link"
                              onClick={() => setLogo('')}
                            >
                              Remove logo
                            </button>
                          </>
                        )}

                        <button
                          className="primary-button"
                          disabled={command.pending}
                        >
                          Save workspace
                        </button>
                      </form>
                    )}

                    <div className="workspace-owner">
                      <span className="profile-avatar" aria-hidden="true">
                        {user?.displayName.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <strong>{user?.displayName}</strong>
                        <p>{user?.email}</p>
                      </div>
                      <Badge>OWNER</Badge>
                    </div>
                    <Link className="reference-info" to={`${base}/team`}>
                      Manage team settings
                    </Link>
                  </QueryState>
                </Panel>
              </div>
            </>
          )}
          {tab === 'workspace' && owner && (
            <>
              <TeamPage />
              <OwnershipPanel />
              <Link className="secondary-button" to={`${base}/team`}>
                Manage team settings
              </Link>
            </>
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

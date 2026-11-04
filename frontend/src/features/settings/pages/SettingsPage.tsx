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
  Empty,
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
  const [search, setSearch] = useSearchParams()
  const requestedView = search.get('view') || 'workspace'
  const tab = ['workspace', 'account', 'privacy', 'team', 'digest'].includes(
    requestedView,
  )
    ? requestedView
    : 'workspace'
  const q = useData<WorkspaceDetail & { logo: string; digestEnabled: boolean }>(
    `workspaces/${id}/settings`,
    { skip: !owner || tab === 'digest' },
  )
  const sessions = useData<{ data: SessionSummary[] }>('me/sessions')
  const command = useCommand()
  const [message, setMessage] = useState('')
  const [logo, setLogo] = useState<string | null>(null)
  const [deletion, setDeletion] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  if (!owner && tab !== 'account' && tab !== 'digest')
    return (
      <Empty
        title="Owner access required"
        description="Your owner manages workspace settings."
      />
    )
  return (
    <>
      <Heading
        title={
          tab === 'digest'
            ? 'Daily digest'
            : tab === 'account'
              ? 'My account'
              : tab === 'privacy'
                ? 'Data & privacy'
                : tab === 'team'
                  ? 'Workspace ownership'
                  : 'Workspace settings'
        }
        description="The details that make this space yours."
      />
      <SettingsNav active={tab} />
      <div className="settings-layout">
        <nav
          hidden={!owner}
          className="settings-subnav"
          aria-label="Workspace settings sections"
        >
          {[
            ['workspace', 'General'],
            ['team', 'Team settings'],
            ['privacy', 'Danger zone'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? 'active' : ''}
              onClick={() => setSearch({ view: key })}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {tab === 'account' && <AccountPanel />}
          {tab === 'digest' && <DigestPreview workspaceId={id} />}
          {tab === 'team' && (
            <>
              <OwnershipPanel />
              <Link className="secondary-button" to={`${base}/team`}>
                Manage team settings
              </Link>
            </>
          )}
          {tab === 'workspace' && (
            <>
              <div className="workspace-identity">
                <Panel title="General">
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
                                logo: logo ?? q.data!.logo,
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
          {tab === 'account' && (
            <Panel title="Active sessions">
              <p className="subtle">
                Revoke other sessions when a device is no longer yours.
              </p>
              {sessions.data?.data.map((s) => (
                <div className="access-row" key={s.id}>
                  <div className="grow">
                    <strong>{s.label}</strong>
                    <p>Last active {new Date(s.lastSeenAt).toLocaleString()}</p>
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
            </Panel>
          )}
          {tab === 'privacy' && (
            <Panel title="Archive or delete workspace">
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

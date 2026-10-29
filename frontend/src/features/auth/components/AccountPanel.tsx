import { authApi } from '@/features/auth/api/authApi'
import { identityReceived } from '@/features/auth/store/authSlice'
import { Notice } from '@/shared/components/Feedback'
import { Badge, ErrorNotice, Field, Panel } from '@/shared/components/ProductUI'
import { useAppDispatch } from '@/shared/hooks/useAppStore'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import { useState } from 'react'
import { Link } from 'react-router'

export function SettingsNav({ active }: { active: string }) {
  const { base, owner } = useWorkspace()
  return (
    <nav
      className="reference-tabs settings-tabs"
      aria-label="Settings navigation"
    >
      {[
        ...(owner ? [['workspace', `${base}/settings`, 'Workspace']] : []),
        ['account', `${base}/settings?view=account`, 'My account'],
        ...(owner
          ? [
              ['billing', `${base}/billing`, 'Billing'],
              ['usage', `${base}/billing?view=usage`, 'Usage'],
              ['privacy', `${base}/settings?view=privacy`, 'Data & privacy'],
              ['digest', `${base}/settings?view=digest`, 'Daily digest'],
            ]
          : []),
      ].map(([key, to, label]) => (
        <Link
          key={key}
          className={active === key ? 'active' : ''}
          aria-current={active === key ? 'page' : undefined}
          to={to}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
export function AccountPanel() {
  const { user } = useWorkspace(),
    command = useCommand(),
    dispatch = useAppDispatch()
  const [message, setMessage] = useState('')
  return (
    <>
      <Panel title="Profile">
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            if (
              await command.run(
                'me/profile',
                { displayName: f.get('name') },
                'PATCH',
              )
            ) {
              dispatch(
                identityReceived(
                  await dispatch(
                    authApi.endpoints.me.initiate(undefined, {
                      forceRefetch: true,
                    }),
                  ).unwrap(),
                ),
              )
              setMessage('Profile saved.')
            }
          }}
        >
          <div className="profile-grid">
            <div>
              <Field label="Full name">
                <input
                  name="name"
                  defaultValue={user?.displayName}
                  required
                  maxLength={100}
                />
              </Field>
              <Field label="Email address">
                <input type="email" value={user?.email || ''} readOnly />
              </Field>
              <Badge>{user?.verified ? 'VERIFIED' : 'UNVERIFIED'}</Badge>
            </div>
            <span className="profile-avatar" aria-hidden="true">
              {user?.displayName.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <button className="primary-button" disabled={command.pending}>
            Save profile
          </button>
        </form>
      </Panel>
      <Panel title="Password">
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault()
            const form = e.currentTarget,
              f = new FormData(form)
            if (
              await command.run('me/password', {
                currentPassword: f.get('current'),
                newPassword: f.get('next'),
              })
            ) {
              form.reset()
              setMessage('Password updated.')
            }
          }}
        >
          <div className="form-grid">
            <Field label="Current password">
              <input
                required
                name="current"
                type="password"
                autoComplete="current-password"
              />
            </Field>
            <Field label="New password">
              <input
                required
                name="next"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </Field>
          </div>
          <button className="primary-button" disabled={command.pending}>
            Update password
          </button>
        </form>
      </Panel>
      <ErrorNotice error={command.error} />
      {message && <Notice>{message}</Notice>}
    </>
  )
}

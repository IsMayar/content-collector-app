import { env } from '@/config/env'
import { ArrowUpRight } from 'lucide-react'
import { authApi } from '@/features/auth/api/authApi'
import { identityReceived } from '@/features/auth/store/authSlice'
import { Notice } from '@/shared/components/Feedback'
import { Badge, ErrorNotice, Field, Panel } from '@/shared/components/ProductUI'
import { useAppDispatch } from '@/shared/hooks/useAppStore'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import { useState } from 'react'
import { Link } from 'react-router'

export function AccountPanel() {
  const { user } = useWorkspace()
  const command = useCommand()
  const dispatch = useAppDispatch()
  const [message, setMessage] = useState('')
  const initials =
    user?.displayName
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase() || 'U'

  if (!env.mocksEnabled) {
    return (
      <div className="space-y-5">
        <Panel title="Profile">
          <div className="space-y-5">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700"
                aria-hidden="true"
              >
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-slate-950">
                  {user?.displayName}
                </p>
                <p className="mt-0.5 break-all text-sm text-slate-500">
                  {user?.email}
                </p>
              </div>
              <Badge>{user?.verified ? 'VERIFIED' : 'UNVERIFIED'}</Badge>
            </div>
            <p className="border-t border-slate-100 pt-4 text-xs text-slate-500">
              Your profile details are currently managed through your account.
            </p>
          </div>
        </Panel>

        <Panel title="Password">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">
                Change your password
              </p>
              <p className="mt-1 text-sm leading-5 text-slate-500">
                Use the secure reset flow to set a new password.
              </p>
            </div>
            <Link
              to="/forgot-password"
              className="secondary-button inline-flex shrink-0 items-center justify-center gap-2"
            >
              Reset password <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </Panel>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <Panel title="Profile">
        <div className="space-y-5">
          <div className="flex min-w-0 items-center gap-3 border-b border-slate-100 pb-5">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700"
              aria-hidden="true"
            >
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-slate-950">
                {user?.displayName}
              </p>
              <p className="mt-0.5 break-all text-sm text-slate-500">
                {user?.email}
              </p>
            </div>
            <Badge>{user?.verified ? 'VERIFIED' : 'UNVERIFIED'}</Badge>
          </div>

          <form
            className="space-y-5"
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
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
              <div className="min-w-0">
                <Field label="Full name">
                  <input
                    name="name"
                    defaultValue={user?.displayName}
                    required
                    maxLength={100}
                    className="!h-11 !w-full !rounded-lg !border !border-slate-300 !bg-white !px-3 !text-sm focus:!border-blue-600 focus:!outline-none focus:!ring-2 focus:!ring-blue-600/15"
                  />
                </Field>
              </div>
              <div className="min-w-0">
                <Field label="Email address">
                  <input
                    type="email"
                    value={user?.email || ''}
                    readOnly
                    className="!h-11 !w-full !rounded-lg !border !border-slate-200 !bg-slate-50 !px-3 !text-sm !text-slate-600"
                  />
                </Field>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="primary-button"
                disabled={command.pending}
              >
                Save profile
              </button>
            </div>
          </form>
        </div>
      </Panel>

      <Panel title="Password">
        <form
          className="space-y-5"
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
          <p className="text-sm leading-5 text-slate-500">
            Choose a new password to keep your account secure.
          </p>
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
            <div className="min-w-0">
              <Field label="Current password">
                <input
                  required
                  name="current"
                  type="password"
                  autoComplete="current-password"
                  className="!h-11 !w-full !rounded-lg !border !border-slate-300 !bg-white !px-3 !text-sm focus:!border-blue-600 focus:!outline-none focus:!ring-2 focus:!ring-blue-600/15"
                />
              </Field>
            </div>
            <div className="min-w-0">
              <Field label="New password">
                <input
                  required
                  name="next"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  className="!h-11 !w-full !rounded-lg !border !border-slate-300 !bg-white !px-3 !text-sm focus:!border-blue-600 focus:!outline-none focus:!ring-2 focus:!ring-blue-600/15"
                />
              </Field>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">12–128 characters</p>
            <button
              type="submit"
              className="primary-button"
              disabled={command.pending}
            >
              Update password
            </button>
          </div>
        </form>
      </Panel>
      <ErrorNotice error={command.error} />
      {message && <Notice>{message}</Notice>}
    </div>
  )
}

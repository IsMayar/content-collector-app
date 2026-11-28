import { env } from '@/config/env'
import { authApi } from '@/features/auth/api/authApi'
import { identityReceived } from '@/features/auth/store/authSlice'
import { Notice } from '@/shared/components/Feedback'
import { ErrorNotice } from '@/shared/components/ProductUI'
import { useAppDispatch } from '@/shared/hooks/useAppStore'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import { ArrowUpRight, LockKeyhole, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

const inputClass =
  'mt-1.5 h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15'

const buttonClass =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'

const primaryClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50'

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

  return (
    <section
      aria-labelledby="account-profile-security"
      className="settings-card min-w-0 rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <UserRound size={20} aria-hidden="true" />
        </span>

        <div>
          <h2
            id="account-profile-security"
            className="text-lg font-semibold text-[#0A1A2F]"
          >
            Profile &amp; security
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Your account details and password settings.
          </p>
        </div>
      </div>

      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-3">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-base font-semibold text-blue-700"
          aria-hidden="true"
        >
          {initials}
        </span>

        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-slate-900">
            {user?.displayName}
          </p>
          <p className="mt-0.5 break-all text-sm text-slate-500">
            {user?.email}
          </p>
        </div>

        <span
          className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
            user?.verified
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-amber-50 text-amber-700'
          }`}
        >
          {user?.verified ? 'Verified' : 'Unverified'}
        </span>
      </div>

      {env.mocksEnabled && (
        <form
          className="mt-4 border-t border-slate-200 pt-4"
          onSubmit={async (event) => {
            event.preventDefault()
            const fields = new FormData(event.currentTarget)

            if (
              await command.run(
                'me/profile',
                { displayName: fields.get('name') },
                'PATCH',
              )
            ) {
              const result = await dispatch(
                authApi.endpoints.me.initiate(undefined, {
                  forceRefetch: true,
                }),
              ).unwrap()

              dispatch(identityReceived(result))
              setMessage('Profile saved.')
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-800">
              Full name
              <input
                name="name"
                required
                maxLength={100}
                defaultValue={user?.displayName}
                className={inputClass}
              />
            </label>

            <label className="text-sm font-medium text-slate-800">
              Email address
              <input
                type="email"
                value={user?.email || ''}
                readOnly
                className={`${inputClass} bg-slate-50 text-slate-500`}
              />
            </label>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              className={primaryClass}
              disabled={command.pending}
            >
              Save profile
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 border-t border-slate-200 pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <LockKeyhole size={17} aria-hidden="true" />
            </span>

            <div>
              <h3 className="text-sm font-semibold text-slate-900">Password</h3>

              <p className="mt-1 text-sm leading-5 text-slate-500">
                {env.mocksEnabled
                  ? 'Update your password using the fields below.'
                  : 'Set a new password securely.'}
              </p>
            </div>
          </div>

          {!env.mocksEnabled && (
            <Link to="/forgot-password" className={`${buttonClass} shrink-0`}>
              Reset password
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          )}
        </div>

        {env.mocksEnabled && (
          <form
            className="mt-4"
            onSubmit={async (event) => {
              event.preventDefault()
              const form = event.currentTarget
              const fields = new FormData(form)

              if (
                await command.run('me/password', {
                  currentPassword: fields.get('current'),
                  newPassword: fields.get('next'),
                })
              ) {
                form.reset()
                setMessage('Password updated.')
              }
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-800">
                Current password
                <input
                  required
                  name="current"
                  type="password"
                  autoComplete="current-password"
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-medium text-slate-800">
                New password
                <input
                  required
                  name="next"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-500">12–128 characters</span>

              <button
                type="submit"
                className={primaryClass}
                disabled={command.pending}
              >
                Update password
              </button>
            </div>
          </form>
        )}
      </div>

      <ErrorNotice error={command.error} />
      {message && (
        <div className="mt-4">
          <Notice>{message}</Notice>
        </div>
      )}
    </section>
  )
}

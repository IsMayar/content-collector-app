import { env } from '@/config/env'
import type { NotificationPreferences } from '@/features/workspace/types/workspace.types'
import { usePortalData } from '@/services/api/resourceApi'
import { Notice } from '@/shared/components/Feedback'
import { Badge, ErrorNotice, Field, Panel } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useState } from 'react'

export function ClientPreferences({
  root,
  emailOnly = false,
}: {
  root: string
  emailOnly?: boolean
}) {
  const q = usePortalData<NotificationPreferences>(
    `${root}/notification-preferences`,
  )

  const smsAvailable = !emailOnly && (q.data?.smsAvailable ?? env.mocksEnabled)

  const command = useCommand(true)

  const [verification, setVerification] = useState('')
  const [message, setMessage] = useState('')

  return (
    <div className="sms-preferences">
      <Panel title="Reminder preferences">
        <div className="space-y-6">
          {/* Introduction */}
          <p className="text-sm leading-6 text-slate-500">
            Manage how you receive reminders about this project.
          </p>

          {/* Feedback */}
          <ErrorNotice
            error={
              command.error ||
              (q.isError
                ? 'Unable to load reminder preferences. Try again.'
                : undefined)
            }
          />

          {message && <Notice>{message}</Notice>}

          {/* Loading */}
          {q.isLoading && !q.data && (
            <p role="status" className="text-sm text-slate-500">
              Loading reminder preferences…
            </p>
          )}

          {/* Email preferences */}
          {q.data && (
            <form
              className="space-y-5"
              onSubmit={async (e) => {
                e.preventDefault()

                const v = new FormData(e.currentTarget)

                if (
                  await command.run(
                    `${root}/notification-preferences`,
                    {
                      emailEnabled: v.has('emailEnabled'),
                      timezone: v.get('timezone') || null,
                    },
                    'PUT',
                  )
                ) {
                  setMessage('Preferences saved.')
                }
              }}
            >
              {/* Email toggle */}
              <div className="flex items-center justify-between gap-4">
                <label
                  htmlFor="client-email-reminders"
                  className="min-w-0 flex-1 cursor-pointer"
                >
                  <span className="block text-sm font-semibold text-slate-900">
                    Email reminders
                  </span>

                  <span className="mt-1 block text-sm leading-5 text-slate-500">
                    Get notified when your input is needed.
                  </span>
                </label>

                <input
                  id="client-email-reminders"
                  name="emailEnabled"
                  type="checkbox"
                  role="switch"
                  defaultChecked={q.data.emailEnabled}
                  className="!relative !h-6 !w-11 !shrink-0 !cursor-pointer !appearance-none !rounded-full !border-0 !bg-slate-300 !p-0 transition-colors checked:!bg-blue-600 focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-blue-600 before:!absolute before:!left-0.5 before:!top-0.5 before:!h-5 before:!w-5 before:!rounded-full before:!bg-white before:!shadow-sm before:!content-[''] before:transition-transform checked:before:translate-x-5"
                />
              </div>

              {/* Timezone */}
              <div className="max-w-lg">
                <Field label="Your timezone">
                  <input
                    name="timezone"
                    type="text"
                    defaultValue={q.data.timezone || ''}
                    placeholder="e.g. America/New_York"
                    autoComplete="off"
                    className="!box-border !h-11 !w-full !rounded-lg !border !border-slate-300 !bg-white !px-3 !py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:!border-blue-500 focus:!outline-none focus:!ring-2 focus:!ring-blue-500/20"
                  />
                </Field>

                <p className="mt-2 text-xs text-slate-500">
                  Used to schedule reminders in your local time.
                </p>
              </div>

              {/* Save */}
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="primary-button inline-flex min-h-11 items-center justify-center"
                  disabled={command.pending}
                >
                  Save preferences
                </button>
              </div>
            </form>
          )}

          {/* SMS unavailable */}
          {!emailOnly && !smsAvailable && (
            <section className="border-t border-slate-200 pt-5">
              <h3 className="text-sm font-semibold text-slate-900">
                Text reminders
              </h3>

              <p role="status" className="mt-2 text-sm text-slate-500">
                Text reminders aren’t available right now. Email reminders are
                still available.
              </p>
            </section>
          )}

          {/* SMS enrollment */}
          {smsAvailable && (
            <section className="space-y-5 border-t border-slate-200 pt-6">
              {/* Section heading */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Text reminders
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Receive optional project reminders by SMS.
                  </p>
                </div>

                <Badge>{q.data?.smsStatus || 'NOT_CONFIGURED'}</Badge>
              </div>

              {/* Timezone warning */}
              {!q.data?.timezone && (
                <p className="text-sm text-amber-700">
                  Save your timezone above before requesting a code.
                </p>
              )}

              {/* Phone verification request */}
              <form
                className="space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault()

                  const v = new FormData(e.currentTarget)

                  const result = await command.run<{
                    verificationId: string
                  }>(`${root}/sms/verification`, {
                    phoneE164: v.get('phone'),
                    consent: v.has('consent'),
                    consentTextVersion:
                      q.data?.smsConsentTextVersion || '2026-11-03',
                  })

                  if (result) {
                    setVerification(result.verificationId)

                    setMessage(
                      env.mocksEnabled
                        ? 'Synthetic verification code: 123456'
                        : 'Verification queued. Enter the code sent to your phone. It expires in 10 minutes.',
                    )
                  }
                }}
              >
                <div className="max-w-lg">
                  <Field label="US mobile number">
                    <input
                      type="tel"
                      name="phone"
                      pattern="\+1[0-9]{10}"
                      placeholder="+15555550123"
                      autoComplete="tel"
                      required
                      className="!box-border !h-11 !w-full !rounded-lg !border !border-slate-300 !bg-white !px-3 !py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:!border-blue-500 focus:!outline-none focus:!ring-2 focus:!ring-blue-500/20"
                    />
                  </Field>

                  <p className="mt-2 text-xs text-slate-500">
                    Enter +1 followed by your 10-digit US number.
                  </p>
                </div>

                {/* SMS consent */}
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    required
                    name="consent"
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                  />

                  <span className="text-sm leading-6 text-slate-700">
                    I agree to project reminder texts at this number.
                  </span>
                </label>

                <p className="max-w-2xl text-xs leading-5 text-slate-500">
                  Consent is optional. Message and data rates may apply. Reply
                  STOP to opt out or HELP for help. Messages are limited to this
                  project, and you can withdraw consent at any time.
                </p>

                <button
                  type="submit"
                  className="secondary-button inline-flex min-h-11 items-center justify-center"
                  disabled={command.pending || !q.data?.timezone}
                >
                  Send verification code
                </button>
              </form>

              {/* Verification code */}
              {verification && (
                <div className="space-y-4 border-t border-slate-100 pt-5">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">
                      Verify your number
                    </h4>

                    <p className="mt-1 text-sm text-slate-500">
                      Enter the six-digit code sent to your phone.
                    </p>
                  </div>

                  <form
                    className="flex flex-col items-start gap-3 sm:flex-row sm:items-end"
                    onSubmit={async (e) => {
                      e.preventDefault()

                      const code = new FormData(e.currentTarget).get('code')

                      if (
                        await command.run(`${root}/sms/verification/confirm`, {
                          verificationId: verification,
                          code,
                        })
                      ) {
                        setMessage(
                          'Your phone is verified and SMS reminders are enabled.',
                        )
                        setVerification('')
                      }
                    }}
                  >
                    <div className="w-full max-w-xs">
                      <Field label="Verification code">
                        <input
                          name="code"
                          inputMode="numeric"
                          required
                          pattern="[0-9]{6}"
                          maxLength={6}
                          autoComplete="one-time-code"
                          placeholder="6-digit code"
                          className="!box-border !h-11 !w-full !rounded-lg !border !border-slate-300 !bg-white !px-3 !py-2 text-sm tracking-widest text-slate-900 placeholder:tracking-normal placeholder:text-slate-400 focus:!border-blue-500 focus:!outline-none focus:!ring-2 focus:!ring-blue-500/20"
                        />
                      </Field>
                    </div>

                    <button
                      type="submit"
                      className="primary-button inline-flex min-h-11 items-center justify-center"
                      disabled={command.pending}
                    >
                      Verify number
                    </button>
                  </form>
                </div>
              )}

              {/* SMS opt-out */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    Stop text reminders
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Withdraw your SMS consent at any time.
                  </p>
                </div>

                <button
                  type="button"
                  className="danger-link"
                  disabled={command.pending}
                  onClick={async () => {
                    if (
                      await command.run(
                        `${root}/sms/consent`,
                        undefined,
                        'DELETE',
                      )
                    ) {
                      setMessage('SMS reminders stopped.')
                      setVerification('')
                    }
                  }}
                >
                  Opt out of SMS
                </button>
              </div>
            </section>
          )}

          {/* SMS allowance */}
          {q.data?.smsUsage && (
            <details className="group border-t border-slate-200 pt-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2 marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-medium text-slate-900">
                  Text message allowance
                </span>

                <span
                  aria-hidden="true"
                  className="text-sm text-slate-400 transition-transform group-open:rotate-180"
                >
                  ⌄
                </span>
              </summary>

              <div className="space-y-3 pt-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-slate-500">Used</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {q.data.smsUsage.usedSegments}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">Reserved</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {q.data.smsUsage.reservedSegments}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">Allowance</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {q.data.smsUsage.allowance}
                    </p>
                  </div>
                </div>

                <p role="status" className="text-xs leading-5 text-slate-500">
                  Spending cap: $
                  {(q.data.smsUsage.spendingLimitMicrousd / 1000000).toFixed(2)}
                  . Verification messages also use this allowance.
                </p>
              </div>
            </details>
          )}
        </div>
      </Panel>
    </div>
  )
}

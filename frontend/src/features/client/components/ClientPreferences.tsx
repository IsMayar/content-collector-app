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
        <ErrorNotice
          error={
            command.error ||
            (q.isError
              ? 'Unable to load reminder preferences. Try again.'
              : undefined)
          }
        />
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
                    timezone: v.get('timezone') || null,
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
                defaultValue={q.data.timezone || ''}
                placeholder="e.g. America/New_York"
              />
            </Field>
            <button className="secondary-button">Save preferences</button>
          </form>
        )}
        {!emailOnly && !smsAvailable && (
          <p role="status">
            SMS reminders are unavailable until the provider and sender are
            approved. Email preferences remain available.
          </p>
        )}
        {q.data?.smsUsage && (
          <p role="status">
            SMS segments: {q.data.smsUsage.usedSegments} used,{' '}
            {q.data.smsUsage.reservedSegments} reserved of{' '}
            {q.data.smsUsage.allowance}. Spending cap: $
            {(q.data.smsUsage.spendingLimitMicrousd / 1000000).toFixed(2)}.
            Verification messages also use this allowance.
          </p>
        )}
        {smsAvailable && (
          <div className="sms-enrolment">
            <section>
              <h3>Optional US SMS reminders</h3>
              {!q.data?.timezone && (
                <p>Save your timezone above before requesting a code.</p>
              )}
              <p>
                Consent is optional. Message and data rates may apply. Reply
                STOP to opt out or HELP for help. Messages are limited to this
                project; you can withdraw at any time.
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
                      consentTextVersion:
                        q.data?.smsConsentTextVersion || '2026-11-03',
                    },
                  )
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
                  <input required name="consent" type="checkbox" />I agree to
                  project reminder texts at this number.
                </label>
                <button
                  className="secondary-button"
                  disabled={command.pending || !q.data?.timezone}
                >
                  Send verification code
                </button>
              </form>
            </section>
            <section className="sms-verification">
              <h3>Verify your number</h3>
              <p>Confirm control of your phone before reminders are enabled.</p>
              {verification && (
                <form
                  className="inline-form"
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
            </section>
          </div>
        )}
        {!emailOnly && (
          <button
            className="danger-link"
            onClick={async () => {
              if (await command.run(`${root}/sms/consent`, undefined, 'DELETE'))
                setMessage('SMS reminders stopped.')
            }}
          >
            Opt out of SMS
          </button>
        )}
      </Panel>
    </div>
  )
}

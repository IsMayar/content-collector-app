import type { NotificationPreferences } from '@/features/workspace/types/workspace.types'
import { usePortalData } from '@/services/api/resourceApi'
import { Notice } from '@/shared/components/Feedback'
import { Badge, ErrorNotice, Field, Panel } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useState } from 'react'

export function ClientPreferences({ root }: { root: string }) {
  const q = usePortalData<NotificationPreferences>(
    `${root}/notification-preferences`,
  )
  const command = useCommand(true)
  const [verification, setVerification] = useState('')
  const [message, setMessage] = useState('')
  return (
    <div className="sms-preferences">
      <Panel title="Stay updated by text">
        <ErrorNotice error={command.error} />
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
                    timezone: v.get('timezone'),
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
                defaultValue={q.data.timezone || 'America/New_York'}
                required
              />
            </Field>
            <button className="secondary-button">Save preferences</button>
          </form>
        )}
        <div className="sms-enrolment">
          <section>
            <h3>Optional US SMS reminders</h3>
            <p>
              Consent is optional. Message and data rates may apply. Reply STOP
              to opt out. No real messages are sent in this demo.
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
                    consentTextVersion: '2026-10-22',
                  },
                )
                if (result) {
                  setVerification(result.verificationId)
                  setMessage('Synthetic verification code: 123456')
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
              <button className="secondary-button" disabled={command.pending}>
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
                    await command.run(`${root}/sms/confirm`, {
                      verificationId: verification,
                      code,
                    })
                  ) {
                    setMessage('SMS consent verified in the demo.')
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
        <button
          className="danger-link"
          onClick={async () => {
            if (await command.run(`${root}/sms/consent`, undefined, 'DELETE'))
              setMessage('SMS reminders stopped.')
          }}
        >
          Opt out of SMS
        </button>
      </Panel>
    </div>
  )
}

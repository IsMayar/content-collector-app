import type { NotificationPreferences } from '@/features/workspace/types/workspace.types'
import { usePortalData } from '@/services/api/resourceApi'
import { Notice } from '@/shared/components/Feedback'
import { ErrorNotice, Field, Panel } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useState } from 'react'

export function ClientPreferences({
  root,
}: {
  root: string
  emailOnly?: boolean
}) {
  const q = usePortalData<NotificationPreferences>(
    `${root}/notification-preferences`,
  )

  const command = useCommand(true)

  const [message, setMessage] = useState('')

  return (
    <div className="email-preferences">
      <Panel title="Reminder preferences">
        <div className="space-y-3">
          {/* Introduction */}
          <p className="text-sm leading-6 text-slate-500">
            Choose whether to receive email reminders for this project.
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
              className="space-y-3"
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
              <div className="w-full">
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

        </div>
      </Panel>
    </div>
  )
}

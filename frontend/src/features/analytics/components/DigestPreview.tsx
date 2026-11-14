import { useData } from '@/services/api/resourceApi'
import { Notice } from '@/shared/components/Feedback'
import { ErrorNotice, Panel, QueryState } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useState } from 'react'
import { ExternalLink, Info } from 'lucide-react'

type Preference = {
  enabled: boolean
  version: number
  timezone: string
  sendTime: string
}

type Preview = {
  timezone: string
  sendTime: string
  projects: {
    alias: string
    awaitingReview: number
    clientAction: number
    url: string
  }[]
}

export function DigestPreview({ workspaceId }: { workspaceId: string }) {
  const root = `workspaces/${workspaceId}`

  const settings = useData<Preference>(`${root}/digest-preferences`)

  const q = useData<Preview>(`${root}/digest-preview`)

  const command = useCommand()
  const [message, setMessage] = useState('')

  return (
    <Panel title="Daily digest">
      <div className="space-y-5">
        {/* Description */}
        <p className="max-w-2xl text-sm leading-6 text-slate-500">
          A daily summary of updates across your assigned projects.
        </p>

        {/* Preferences */}
        <QueryState query={settings}>
          {settings.data && (
            <form
              key={settings.data.version}
              className="space-y-5"
              onSubmit={async (e) => {
                e.preventDefault()

                const form = new FormData(e.currentTarget)

                if (
                  await command.run(
                    `${root}/digest-preferences`,
                    {
                      enabled: form.has('enabled'),
                      expectedVersion: settings.data!.version,
                    },
                    'PUT',
                  )
                ) {
                  setMessage('Daily digest preference saved.')
                }
              }}
            >
              <div className="border-t border-slate-200" />

              {/* Daily digest toggle */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="daily-digest-enabled"
                    className="block text-sm font-semibold text-slate-900"
                  >
                    Daily email summary
                  </label>

                  <p className="mt-1 text-sm leading-5 text-slate-500">
                    Receive one email with updates from projects assigned to
                    you.
                  </p>
                </div>

                <input
                  id="daily-digest-enabled"
                  type="checkbox"
                  role="switch"
                  name="enabled"
                  defaultChecked={settings.data.enabled}
                  className="peer relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-slate-300 outline-none transition-colors checked:bg-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 before:absolute before:left-0.5 before:top-0.5 before:h-5 before:w-5 before:rounded-full before:bg-white before:shadow-sm before:transition-transform checked:before:translate-x-5"
                />
              </div>

              {/* Delivery schedule + Save */}
              <div className="flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Delivery schedule
                  </p>

                  <p className="mt-1.5 text-sm font-medium text-slate-900">
                    {settings.data.sendTime}
                    <span className="mx-2 text-slate-300">·</span>
                    <span className="break-words">
                      {settings.data.timezone}
                    </span>
                  </p>
                </div>

                <button
                  type="submit"
                  className="primary-button shrink-0"
                  disabled={command.pending}
                >
                  Save preferences
                </button>
              </div>
            </form>
          )}
        </QueryState>

        {/* Upcoming digest */}
        <section
          aria-labelledby="digest-preview-heading"
          className="space-y-3 border-t border-slate-200 pt-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3
                id="digest-preview-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Upcoming digest
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                What your next email will include.
              </p>
            </div>

            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Preview
            </span>
          </div>

          <QueryState query={q}>
            {q.data && (
              <div>
                {q.data.projects.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {q.data.projects.map((project, index) => (
                      <article
                        key={index}
                        className="flex flex-col gap-2 py-3 first:pt-1 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <h4 className="break-words text-sm font-medium text-slate-900">
                            {project.alias}
                          </h4>

                          <p className="mt-1 text-xs text-slate-500">
                            {project.awaitingReview} awaiting review
                            <span className="mx-2 text-slate-300">·</span>
                            {project.clientAction} client actions
                          </p>
                        </div>

                        <a
                          href={project.url}
                          className="inline-flex shrink-0 items-center gap-1.5 self-start text-xs font-medium text-blue-600 hover:underline sm:self-auto"
                        >
                          Open project
                          <ExternalLink size={13} aria-hidden="true" />
                        </a>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="py-5 text-sm text-slate-500">
                    No eligible assigned projects.
                  </p>
                )}

                <p className="mt-3 text-xs text-slate-400">
                  Preview only. No email is sent.
                </p>
              </div>
            )}
          </QueryState>
        </section>

        {/* Delivery information */}
        <div className="flex items-start gap-2 border-t border-slate-100 pt-4">
          <Info
            size={15}
            className="mt-0.5 shrink-0 text-slate-400"
            aria-hidden="true"
          />

          <p className="text-xs leading-5 text-slate-500">
            The digest uses your workspace timezone and replaces duplicate
            agency item-level notifications. Client reminders remain separate.
            Delivery requires a configured email service; saving this preference
            does not enable an email provider.
          </p>
        </div>

        {/* Existing feedback */}
        <ErrorNotice error={command.error} />
        {message && <Notice>{message}</Notice>}
      </div>
    </Panel>
  )
}

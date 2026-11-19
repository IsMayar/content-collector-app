import { useData } from '@/services/api/resourceApi'
import { Notice } from '@/shared/components/Feedback'
import { ErrorNotice, QueryState } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { Bell, CalendarDays, ExternalLink, Info, Mail } from 'lucide-react'
import { useState } from 'react'

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
  const preview = useData<Preview>(`${root}/digest-preview`)
  const command = useCommand()
  const [message, setMessage] = useState('')

  return (
    <section
      aria-labelledby="daily-digest-heading"
      className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Bell size={19} aria-hidden="true" />
        </span>

        <div className="min-w-0">
          <h2
            id="daily-digest-heading"
            className="text-lg font-semibold text-[#0A1A2F]"
          >
            Daily digest
          </h2>

          <p className="mt-1 text-sm leading-5 text-slate-500">
            One email with updates from your assigned projects.
          </p>
        </div>
      </header>

      <QueryState query={settings}>
        {settings.data && (
          <form
            key={settings.data.version}
            className="mt-5"
            onSubmit={async (event) => {
              event.preventDefault()
              const fields = new FormData(event.currentTarget)

              if (
                await command.run(
                  `${root}/digest-preferences`,
                  {
                    enabled: fields.has('enabled'),
                    expectedVersion: settings.data!.version,
                  },
                  'PUT',
                )
              ) {
                setMessage('Daily digest preference saved.')
                void settings.refetch()
              }
            }}
          >
            <div className="grid items-center gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)_auto]">
              <div className="flex min-w-0 items-center justify-between gap-4">
                <div className="min-w-0">
                  <label
                    htmlFor="daily-digest-enabled"
                    className="text-sm font-semibold text-slate-900"
                  >
                    Daily email summary
                  </label>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Turn your daily update on or off.
                  </p>
                </div>

                <input
                  id="daily-digest-enabled"
                  name="enabled"
                  type="checkbox"
                  role="switch"
                  defaultChecked={settings.data.enabled}
                  className="relative h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full bg-slate-300 shadow-inner outline-none transition-colors before:absolute before:left-1 before:top-1 before:h-5 before:w-5 before:rounded-full before:bg-white before:shadow-sm before:transition-transform checked:bg-blue-600 checked:before:translate-x-5 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                />
              </div>

              <div className="flex min-w-0 items-center gap-3 border-slate-200 md:border-l md:pl-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600">
                  <CalendarDays size={18} aria-hidden="true" />
                </span>

                <div className="min-w-0">
                  <p className="text-xs text-slate-500">Scheduled delivery</p>
                  <p className="mt-1 break-words text-sm font-semibold text-slate-900">
                    {settings.data.sendTime}
                    <span className="px-1 text-slate-300">·</span>
                    {settings.data.timezone}
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={command.pending}
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {command.pending ? 'Saving…' : 'Save preferences'}
              </button>
            </div>
          </form>
        )}
      </QueryState>

      <section aria-labelledby="digest-preview-heading" className="mt-6">
        <div className="mb-3 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Mail size={18} aria-hidden="true" />
          </span>

          <div>
            <h3
              id="digest-preview-heading"
              className="text-sm font-semibold text-slate-900"
            >
              Upcoming digest preview
            </h3>

            <p className="mt-1 text-xs text-slate-500">
              A preview of the project updates that may appear in your next
              email.
            </p>
          </div>
        </div>

        <QueryState query={preview}>
          {preview.data && (
            <>
              {preview.data.projects.length > 0 ? (
                <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                  {preview.data.projects.map((project, index) => (
                    <article
                      key={`${project.url}-${index}`}
                      className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:flex-nowrap"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold text-slate-900">
                          {project.alias}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {project.awaitingReview} awaiting review
                          <span className="mx-2 text-slate-300">·</span>
                          {project.clientAction} client actions
                        </p>
                      </div>

                      <a
                        href={project.url}
                        className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      >
                        Open project
                        <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  No eligible assigned projects.
                </p>
              )}

              <p className="mt-2 text-xs text-slate-500">
                Preview only. No email is sent.
              </p>
            </>
          )}
        </QueryState>
      </section>

      <section
        aria-labelledby="digest-delivery-heading"
        className="mt-5 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4"
      >
        <Info
          size={18}
          className="mt-0.5 shrink-0 text-blue-600"
          aria-hidden="true"
        />

        <div className="min-w-0">
          <h3
            id="digest-delivery-heading"
            className="text-sm font-semibold text-slate-900"
          >
            About email delivery
          </h3>

          <p className="mt-1 text-xs leading-5 text-slate-600">
            Uses your workspace timezone and replaces duplicate agency
            item-level notifications. Client reminders are separate. Email
            delivery needs a configured provider; this setting does not
            configure one.
          </p>
        </div>
      </section>

      <ErrorNotice error={command.error} />

      {message && (
        <div className="mt-4">
          <Notice>{message}</Notice>
        </div>
      )}
    </section>
  )
}

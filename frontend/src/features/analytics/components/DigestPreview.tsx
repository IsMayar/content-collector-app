import { useData } from '@/services/api/resourceApi'
import { Notice } from '@/shared/components/Feedback'
import { ErrorNotice, Panel, QueryState } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
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
  const q = useData<Preview>(`${root}/digest-preview`)
  const command = useCommand()
  const [message, setMessage] = useState('')
  return (
    <Panel title="Daily digest">
      <p>
        One opt-in daily summary in your workspace timezone. Members receive
        only projects currently assigned to them. Client reminders are separate.
      </p>
      <div className="digest-layout">
        <QueryState query={settings}>
          {settings.data && (
            <form
              className="stack-form"
              key={settings.data.version}
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
                )
                  setMessage('Daily digest preference saved.')
              }}
            >
              <h3>Digest settings</h3>
              <label className="permission-choice">
                <input
                  type="checkbox"
                  role="switch"
                  name="enabled"
                  defaultChecked={settings.data.enabled}
                />
                <span>Receive my daily digest</span>
              </label>
              <p>
                {settings.data.sendTime} · {settings.data.timezone}
              </p>
              <p className="subtle">
                Uses the workspace timezone. Digest mode replaces any duplicate
                agency item-level notifications. Delivery requires the
                configured email service; saving this preference does not enable
                a provider.
              </p>
              <button className="primary-button" disabled={command.pending}>
                Save digest settings
              </button>
            </form>
          )}
        </QueryState>
        <section className="digest-preview">
          <h3>Next digest preview</h3>
          <QueryState query={q}>
            {q.data && (
              <>
                {q.data.projects.map((project, index) => (
                  <article key={index}>
                    <strong>{project.alias}</strong>
                    <p>
                      {project.awaitingReview} awaiting review ·{' '}
                      {project.clientAction} awaiting client action
                    </p>
                    <a href={project.url}>Open private project</a>
                  </article>
                ))}
                {q.data.projects.length === 0 && (
                  <p>No eligible assigned projects.</p>
                )}
                <small>Preview only. No email is sent.</small>
              </>
            )}
          </QueryState>
        </section>
      </div>
      <ErrorNotice error={command.error} />
      {message && <Notice>{message}</Notice>}
    </Panel>
  )
}

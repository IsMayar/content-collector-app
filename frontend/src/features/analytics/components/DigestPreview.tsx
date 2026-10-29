import type { Workspace } from '@/features/workspace/types/workspace.types'
import { useData } from '@/services/api/resourceApi'
import { Notice } from '@/shared/components/Feedback'
import {
  ErrorNotice,
  Field,
  Panel,
  QueryState,
} from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useState } from 'react'

export function DigestPreview({ workspaceId }: { workspaceId: string }) {
  const q = useData<{
    workspaceName: string
    activeProjects: number
    required: number
    submitted: number
    approved: number
    clientAction: number
  }>(`workspaces/${workspaceId}/digest-preview`)
  const settings = useData<{ workspace: Workspace; digestEnabled: boolean }>(
      `workspaces/${workspaceId}/settings`,
    ),
    command = useCommand(),
    [message, setMessage] = useState('')
  return (
    <Panel title="Daily digest">
      <p>
        Receive one daily summary of client actions and items awaiting review in
        your workspace timezone.
      </p>
      <div className="digest-layout">
        <form
          className="stack-form"
          key={settings.data?.workspace.version}
          onSubmit={async (e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            if (
              settings.data &&
              (await command.run(
                `workspaces/${workspaceId}`,
                {
                  name: settings.data.workspace.name,
                  timezone: f.get('timezone'),
                  digestEnabled: f.has('enabled'),
                  expectedVersion: settings.data.workspace.version,
                },
                'PATCH',
              ))
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
              defaultChecked={settings.data?.digestEnabled}
            />
            <span>
              <strong>Receive daily digest</strong>
              <small>
                Private summaries are restricted to authorised projects.
              </small>
            </span>
          </label>
          <Field label="Digest timezone">
            <input
              name="timezone"
              required
              defaultValue={settings.data?.workspace.timezone}
            />
          </Field>
          <p className="subtle">
            Uses your workspace timezone and your configured delivery service.
          </p>
          <button
            className="primary-button"
            disabled={!settings.data || command.pending}
          >
            Save digest settings
          </button>
        </form>
        <section className="digest-preview">
          <h3>Next digest preview</h3>
          <QueryState query={q}>
            {q.data && (
              <>
                <strong className="email-brand">▣ Content Collector</strong>
                <p>Daily digest · {q.data.workspaceName}</p>
                <div className="digest-count">
                  <strong>{q.data.clientAction}</strong>
                  <span>Awaiting client action</span>
                </div>
                <div className="digest-count">
                  <strong>
                    {Math.max(0, q.data.submitted - q.data.approved)}
                  </strong>
                  <span>Awaiting your review</span>
                </div>
                <p>{q.data.activeProjects} active projects</p>
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

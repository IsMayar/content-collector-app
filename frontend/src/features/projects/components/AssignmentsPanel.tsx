import type { Assignment } from '@/features/projects/types/project.types'
import type { Member } from '@/features/workspace/types/workspace.types'
import { useData } from '@/services/api/resourceApi'
import { ErrorNotice, Panel } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'

export function AssignmentsPanel({ root }: { root: string }) {
  const { id } = useWorkspace()
  const members = useData<{ data: Member[] }>(`workspaces/${id}/members`)
  const assignments = useData<{ data: Assignment[] }>(`${root}/assignments`)
  const command = useCommand()
  return (
    <Panel title="Project team">
      <p className="subtle">
        Members see assigned projects only. Grant review and export separately.
      </p>
      <ErrorNotice error={command.error} />
      {members.data?.data
        .filter((m) => m.role === 'MEMBER' && m.state === 'ACTIVE')
        .map((m) => {
          const a = assignments.data?.data.find((a) => a.memberId === m.id)
          return (
            <form
              className="access-row"
              key={`${m.id}-${JSON.stringify(a)}`}
              onSubmit={async (e) => {
                e.preventDefault()
                const v = new FormData(e.currentTarget)
                await command.run(
                  `${root}/assignments/${m.id}`,
                  { canReview: v.has('review'), canExport: v.has('export') },
                  'PUT',
                )
              }}
            >
              <div className="grow">
                <strong>{m.user.displayName}</strong>
                <p>{m.user.email}</p>
              </div>
              <label className="check-row">
                <input
                  name="review"
                  type="checkbox"
                  defaultChecked={a?.canReview}
                />
                Review
              </label>
              <label className="check-row">
                <input
                  name="export"
                  type="checkbox"
                  defaultChecked={a?.canExport}
                />
                Export
              </label>
              <button className="secondary-button" disabled={command.pending}>
                {a ? 'Save permissions' : 'Assign'}
              </button>
              {a && (
                <button
                  type="button"
                  className="danger-link"
                  onClick={() =>
                    void command.run(
                      `${root}/assignments/${m.id}`,
                      undefined,
                      'DELETE',
                    )
                  }
                >
                  Remove
                </button>
              )}
            </form>
          )
        })}
    </Panel>
  )
}

import { useAssignments } from '@/features/projects/api/assignmentsApi'
import { useTeam } from '@/features/workspace/api/teamApi'
import { ErrorNotice, Panel, QueryState } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import { useState } from 'react'

export function AssignmentsPanel({ root }: { root: string }) {
  const { id } = useWorkspace()
  const members = useTeam(id)
  const assignments = useAssignments(root)
  const command = useCommand()
  const [search, setSearch] = useState('')
  const teammates = members.data?.data.filter(
    (member) => member.role === 'MEMBER' && member.state === 'ACTIVE',
  )
  const visible = teammates?.filter((member) =>
    `${member.user.displayName} ${member.user.email}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  )
  return (
    <Panel title="Project assignments">
      <p className="subtle">
        Members see assigned projects only. Grant review and export separately.
      </p>
      <ErrorNotice error={command.error} />
      <label className="field">
        <span>Search teammates</span>
        <input
          aria-label="Search teammates to assign"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name or email"
        />
      </label>
      <QueryState query={members}>
        <QueryState query={assignments}>
          {visible?.map((m) => {
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
                    {
                      canReview: v.has('review'),
                      canExport: v.has('export'),
                    },
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
          {teammates?.length === 0 && (
            <p>
              No active teammates yet. Invite a teammate from Team, then assign
              access here after acceptance.
            </p>
          )}
          {!!teammates?.length && visible?.length === 0 && (
            <p>No active teammates match your search.</p>
          )}
        </QueryState>
      </QueryState>
    </Panel>
  )
}

import { useState } from 'react'
import { Check, CheckCircle2, Info, Save, Trash2, X } from 'lucide-react'

import { useAssignments } from '@/features/projects/api/assignmentsApi'
import { useTeam } from '@/features/workspace/api/teamApi'
import { ErrorNotice, QueryState } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'

export function AssignmentsPanel({
  root,
  search = '',
}: {
  root: string
  search?: string
}) {
  const { id } = useWorkspace()

  const members = useTeam(id)
  const assignments = useAssignments(root)
  const command = useCommand()

  const [message, setMessage] = useState('')
  const [showHelp, setShowHelp] = useState(false)

  const activeMembers = members.data?.data.filter(
    (member) => member.role === 'MEMBER' && member.state === 'ACTIVE',
  )

  const visibleMembers = activeMembers?.filter((member) =>
    `${member.user.displayName} ${member.user.email}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  )

  const pendingCount =
    members.data?.pendingInvites.filter((invite) => invite.state === 'PENDING')
      .length ?? 0

  return (
    <section
      aria-labelledby="team-access-heading"
      className="mt-5 border-t border-slate-100 pt-5"
    >
      {/* Save confirmation */}
      {message && (
        <div
          role="status"
          className="mb-5 flex items-center gap-2.5 rounded-lg border border-green-200 bg-green-50 px-3.5 py-3 text-sm font-medium text-green-800"
        >
          <CheckCircle2
            size={18}
            className="shrink-0 text-green-600"
            aria-hidden="true"
          />

          <span className="min-w-0 flex-1">{message}</span>

          <button
            type="button"
            onClick={() => setMessage('')}
            aria-label="Dismiss confirmation"
            className="!border-0 !bg-transparent !p-1 text-green-700 hover:text-green-900"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Heading */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3
            id="team-access-heading"
            className="!m-0 text-base font-semibold tracking-tight text-slate-900"
          >
            Team access
          </h3>

          <p className="!m-0 mt-1 text-xs text-slate-500">
            Members assigned to this project and their permissions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowHelp((shown) => !shown)}
          aria-expanded={showHelp}
          className="inline-flex !min-h-9 items-center gap-1.5 !rounded-lg !border !border-slate-200 !bg-slate-50 !px-3 !text-xs !font-medium !text-slate-600 hover:!bg-slate-100"
        >
          <Info size={15} aria-hidden="true" />
          About permissions
        </button>
      </div>

      {/* Permissions explanation */}
      {showHelp && (
        <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/50 px-3.5 py-3 text-xs leading-5 text-slate-600">
          <strong className="text-slate-800">Project assignment</strong> lets
          the teammate view this project.{' '}
          <strong className="text-slate-800">Review</strong> allows approval and
          change requests. <strong className="text-slate-800">Export</strong>{' '}
          allows exporting approved content.
        </div>
      )}

      <ErrorNotice error={command.error} />

      <QueryState query={members}>
        <QueryState query={assignments}>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[610px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                <tr className="border-b border-slate-200">
                  <th scope="col" className="px-4 py-3">
                    Team member
                  </th>

                  <th scope="col" className="w-24 px-3 py-3 text-center">
                    Review
                  </th>

                  <th scope="col" className="w-24 px-3 py-3 text-center">
                    Export
                  </th>

                  <th scope="col" className="w-52 px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {!activeMembers?.length ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-7 text-center text-sm text-slate-500"
                    >
                      {pendingCount > 0
                        ? `${pendingCount} invitation${
                            pendingCount === 1 ? ' is' : 's are'
                          } pending. The teammate must accept before you can assign a project.`
                        : 'No active teammates yet. Invite a member to get started.'}
                    </td>
                  </tr>
                ) : !visibleMembers?.length ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-7 text-center text-sm text-slate-500"
                    >
                      No teammates match your search.
                    </td>
                  </tr>
                ) : (
                  visibleMembers.map((member) => {
                    const assignment = assignments.data?.data.find(
                      (item) => item.memberId === member.id,
                    )

                    const initials = member.user.displayName
                      .trim()
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                      .toUpperCase()

                    return (
                      <tr
                        key={`${member.id}-${JSON.stringify(assignment)}`}
                        className="hover:bg-slate-50/60"
                      >
                        {/* Member information */}
                        <td className="px-4 py-3.5 align-middle">
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700"
                              aria-hidden="true"
                            >
                              {initials || 'M'}
                            </span>

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <strong className="font-semibold text-slate-900">
                                  {member.user.displayName}
                                </strong>

                                {assignment && (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                                    <Check size={12} aria-hidden="true" />
                                    Assigned
                                  </span>
                                )}
                              </div>

                              <p className="!m-0 mt-0.5 break-all text-xs text-slate-500">
                                {member.user.email}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Review permission */}
                        <td className="px-3 py-3.5 text-center align-middle">
                          <input
                            form={`assignment-${member.id}`}
                            aria-label={`Allow ${member.user.displayName} to review`}
                            name="review"
                            type="checkbox"
                            defaultChecked={assignment?.canReview ?? false}
                            className="!m-0 !h-[18px] !w-[18px] cursor-pointer accent-blue-600"
                          />
                        </td>

                        {/* Export permission */}
                        <td className="px-3 py-3.5 text-center align-middle">
                          <input
                            form={`assignment-${member.id}`}
                            aria-label={`Allow ${member.user.displayName} to export`}
                            name="export"
                            type="checkbox"
                            defaultChecked={assignment?.canExport ?? false}
                            className="!m-0 !h-[18px] !w-[18px] cursor-pointer accent-blue-600"
                          />
                        </td>

                        {/* Save and remove */}
                        <td className="px-4 py-3.5 text-right align-middle">
                          <form
                            id={`assignment-${member.id}`}
                            className="flex items-center justify-end gap-2"
                            onSubmit={async (event) => {
                              event.preventDefault()
                              setMessage('')

                              const values = new FormData(event.currentTarget)

                              const result = await command.run(
                                `${root}/assignments/${member.id}`,
                                {
                                  canReview: values.has('review'),
                                  canExport: values.has('export'),
                                },
                                'PUT',
                              )

                              if (result) {
                                setMessage(
                                  `${member.user.displayName}'s access saved.`,
                                )
                              }
                            }}
                          >
                            <button
                              type="submit"
                              disabled={command.pending}
                              className="inline-flex !min-h-9 items-center justify-center gap-1.5 !rounded-lg !border-0 !bg-blue-600 !px-3.5 !text-xs !font-semibold !text-white hover:!bg-blue-700 disabled:!opacity-50"
                            >
                              <Save size={14} aria-hidden="true" />

                              {assignment ? 'Save changes' : 'Assign'}
                            </button>

                            {assignment && (
                              <button
                                type="button"
                                disabled={command.pending}
                                onClick={async () => {
                                  setMessage('')

                                  const result = await command.run(
                                    `${root}/assignments/${member.id}`,
                                    undefined,
                                    'DELETE',
                                  )

                                  if (result) {
                                    setMessage(
                                      `${member.user.displayName}'s access removed.`,
                                    )
                                  }
                                }}
                                className="inline-flex !min-h-9 items-center gap-1 !border-0 !bg-transparent !px-1.5 !text-xs !font-medium !text-red-600 hover:!text-red-700 disabled:!opacity-50"
                              >
                                <Trash2 size={14} aria-hidden="true" />
                                Remove
                              </button>
                            )}
                          </form>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </QueryState>
      </QueryState>
    </section>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import {
  Check,
  Pencil,
  Search,
  UserPlus,
  UsersRound,
} from 'lucide-react'

import { useAssignments } from '@/features/projects/api/assignmentsApi'
import { useTeam } from '@/features/workspace/api/teamApi'
import type { Member } from '@/features/workspace/types/workspace.types'
import { ConfirmDialog, Notice } from '@/shared/components/Feedback'
import { Modal } from '@/shared/components/Modal'
import { ErrorNotice, QueryState } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import {
  Avatar,
  Button,
  CardBody,
  CardHeader,
  StatusBadge,
  initialsFrom,
} from '@/shared/components/AccessUI'

/**
 * Project-scoped assignments. Client invitations are handled by ContactsPanel.
 */
export function ProjectTeamAccess({ root }: { root: string }) {
  const { id, owner, base } = useWorkspace()
  const { hash } = useLocation()
  const container = useRef<HTMLElement>(null)

  const team = useTeam(id, owner)
  const assignments = useAssignments(root)
  const command = useCommand()

  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Member | null>(null)
  const [removing, setRemoving] = useState<Member | null>(null)
  const [canReview, setCanReview] = useState(false)
  const [canExport, setCanExport] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (hash !== '#team-access') return
    container.current?.scrollIntoView({ block: 'start' })
  }, [hash])

  const activeMembers = (team.data?.data ?? []).filter(
    (member) => member.role === 'MEMBER' && member.state === 'ACTIVE',
  )

  const filteredMembers = activeMembers.filter((member) =>
    `${member.user.displayName} ${member.user.email}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  )

  const assignedCount = assignments.data?.data.length ?? 0

  function assignedTo(memberId: string) {
    return assignments.data?.data.find(
      (assignment) => assignment.memberId === memberId,
    )
  }

  function openEditor(member: Member) {
    const assignment = assignedTo(member.id)
    setEditing(member)
    setCanReview(assignment?.canReview ?? false)
    setCanExport(assignment?.canExport ?? false)
    setMessage('')
    command.clear()
  }

  async function saveAccess() {
    if (!editing) return
    const result = await command.run(
      `${root}/assignments/${editing.id}`,
      { canReview, canExport },
      'PUT',
    )
    if (!result) return
    setMessage(`${editing.user.displayName}'s project access was saved.`)
    setEditing(null)
  }

  async function removeAccess() {
    if (!removing) return
    const result = await command.run(
      `${root}/assignments/${removing.id}`,
      undefined,
      'DELETE',
    )
    if (!result) return
    setMessage(`${removing.user.displayName}'s project access was removed.`)
    setRemoving(null)
  }

  if (!owner) return null

  return (
    <section
      id="team-access"
      ref={container}
      aria-label="Team access"
      className="au-card project-team-card scroll-mt-28"
    >
      <CardHeader
        icon={UsersRound}
        title="Team access"
        subtitle="Assign workspace members to review or export content."
        action={
          <StatusBadge>
            {assignments.data ? `${assignedCount} assigned` : 'Loading'}
          </StatusBadge>
        }
      />
      <CardBody id="project-team-access-content">
        {activeMembers.length > 0 && (
          <div className="au-search">
            <Search size={16} aria-hidden="true" />
            <input
              aria-label="Search team members"
              type="search"
              placeholder="Search team members..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="au-input"
            />
          </div>

        )}
          {message && <Notice>{message}</Notice>}
          <ErrorNotice error={command.error} />

          <QueryState query={team}>
            <QueryState query={assignments}>
              {activeMembers.length === 0 ? (
                <div className="project-team-empty">
                  <div className="project-team-empty-title">
                    <UsersRound size={22} aria-hidden="true" />
                    <strong>No active team members</strong>
                  </div>
                  <p>
                    Invite a member to your workspace before assigning project
                    access.
                  </p>
                  <Link className="au-btn au-btn--secondary" to={base + '/team'}>
                    Go to Team
                  </Link>
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="au-box">No team members match your search.</div>
              ) : (
                <ul className="au-list">
                  {filteredMembers.map((member) => {
                    const assignment = assignedTo(member.id)

                    return (
                      <li key={member.id} className="au-row">
                        <Avatar
                          initials={initialsFrom(member.user.displayName)}
                          label={member.user.displayName}
                        />

                        <div className="au-row-main">
                          <div className="au-row-title">
                            <span className="au-row-name">
                              {member.user.displayName}
                            </span>

                            <StatusBadge
                              tone={assignment ? 'success' : 'neutral'}
                            >
                              {assignment ? 'Assigned' : 'Not assigned'}
                            </StatusBadge>
                          </div>

                          <p className="au-row-sub">
                            <span className="au-truncate">
                              {member.user.email}
                            </span>
                          </p>

                          {assignment && (
                            <div className="au-row-meta">
                              <span className="au-meta-item">
                                Review {assignment.canReview ? 'on' : 'off'}
                              </span>

                              <span className="au-meta-item">
                                Export {assignment.canExport ? 'on' : 'off'}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="au-row-actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={assignment ? Pencil : UserPlus}
                            onClick={() => openEditor(member)}
                          >
                            {assignment ? 'Edit' : 'Assign'}
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </QueryState>
          </QueryState>
      </CardBody>

      {editing && (
        <Modal
          title={
            assignedTo(editing.id)
              ? 'Edit project access'
              : 'Assign project access'
          }
          onClose={() => setEditing(null)}
          pending={command.pending}
        >
          <form
            className="au-form"
            onSubmit={(event) => {
              event.preventDefault()
              void saveAccess()
            }}
          >
            <div className="au-person-head">
              <Avatar
                initials={initialsFrom(editing.user.displayName)}
                label={editing.user.displayName}
              />

              <div className="au-person-head-titles">
                <strong>{editing.user.displayName}</strong>
                <span className="au-truncate">{editing.user.email}</span>
              </div>
            </div>

            <p className="au-help">
              Assigning a member lets them access this project. Review and
              export are optional permissions that you can set independently.
            </p>

            <label className="au-check">
              <input
                type="checkbox"
                checked={canReview}
                onChange={(event) => setCanReview(event.target.checked)}
              />

              <span>
                <span className="au-check-title">Review submitted content</span>

                <span className="au-check-desc">
                  Approve submitted content and request changes.
                </span>
              </span>
            </label>

            <label className="au-check">
              <input
                type="checkbox"
                checked={canExport}
                onChange={(event) => setCanExport(event.target.checked)}
              />

              <span>
                <span className="au-check-title">Export approved content</span>

                <span className="au-check-desc">
                  Download approved content from this project.
                </span>
              </span>
            </label>

            <ErrorNotice error={command.error} />

            <div className="au-actions au-actions--between au-actions--divided">
              {assignedTo(editing.id) ? (
                <Button
                  variant="danger-ghost"
                  onClick={() => {
                    setRemoving(editing)
                    setEditing(null)
                  }}
                >
                  Remove project access
                </Button>
              ) : (
                <span />
              )}

              <div className="au-actions-group">
                <Button variant="secondary" onClick={() => setEditing(null)}>
                  Cancel
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  icon={Check}
                  disabled={command.pending}
                >
                  Save access
                </Button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        open={!!removing}
        title="Remove project access?"
        description={
          <p>
            {removing?.user.displayName} will lose access to this project.
            Previous contributions remain in project history.
          </p>
        }
        confirmLabel="Remove access"
        pending={command.pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => void removeAccess()}
      />
    </section>
  )
}

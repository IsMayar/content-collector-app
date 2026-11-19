import { useState } from 'react'
import { Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ShieldCheck, Users } from 'lucide-react'

import './TeamPage.css'
import type {
  InviteSummary,
  Member,
} from '@/features/workspace/types/workspace.types'
import { useTeam, useTeamEntitlements } from '@/features/workspace/api/teamApi'
import { teamInvitationSchema } from '@/features/workspace/schemas/teamSchema'
import { ConfirmDialog, Notice } from '@/shared/components/Feedback'
import { Modal } from '@/shared/components/Modal'
import {
  Empty,
  ErrorNotice,
  Field,
  Heading,
  QueryState,
} from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import { z } from 'zod'

export function TeamPage() {
  const { id, owner } = useWorkspace()
  const team = useTeam(id, owner)
  const workspace = useTeamEntitlements(id, owner)
  const command = useCommand()
  const form = useForm<
    z.input<typeof teamInvitationSchema>,
    unknown,
    z.output<typeof teamInvitationSchema>
  >({
    resolver: zodResolver(teamInvitationSchema),
    defaultValues: { email: '' },
  })
  const [inviteOpen, setInviteOpen] = useState(false)
  const [remove, setRemove] = useState<Member | InviteSummary | null>(null)
  const [message, setMessage] = useState('')
  const [demoUrl, setDemoUrl] = useState('')
  const [invitationKey, setInvitationKey] = useState(() => crypto.randomUUID())

  // Display only actionable invitations. Consumed/revoked/expired records
  // are not members and must not appear as pending invitations.
  const pending = (team.data?.pendingInvites ?? []).filter(
    (invitation) =>
      invitation.state === 'PENDING' &&
      Date.parse(invitation.expiresAt) > Date.now(),
  )
  const members = team.data?.data ?? []
  const activeMemberCount = members.filter(
    (member) => member.state === 'ACTIVE',
  ).length
  const seatsUsed = activeMemberCount + pending.length
  const seatLimit = workspace.data?.entitlements.seats
  const atCapacity = seatLimit !== undefined && seatsUsed >= seatLimit

  if (!owner) {
    return (
      <Empty
        title="Owner access required"
        description="Workspace membership is managed by your owner."
      />
    )
  }

  return (
    <div className="team-page">
      <Heading
        title="Team"
        description="Manage workspace members and invitations. Assign project permissions from each project's Access tab."
      >
        <div className="seat-meter">
          <Users size={22} aria-hidden="true" />
          <div>
            <strong>
              {seatsUsed} of {seatLimit ?? '—'}
            </strong>{' '}
            seats used
            <progress
              aria-label="Workspace seats"
              value={seatsUsed}
              max={seatLimit || 1}
            />
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={command.pending || atCapacity}
            onClick={() => setInviteOpen(true)}
          >
            Invite member ＋
          </button>
        </div>
      </Heading>

      {atCapacity && (
        <p className="!m-0 text-sm text-slate-600">
          All workspace seats are reserved or occupied. Remove a pending
          invitation or deactivate a member to free a seat.
        </p>
      )}

      <QueryState query={team}>
        <section
          aria-label="Team members and pending invitations"
          className="min-w-0"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="!m-0 !text-base !font-semibold text-[#0A1A2F]">
              Members
            </h2>
            <span className="text-xs text-slate-500">
              {activeMemberCount} active · {pending.length} pending
            </span>
          </div>
          <div className="reference-table-wrap overflow-x-auto">
            <table className="reference-table team-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td data-label="Name">
                      <div className="person-cell">
                        <span className="person-avatar" aria-hidden="true">
                          {member.user.displayName
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((part) => part[0])
                            .join('')
                            .toUpperCase()}
                        </span>
                        <strong>{member.user.displayName}</strong>
                      </div>
                    </td>
                    <td data-label="Email">{member.user.email}</td>
                    <td data-label="Role">
                      {member.role === 'OWNER' ? 'Owner' : 'Member'}
                    </td>
                    <td data-label="Status">
                      <span
                        className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${
                          member.state === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {member.state === 'ACTIVE' ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td data-label="Actions">
                      {member.role === 'OWNER' ? (
                        <span className="text-xs text-slate-500">
                          Workspace owner
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={
                            member.state === 'ACTIVE'
                              ? 'danger-link !text-xs'
                              : 'secondary-button !text-xs'
                          }
                          disabled={
                            command.pending ||
                            (member.state !== 'ACTIVE' && atCapacity)
                          }
                          onClick={async () => {
                            if (member.state === 'ACTIVE') {
                              setRemove(member)
                            } else if (
                              await command.run(
                                `workspaces/${id}/members/${member.id}`,
                                { state: 'ACTIVE' },
                                'PATCH',
                              )
                            ) {
                              setMessage('Membership restored.')
                            }
                          }}
                        >
                          {member.state === 'ACTIVE'
                            ? 'Remove access'
                            : 'Restore'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}

                {pending.map((invitation) => (
                  <tr key={`invite-${invitation.id}`}>
                    <td data-label="Name">
                      <strong className="text-sm text-slate-700">
                        Invited teammate
                      </strong>
                    </td>
                    <td data-label="Email">{invitation.email}</td>
                    <td data-label="Role">Member</td>
                    <td data-label="Status">
                      <span className="inline-flex rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        Pending
                      </span>
                      <span className="mt-1 block text-[11px] text-slate-500">
                        Expires{' '}
                        {new Date(invitation.expiresAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td data-label="Actions">
                      <button
                        type="button"
                        className="danger-link !text-xs"
                        disabled={command.pending}
                        onClick={() => setRemove(invitation)}
                      >
                        Revoke invitation
                      </button>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && pending.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-5 text-sm text-slate-500"
                    >
                      No team members or pending invitations.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Pending invitations reserve seats until accepted, revoked or
            expired. Client contacts do not occupy team seats.
          </p>
        </section>
      </QueryState>

      <ErrorNotice error={command.error} />
      {message && <Notice>{message}</Notice>}
      {demoUrl && (
        <Notice>
          <Link to={demoUrl}>Open synthetic team invitation</Link>
        </Notice>
      )}

      {inviteOpen && (
        <Modal
          title="Invite team member"
          drawer
          pending={command.pending}
          onClose={() => setInviteOpen(false)}
        >
          <p className="text-sm text-slate-600">
            Invitation recipients join this workspace as members. They won't see
            projects until you grant access in the project's Access tab.
          </p>
          <form
            className="stack-form team-invitation-form"
            onSubmit={form.handleSubmit(async (values) => {
              const result = await command.run<{ demoUrl?: string }>(
                `workspaces/${id}/members`,
                values,
                'POST',
                { 'Idempotency-Key': invitationKey },
              )
              if (result) {
                setDemoUrl(result.demoUrl || '')
                setInviteOpen(false)
                form.reset()
                setInvitationKey(crypto.randomUUID())
                setMessage(
                  'Invitation sent. The member must accept before receiving project access.',
                )
              }
            })}
          >
            <Field label="Teammate email">
              <input
                {...form.register('email', {
                  onChange: () => setInvitationKey(crypto.randomUUID()),
                })}
                type="email"
                required
                placeholder="teammate@example.com"
              />
            </Field>
            <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <ShieldCheck size={17} className="shrink-0 text-blue-600" />
              Team invitations reserve one seat and expire after seven days.
              Permissions are granted after acceptance.
            </div>
            <ErrorNotice error={form.formState.errors.email?.message} />
            <ErrorNotice error={command.error} />
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setInviteOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={command.pending}
              >
                Send invitation
              </button>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        open={!!remove}
        title={
          remove && 'user' in remove
            ? 'Remove team member?'
            : 'Revoke invitation?'
        }
        description={
          <>
            <p>
              {remove && 'user' in remove
                ? 'This member will lose access to the workspace and its projects. Their previous contributions remain in history.'
                : 'This invitation will be revoked and its reserved seat released.'}
            </p>
            <ErrorNotice error={command.error} />
          </>
        }
        confirmLabel={
          remove && 'user' in remove ? 'Remove access' : 'Revoke invitation'
        }
        pending={command.pending}
        onCancel={() => setRemove(null)}
        onConfirm={() =>
          void (async () => {
            if (
              remove &&
              (await command.run(
                `workspaces/${id}/${'user' in remove ? 'members' : 'member-invitations'}/${remove.id}`,
                undefined,
                'DELETE',
              ))
            ) {
              setMessage('Access updated.')
              setRemove(null)
            }
          })()
        }
      />
    </div>
  )
}

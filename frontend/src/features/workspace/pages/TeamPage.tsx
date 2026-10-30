import type {
  InviteSummary,
  Member,
} from '@/features/workspace/types/workspace.types'
import { useTeam, useTeamEntitlements } from '@/features/workspace/api/teamApi'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ConfirmDialog, Notice } from '@/shared/components/Feedback'
import { Modal } from '@/shared/components/Modal'
import {
  Badge,
  Empty,
  ErrorNotice,
  Field,
  Heading,
  Panel,
  QueryState,
} from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import { ShieldCheck, Users } from 'lucide-react'
import { useState } from 'react'
import { teamInvitationSchema } from '@/features/workspace/schemas/teamSchema'
import { Link } from 'react-router'

export function TeamPage() {
  const { id, owner } = useWorkspace()
  const q = useTeam(id, owner)
  const workspace = useTeamEntitlements(id, owner)
  const form = useForm<
    z.input<typeof teamInvitationSchema>,
    unknown,
    z.output<typeof teamInvitationSchema>
  >({
    resolver: zodResolver(teamInvitationSchema),
    defaultValues: { email: '' },
  })
  const command = useCommand()
  const [demo, setDemo] = useState('')
  const [invite, setInvite] = useState(false),
    [tab, setTab] = useState('members'),
    [message, setMessage] = useState('')
  const [remove, setRemove] = useState<Member | InviteSummary | null>(null)
  const [invitationKey, setInvitationKey] = useState(() => crypto.randomUUID())
  const pending =
    q.data?.pendingInvites.filter((i) => i.state === 'PENDING') || []
  const seatsUsed =
    (q.data?.data.filter((m) => m.state === 'ACTIVE').length || 0) +
    pending.length
  if (!owner)
    return (
      <Empty
        title="Owner access required"
        description="Workspace membership is managed by your owner."
      />
    )
  return (
    <div className="team-page">
      <Heading
        title="Team"
        description="Manage team members, roles and project access for your agency."
      >
        <div className="seat-meter">
          <Users size={25} />
          <div>
            <strong>
              {seatsUsed} of {workspace.data?.entitlements.seats || 0}
            </strong>{' '}
            seats used
            <progress
              aria-label="Workspace seats"
              value={seatsUsed}
              max={workspace.data?.entitlements.seats || 1}
            />
          </div>
          <button className="primary-button" onClick={() => setInvite(true)}>
            Invite member ＋
          </button>
        </div>
      </Heading>
      <nav className="reference-tabs" aria-label="Team views">
        <button
          className={tab === 'members' ? 'active' : ''}
          aria-pressed={tab === 'members'}
          onClick={() => setTab('members')}
        >
          Team members
        </button>
        <button
          className={tab === 'invitations' ? 'active' : ''}
          aria-pressed={tab === 'invitations'}
          onClick={() => setTab('invitations')}
        >
          Pending invitations{' '}
          <span className="count-pill">{pending.length}</span>
        </button>
      </nav>
      <QueryState query={q}>
        {tab === 'members' && (
          <div className="reference-table-wrap">
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
                {q.data?.data.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="person-cell">
                        <span className="person-avatar">
                          {m.user.displayName
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')}
                        </span>
                        <strong>{m.user.displayName}</strong>
                      </div>
                    </td>
                    <td>{m.user.email}</td>
                    <td>{m.role === 'OWNER' ? 'Owner' : 'Member'}</td>
                    <td>
                      <Badge>{m.state}</Badge>
                    </td>
                    <td>
                      {m.role !== 'OWNER' ? (
                        <button
                          className="danger-link"
                          disabled={command.pending}
                          onClick={() =>
                            m.state === 'ACTIVE'
                              ? setRemove(m)
                              : void command.run(
                                  `workspaces/${id}/members/${m.id}`,
                                  { state: 'ACTIVE' },
                                  'PATCH',
                                )
                          }
                        >
                          {m.state === 'ACTIVE'
                            ? 'Remove access'
                            : 'Restore membership'}
                        </button>
                      ) : (
                        <span className="subtle">Workspace owner</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Panel title="Pending invitations">
          {(
            tab === 'invitations'
              ? q.data?.pendingInvites.length
              : pending.length
          ) ? (
            <div className="reference-table-wrap">
              <table className="reference-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Expires</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(tab === 'invitations'
                    ? q.data?.pendingInvites || []
                    : pending
                  ).map((i) => (
                    <tr key={i.id}>
                      <td>{i.email}</td>
                      <td>Member</td>
                      <td>{new Date(i.expiresAt).toLocaleDateString()}</td>
                      <td>
                        <Badge>{i.state}</Badge>
                      </td>
                      <td>
                        <button
                          className="danger-link"
                          disabled={i.state !== 'PENDING' || command.pending}
                          onClick={() => setRemove(i)}
                        >
                          Revoke invitation
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="subtle">No pending invitations.</p>
          )}
        </Panel>
      </QueryState>
      <ErrorNotice error={command.error} />
      {message && <Notice>{message}</Notice>}
      {demo && (
        <Notice>
          <Link to={demo}>Open synthetic team invitation</Link>
        </Notice>
      )}
      {invite && (
        <Modal
          title="Invite a team member"
          drawer
          pending={command.pending}
          onClose={() => setInvite(false)}
        >
          <p className="subtle">
            Invite a verified teammate to your workspace. A seat is reserved
            until the invitation expires or is revoked.
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
                setDemo(result.demoUrl || '')
                setInvite(false)
                form.reset()
                setInvitationKey(crypto.randomUUID())
                setMessage(
                  'Invitation sent. Assign project access after your teammate accepts.',
                )
              }
            })}
          >
            <div className="form-grid">
              <Field label="Teammate email">
                <input
                  {...form.register('email', {
                    onChange: () => setInvitationKey(crypto.randomUUID()),
                  })}
                  required
                  type="email"
                  placeholder="taylor@youragency.com"
                />
              </Field>
              <Field label="Role">
                <select disabled>
                  <option>Member</option>
                </select>
              </Field>
            </div>
            <div className="reference-info">
              <ShieldCheck size={20} />
              <strong>Private project access</strong>
              <p>
                After acceptance, open a project’s Team tab to assign this
                teammate. Review and export permissions are granted separately.
                Invitations do not grant project access automatically.
              </p>
              <p>
                Invitations expire after seven days. Revoke an existing
                invitation before sending a replacement.
              </p>
            </div>
            <ErrorNotice error={form.formState.errors.email?.message} />
            <ErrorNotice error={command.error} />
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setInvite(false)}
              >
                Cancel
              </button>
              <button className="primary-button" disabled={command.pending}>
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
              Access will be removed from this workspace and its projects.
              Existing contributions remain in project history.
            </p>
            <ErrorNotice error={command.error} />
          </>
        }
        confirmLabel="Remove access"
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
            )
              setRemove(null)
          })()
        }
      />
    </div>
  )
}

import { useState } from 'react'
import { Link } from 'react-router'
import { Users, Search, ShieldCheck } from 'lucide-react'
import { useData } from '@/api/productApi'
import type {
  InviteSummary,
  Member,
  UsageSummary,
  Paged,
  Project,
} from '@/api/productTypes'
import {
  Badge,
  Empty,
  ErrorNotice,
  Field,
  Heading,
  Panel,
  QueryState,
  useCommand,
  useWorkspace,
} from '@/components/ProductUI'
import { ConfirmDialog, Notice } from '@/components/Feedback'
import { Modal } from '@/components/Modal'

export function TeamPage() {
  const { id, owner } = useWorkspace()
  const q = useData<{ data: Member[]; invitations: InviteSummary[] }>(
    `workspaces/${id}/members`,
    { skip: !owner },
  )
  const usage = useData<UsageSummary>(`workspaces/${id}/usage`, {
    skip: !owner,
  })
  const projects = useData<Paged<Project>>(
    `workspaces/${id}/projects?size=100`,
    { skip: !owner },
  )
  const command = useCommand()
  const [demo, setDemo] = useState('')
  const [invite, setInvite] = useState(false),
    [tab, setTab] = useState('members'),
    [message, setMessage] = useState(''),
    [search, setSearch] = useState('')
  const [remove, setRemove] = useState<Member | InviteSummary | null>(null)
  const [assigned, setAssigned] = useState<string[]>([])
  const pending = q.data?.invitations.filter((i) => i.state === 'PENDING') || []
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
              {(usage.data?.seatsUsed || 0) + (usage.data?.seatsReserved || 0)}{' '}
              of {usage.data?.seatsLimit || 0}
            </strong>{' '}
            seats used
            <progress
              aria-label="Workspace seats"
              value={
                (usage.data?.seatsUsed || 0) + (usage.data?.seatsReserved || 0)
              }
              max={usage.data?.seatsLimit || 1}
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
                          disabled={m.state !== 'ACTIVE' || command.pending}
                          onClick={() => setRemove(m)}
                        >
                          Remove access
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
          {pending.length ? (
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
                  {pending.map((i) => (
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
            Send an invitation and assign project access. A seat will be
            reserved once the invitation is sent.
          </p>
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              const result = await command.run<{ demoUrl?: string }>(
                `workspaces/${id}/members/invite`,
                {
                  email: f.get('email'),
                  assignments: assigned.map((projectId) => ({
                    projectId,
                    canReview: f.has('review'),
                    canExport: f.has('export'),
                  })),
                },
              )
              if (result) {
                setDemo(result.demoUrl || '')
                setInvite(false)
                setAssigned([])
                setMessage(
                  'Team invitation created. Project access activates after acceptance.',
                )
              }
            }}
          >
            <div className="form-grid">
              <Field label="Teammate email">
                <input
                  name="email"
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
            <div className="invite-assignment-grid">
              <section>
                <h3>Assign to projects</h3>
                <label className="board-search">
                  <Search size={16} />
                  <input
                    aria-label="Search projects to assign"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search projects…"
                  />
                </label>
                {projects.data?.data
                  .filter((p) =>
                    p.title.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((p) => (
                    <label className="assignment-choice" key={p.id}>
                      <input
                        type="checkbox"
                        checked={assigned.includes(p.id)}
                        onChange={(e) =>
                          setAssigned(
                            e.target.checked
                              ? [...assigned, p.id]
                              : assigned.filter((id) => id !== p.id),
                          )
                        }
                      />
                      <span>
                        <strong>{p.title}</strong>
                        <small>Client: {p.clientBusinessName}</small>
                      </span>
                      <Badge>{p.projectType}</Badge>
                    </label>
                  ))}
              </section>
              <section>
                <h3>Permissions for selected projects</h3>
                <label className="permission-choice">
                  <input name="review" type="checkbox" role="switch" />
                  <span>
                    <strong>Can review content</strong>
                    <small>Review submissions and request changes.</small>
                  </span>
                </label>
                <label className="permission-choice">
                  <input name="export" type="checkbox" role="switch" />
                  <span>
                    <strong>Can export content</strong>
                    <small>
                      Export approved content from assigned projects.
                    </small>
                  </span>
                </label>
                <div className="reference-info">
                  <ShieldCheck size={20} />
                  <strong>Seat reservation</strong>
                  <p>
                    The invitation reserves one seat. The member must accept to
                    activate access.
                  </p>
                </div>
              </section>
            </div>
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
                Send invitation →
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
                `workspaces/${id}/members/${remove.id}`,
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

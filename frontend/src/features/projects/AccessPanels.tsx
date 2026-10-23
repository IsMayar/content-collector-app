import { useState } from 'react'
import { Link } from 'react-router'
import { useData } from '@/api/productApi'
import type { ProjectContact } from '@/api/contracts'
import {
  Badge,
  ErrorNotice,
  Field,
  Panel,
  QueryState,
  useCommand,
} from '@/components/ProductUI'
import { Modal } from '@/components/Modal'
import { ConfirmDialog, Notice } from '@/components/Feedback'
export function ContactsPanel({ root }: { root: string }) {
  const q = useData<{ data: ProjectContact[] }>(`${root}/contacts`),
    command = useCommand()
  const [open, setOpen] = useState(false),
    [link, setLink] = useState(''),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [created, setCreated] = useState(''),
    [revoke, setRevoke] = useState<ProjectContact | null>(null),
    [message, setMessage] = useState('')
  async function invite(id: string) {
    const result = await command.run<{ demoUrl?: string }>(
      `${root}/contacts/${id}/invite`,
      {},
    )
    if (result) {
      setLink(result.demoUrl || '')
      setMessage('Invitation sent.')
      return true
    }
    return false
  }
  return (
    <Panel title="Client access">
      <div className="board-toolbar">
        <p>
          Manage who can access this project. All listed contacts belong to the
          client’s organisation.
        </p>
        <button className="primary-button" onClick={() => setOpen(true)}>
          Invite client ＋
        </button>
      </div>
      <QueryState query={q}>
        <div className="reference-table-wrap">
          <table className="reference-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Access expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.data.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="person-cell">
                      <span className="person-avatar">
                        {c.name.slice(0, 2).toUpperCase()}
                      </span>
                      <strong>{c.name}</strong>
                    </div>
                  </td>
                  <td>{c.email}</td>
                  <td>Client contact</td>
                  <td>
                    <Badge>{c.state}</Badge>
                  </td>
                  <td>{new Date(c.accessExpiresAt).toLocaleDateString()}</td>
                  <td>
                    <div className="actions">
                      <button
                        className="text-link"
                        disabled={command.pending || c.state !== 'ACTIVE'}
                        onClick={() => void invite(c.id)}
                      >
                        Send / resend invite
                      </button>
                      <button
                        className="danger-link"
                        disabled={command.pending || c.state !== 'ACTIVE'}
                        onClick={() => setRevoke(c)}
                      >
                        Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryState>
      <ErrorNotice error={command.error} />
      {message && <Notice>{message}</Notice>}
      {link && (
        <Notice>
          Development invitation: <Link to={link}>Open client access</Link>.
          Keep this tab open to retain in-memory demo state.
        </Notice>
      )}
      {open && (
        <Modal
          title="Invite client to this project"
          drawer
          pending={command.pending}
          onClose={() => setOpen(false)}
        >
          <div className="invite-assignment-grid">
            <form
              className="stack-form"
              id="client-invite-form"
              onSubmit={async (e) => {
                e.preventDefault()
                const f = new FormData(e.currentTarget)
                let id = created
                if (!id) {
                  const result = await command.run<{ contact: ProjectContact }>(
                    `${root}/contacts`,
                    {
                      name,
                      email,
                      accessExpiresAt: new Date(
                        String(f.get('expiry')),
                      ).toISOString(),
                    },
                  )
                  if (!result) return
                  id = result.contact.id
                  setCreated(id)
                }
                if (await invite(id)) {
                  setOpen(false)
                  setCreated('')
                  setName('')
                  setEmail('')
                }
              }}
            >
              <h3>Contact details</h3>
              <Field label="Contact name">
                <input
                  required
                  value={name}
                  disabled={!!created}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Contact email">
                <input
                  required
                  type="email"
                  value={email}
                  disabled={!!created}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Role">
                <select disabled>
                  <option>Client contact</option>
                </select>
              </Field>
              <Field label="Access expiry">
                <input
                  name="expiry"
                  required
                  type="date"
                  disabled={!!created}
                  defaultValue={new Date(Date.now() + 90 * 864e5)
                    .toISOString()
                    .slice(0, 10)}
                />
              </Field>
              <p className="subtle">
                Client contacts can provide content and collaborate on this
                project only.
              </p>
              {created && (
                <Notice>
                  Contact created. Retry sending the invitation below.
                </Notice>
              )}
              <ErrorNotice error={command.error} />
            </form>
            <section className="email-preview">
              <h3>Email invitation preview</h3>
              <div className="email-preview-card">
                <strong className="email-brand">▣ Content Collector</strong>
                <h4>Hi {name || 'there'},</h4>
                <p>You’re invited to share content for your project.</p>
                <div className="reference-info">
                  <strong>You’ll be able to:</strong>
                  <p>✓ Provide answers and files</p>
                  <p>✓ Submit for agency review</p>
                  <p>✓ Read feedback and revise</p>
                </div>
                <p>
                  You’ll only see this project and its related content. You
                  won’t have access to other projects or agency data.
                </p>
                <small>
                  Invitation recipient: {email || 'Your client’s email'}
                </small>
              </div>
            </section>
          </div>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              className="primary-button"
              form="client-invite-form"
              disabled={command.pending}
            >
              Send invitation →
            </button>
          </div>
        </Modal>
      )}
      <ConfirmDialog
        open={!!revoke}
        title="Revoke client access"
        description={
          <>
            <p>
              Remove project access for <strong>{revoke?.name}</strong>?
            </p>
            <Notice error>
              This client will no longer be able to sign in or view this
              project. Their content and comments remain in project history.
            </Notice>
            <ErrorNotice error={command.error} />
          </>
        }
        confirmLabel="Revoke access"
        pending={command.pending}
        onCancel={() => setRevoke(null)}
        onConfirm={() =>
          void (async () => {
            if (
              revoke &&
              (await command.run(
                `${root}/contacts/${revoke.id}/access`,
                undefined,
                'DELETE',
              ))
            )
              setRevoke(null)
          })()
        }
      />
    </Panel>
  )
}

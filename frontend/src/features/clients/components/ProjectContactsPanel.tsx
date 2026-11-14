import {
  CalendarDays,
  Mail,
  MoreHorizontal,
  Send,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { env } from '@/config/env'
import {
  useProjectContacts,
  useClientCommands,
} from '@/features/clients/api/clientsApi'
import { contactCreateSchema } from '@/features/clients/schemas/clientSchema'
import type { ProjectContact } from '@/features/projects/types/project.types'
import { ConfirmDialog, Notice } from '@/shared/components/Feedback'
import { Badge, ErrorNotice, QueryState } from '@/shared/components/ProductUI'
import { useState } from 'react'
import { Link } from 'react-router'
import './ClientAccess.css'

export function ContactsPanel({
  root,
  clientId,
  canInvite = true,
  canManage = true,
  unpublished = false,
  publicationMissing = [],
}: {
  root: string
  clientId: string
  canInvite?: boolean
  canManage?: boolean
  unpublished?: boolean
  publicationMissing?: (string | false)[]
}) {
  const q = useProjectContacts(root),
    command = useClientCommands()
  const [link, setLink] = useState(''),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [created, setCreated] = useState(''),
    [revoke, setRevoke] = useState<ProjectContact | null>(null),
    [message, setMessage] = useState('')
  const [inviteContact, setInviteContact] = useState<ProjectContact | null>(
    null,
  )
  const [inviteKeys, setInviteKeys] = useState<Record<string, string>>({})
  async function invite(id: string) {
    if (!canManage || !canInvite || unpublished) return false
    const key = inviteKeys[id] || crypto.randomUUID()
    setInviteKeys((keys) => ({ ...keys, [id]: key }))
    const result = await command.run<{ demoUrl?: string }>(
      root + '/contacts/' + id + '/invite',
      {},
      'POST',
      { 'Idempotency-Key': key },
    )
    if (result) {
      setLink(result.demoUrl || '')
      setMessage(
        env.mocksEnabled
          ? 'Invitation created.'
          : 'Invitation queued for delivery.',
      )
      setInviteKeys((keys) => ({ ...keys, [id]: crypto.randomUUID() }))
      return true
    }
    return false
  }
  return (
    <>
      <section className="product-panel client-access-contacts">
        <header className="client-access-card-heading">
          <UsersRound size={32} aria-hidden="true" />
          <div>
            <h2>Project contacts</h2>
            <p>
              People from this customer who can access and submit content for
              this project.
            </p>
          </div>
        </header>
        <QueryState query={q}>
          {q.data?.data.length === 0 ? (
            <p className="subtle">No project contacts yet.</p>
          ) : (
            <div className="client-access-table-wrap">
              <table className="client-access-table">
                <thead>
                  <tr>
                    <th>Contact</th>
                    <th>Email</th>
                    <th>Access status</th>
                    <th>Invitation</th>
                    <th>Access expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data?.data.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="client-access-person">
                          <span
                            className="client-access-avatar"
                            aria-hidden="true"
                          >
                            {c.name
                              .trim()
                              .split(/\s+/)
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')
                              .toUpperCase()}
                          </span>
                          <strong>{c.name}</strong>
                        </div>
                      </td>
                      <td>
                        <span className="client-access-inline">
                          <Mail size={17} aria-hidden="true" />
                          {c.email}
                        </span>
                      </td>
                      <td>
                        <Badge>
                          {c.state !== 'ACTIVE'
                            ? c.state
                            : Date.parse(c.accessExpiresAt) <= Date.now()
                              ? 'EXPIRED'
                              : !c.accessInitializedAt
                                ? 'NOT_INVITED'
                                : 'ACTIVE'}
                        </Badge>
                      </td>
                      <td>
                        <span
                          className="client-access-inline"
                          title={
                            c.accessInitializedAt
                              ? 'An invitation was issued. Delivery is not confirmed by the contact record.'
                              : undefined
                          }
                        >
                          {c.accessInitializedAt && (
                            <Send size={17} aria-hidden="true" />
                          )}
                          {c.accessInitializedAt ? 'Issued' : 'Not issued'}
                        </span>
                      </td>
                      <td>
                        <span className="client-access-inline">
                          <CalendarDays size={17} aria-hidden="true" />
                          <time dateTime={c.accessExpiresAt}>
                            {new Date(c.accessExpiresAt).toLocaleDateString(
                              undefined,
                              {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              },
                            )}
                          </time>
                        </span>
                      </td>
                      <td>
                        <details
                          className="client-contact-actions"
                          onBlur={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget))
                              e.currentTarget.open = false
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              e.currentTarget.open = false
                              e.currentTarget.querySelector('summary')?.focus()
                            }
                          }}
                        >
                          <summary aria-label={'Actions for ' + c.name}>
                            <MoreHorizontal size={20} aria-hidden="true" />
                          </summary>
                          <div>
                            <button
                              type="button"
                              disabled={
                                !canManage ||
                                !canInvite ||
                                unpublished ||
                                command.pending ||
                                c.state !== 'ACTIVE' ||
                                Date.parse(c.accessExpiresAt) <= Date.now()
                              }
                              onClick={(e) => {
                                e.currentTarget.closest('details')!.open = false
                                setInviteContact(c)
                              }}
                            >
                              <Send size={16} aria-hidden="true" />
                              {c.accessInitializedAt
                                ? 'Resend invite'
                                : 'Send invite'}
                            </button>
                            <button
                              type="button"
                              className="danger-link"
                              disabled={
                                !canManage ||
                                command.pending ||
                                c.state !== 'ACTIVE'
                              }
                              onClick={(e) => {
                                e.currentTarget.closest('details')!.open = false
                                setRevoke(c)
                              }}
                            >
                              <Trash2 size={16} aria-hidden="true" />
                              Revoke
                            </button>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
        {canManage && (
          <div className="client-access-invitation">
            {unpublished && (
              <div className="client-access-publish-notice" role="status">
                <strong>Publish this project before inviting clients.</strong>
                {publicationMissing.length > 0 && (
                  <span>
                    Still needed: {publicationMissing.join(', ')}. Save a
                    contact below if needed; no invitation will be sent.
                  </span>
                )}
              </div>
            )}
            <form
              className="client-access-invite-form"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!canManage || command.pending) return
                const saveOnly =
                  (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                    'value',
                  ) === 'save'
                if (saveOnly ? !unpublished : !canInvite || unpublished) return
                const f = new FormData(e.currentTarget)
                const expiry = String(
                  f.get('expiry') ||
                    new Date(Date.now() + 90 * 864e5)
                      .toISOString()
                      .slice(0, 10),
                )
                const parsed = contactCreateSchema.safeParse({
                  name,
                  email,
                  expiry,
                })
                if (
                  !parsed.success ||
                  !Number.isFinite(Date.parse(expiry)) ||
                  Date.parse(expiry) <= Date.now()
                ) {
                  setMessage(
                    'Enter a contact name, valid email and a future access expiration.',
                  )
                  return
                }
                let id = created
                if (!id) {
                  const result = await command.createContact(root, {
                    clientId,
                    name: parsed.data.name,
                    email: parsed.data.email,
                    accessExpiresAt: new Date(expiry).toISOString(),
                  })
                  if (!result) return
                  id = result.contact.id
                  setCreated(id)
                }
                if (saveOnly || (await invite(id))) {
                  if (saveOnly)
                    setMessage(
                      'Contact saved. Publish the project, then send the invitation from the contact actions.',
                    )
                  setCreated('')
                  setName('')
                  setEmail('')
                }
              }}
            >
              <h3>
                <Send size={27} aria-hidden="true" />
                Invite another contact
              </h3>
              <label className="client-access-field">
                <span>Contact name</span>
                <span className="client-access-input">
                  <UserRound size={18} aria-hidden="true" />
                  <input
                    autoComplete="name"
                    placeholder="e.g., Ayan Khan"
                    required
                    value={name}
                    disabled={!!created}
                    onChange={(e) => setName(e.target.value)}
                  />
                </span>
              </label>
              <label className="client-access-field">
                <span>Email address</span>
                <span className="client-access-input">
                  <Mail size={18} aria-hidden="true" />
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="e.g., ayan@example.com"
                    required
                    value={email}
                    disabled={!!created}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </span>
              </label>
              <label className="client-access-field">
                <span>Access expires (optional)</span>
                <input
                  name="expiry"
                  type="date"
                  readOnly={!!created}
                  title="Defaults to 90 days when left blank"
                />
              </label>
              <div className="client-access-invite-actions">
                {unpublished && (
                  <button
                    className="secondary-button"
                    type="submit"
                    value="save"
                    disabled={command.pending || !canManage}
                  >
                    Save contact
                  </button>
                )}
                <button
                  className="primary-button"
                  type="submit"
                  disabled={
                    command.pending || !canManage || !canInvite || unpublished
                  }
                >
                  <Send size={17} aria-hidden="true" />
                  Send invitation
                </button>
              </div>
            </form>
            {created && (
              <Notice>Contact created. Retry sending the invitation.</Notice>
            )}
          </div>
        )}
        <ErrorNotice error={command.error} />
        {message && <Notice>{message}</Notice>}
        {link && (
          <Notice>
            Development invitation: <Link to={link}>Open client access</Link>.
            Keep this tab open to retain in-memory demo state.
          </Notice>
        )}
      </section>
      <ConfirmDialog
        open={!!inviteContact}
        title="Send client invitation?"
        description={
          <>
            <p>
              Send a private link for this project to {inviteContact?.email}.
            </p>
            <p>
              This replaces any earlier unused invitation links for this
              contact. Ask the client to use only the newest invitation.
            </p>
            <ErrorNotice error={command.error} />
          </>
        }
        confirmLabel="Send invitation"
        pending={command.pending}
        onCancel={() => setInviteContact(null)}
        onConfirm={() => {
          if (inviteContact)
            void invite(inviteContact.id).then((sent) => {
              if (sent) setInviteContact(null)
            })
        }}
      />
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
    </>
  )
}

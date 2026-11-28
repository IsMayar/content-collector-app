import {
  Info,
  Mail,
  Send,
  MoreHorizontal,
  Plus,
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
import { Modal } from '@/shared/components/Modal'
import { ConfirmDialog, Notice } from '@/shared/components/Feedback'
import { ErrorNotice, QueryState } from '@/shared/components/ProductUI'
import {
  AccessCard,
  Avatar,
  Button,
  CardHeader,
  Callout,
  EmptyState,
  StatusBadge,
  TextInput,
  initialsFrom,
} from '@/shared/components/AccessUI'
import type { Tone } from '@/shared/components/AccessUI'
import { useId, useState } from 'react'
import { Link } from 'react-router'

interface ContactStatus {
  label: string
  tone: Tone
}

function contactStatus(c: ProjectContact): ContactStatus {
  if (c.state !== 'ACTIVE') {
    return { label: c.state.replaceAll('_', ' '), tone: 'warning' }
  }
  if (Date.parse(c.accessExpiresAt) <= Date.now()) {
    return { label: 'Expired', tone: 'danger' }
  }
  if (!c.accessInitializedAt) {
    return { label: 'Not invited', tone: 'neutral' }
  }
  return { label: 'Access active', tone: 'success' }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

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
  const q = useProjectContacts(root)
  const command = useClientCommands()
  const expiryInputId = useId()

  const [formOpen, setFormOpen] = useState(false)
  const [expiryDate, setExpiryDate] = useState('')
  const [link, setLink] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [created, setCreated] = useState('')
  const [revoke, setRevoke] = useState<ProjectContact | null>(null)
  const [inviteContact, setInviteContact] = useState<ProjectContact | null>(
    null,
  )
  const [inviteKeys, setInviteKeys] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')

  const missing = publicationMissing.filter(Boolean) as string[]

  async function invite(id: string): Promise<boolean> {
    if (!canManage || !canInvite || unpublished) return false
    const key = inviteKeys[id] || crypto.randomUUID()
    setInviteKeys((keys) => ({ ...keys, [id]: key }))
    const result = await command.run<{ demoUrl?: string }>(
      `${root}/contacts/${id}/invite`,
      {},
      'POST',
      { 'Idempotency-Key': key },
    )
    if (!result) return false
    setLink(result.demoUrl || '')
    setMessage(
      env.mocksEnabled
        ? 'Invitation created.'
        : 'Invitation queued for delivery.',
    )
    setInviteKeys((keys) => ({ ...keys, [id]: crypto.randomUUID() }))
    return true
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canManage || command.pending) return

    const saveOnly =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'save'
    if (saveOnly ? !unpublished : !canInvite || unpublished) return

    const form = new FormData(e.currentTarget)
    const expiry = String(
      form.get('expiry') ||
        new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10),
    )

    const parsed = contactCreateSchema.safeParse({ name, email, expiry })
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
      if (saveOnly) {
        setMessage(
          'Contact saved. Publish the project, then send the invitation from the contact actions.',
        )
      }
      setCreated('')
      setName('')
      setEmail('')
      setExpiryDate('')
      setFormOpen(false)
    }
  }

  return (
    <AccessCard aria-label="Project contacts" className="project-client-card">
      <CardHeader
        icon={UsersRound}
        title="Client access"
        subtitle="Clients can submit content for this project."
        action={
          canManage && (canInvite || unpublished) ? (
            <Button
              variant="primary"
              icon={Plus}
              disabled={command.pending}
              onClick={() => {
                command.clear()
                setMessage('')
                setFormOpen(true)
              }}
            >
              {unpublished ? 'Add contact' : 'Invite client'}
            </Button>
          ) : undefined
        }
      />

      <QueryState query={q}>
        {q.data?.data.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No project contacts yet"
            description="Add a client contact to give them access to this project."
          />
        ) : (
          <div className="project-client-table" role="table" aria-label="Client access">
            <div className="project-client-table-head" role="row">
              <span role="columnheader">Client</span>
              <span role="columnheader">Access status</span>
              <span role="columnheader">Access expires</span>
              <span role="columnheader">Actions</span>
            </div>
            {q.data?.data.map((c) => {
              const status = contactStatus(c)
              const canSend =
                canManage &&
                canInvite &&
                !unpublished &&
                !command.pending &&
                c.state === 'ACTIVE' &&
                Date.parse(c.accessExpiresAt) > Date.now()
              const canRevoke =
                canManage && !command.pending && c.state === 'ACTIVE'

              return (
                <div className="project-client-row" role="row" key={c.id}>
                  <div className="project-client-person" role="cell">
                    <Avatar initials={initialsFrom(c.name)} label={c.name} />
                    <div className="project-client-identity">
                      <strong>{c.name}</strong>
                      <span>{c.email}</span>
                    </div>
                  </div>
                  <div className="project-client-status" role="cell">
                    <StatusBadge tone={status.tone}>
                      {status.label}
                    </StatusBadge>
                    {c.accessInitializedAt && (
                      <span className="project-client-invitation">
                        <Send size={13} aria-hidden="true" />
                        Invitation issued
                      </span>
                    )}
                  </div>
                  <div className="project-client-expiry" role="cell">
                    <time dateTime={c.accessExpiresAt}>
                      {formatDate(c.accessExpiresAt)}
                    </time>
                  </div>
                  <div className="project-client-actions" role="cell">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={Send}
                      disabled={!canSend}
                      onClick={() => {
                        command.clear()
                        setInviteContact(c)
                      }}
                    >
                      {c.accessInitializedAt ? 'Resend invitation' : 'Invite'}
                    </Button>
                    {canManage && (
                      <details
                        className="project-actions-menu"
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.currentTarget.open = false
                            event.currentTarget.querySelector('summary')?.focus()
                          }
                        }}
                      >
                        <summary aria-label={`Actions for ${c.name}`}>
                          <MoreHorizontal size={18} aria-hidden="true" />
                        </summary>
                        <div className="project-actions-popover">
                          <Button
                            variant="danger-ghost"
                            disabled={!canRevoke}
                            onClick={(event) => {
                              event.currentTarget.closest('details')?.removeAttribute('open')
                              command.clear()
                              setRevoke(c)
                            }}
                          >
                            Revoke access
                          </Button>
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </QueryState>

      {unpublished && canManage && (
        <div className="au-card-section">
          {unpublished && (
            <Callout
              tone="warning"
              icon={Info}
              title="Publish this project before inviting clients."
            >
              {missing.length > 0 && <>Still needed: {missing.join(', ')}. </>}
              You can save a contact now and send the invitation after
              publishing.
            </Callout>
          )}

        </div>
      )}
      {formOpen && canManage && (canInvite || unpublished) && (
        <Modal
          title={unpublished ? 'Add client contact' : 'Invite client'}
          className="project-access-modal"
          pending={command.pending}
          onClose={() => setFormOpen(false)}
        >
          <form onSubmit={onSubmit} className="au-form" noValidate>
            <p className="au-help">
              {unpublished
                ? 'Save a contact now and invite them after publishing.'
                : 'Send a private invitation to submit content for this project.'}
            </p>
            <div className="au-grid">
              <label className="au-field">
                <span className="au-label">Contact name</span>
                <TextInput
                  icon={UserRound}
                  autoComplete="name"
                  placeholder="e.g., Ayan Khan"
                  required
                  value={name}
                  disabled={!!created}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>

              <label className="au-field">
                <span className="au-label">Email address</span>
                <TextInput
                  icon={Mail}
                  type="email"
                  autoComplete="email"
                  placeholder="e.g., ayan@example.com"
                  required
                  value={email}
                  disabled={!!created}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            </div>

            <div className="au-field">
              <label className="au-label" htmlFor={expiryInputId}>
                Access expires (optional)
              </label>
              <input
                id={expiryInputId}
                name="expiry"
                type="date"
                readOnly={!!created}
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
                className="au-input au-input--date"
                title="Defaults to 90 days when left blank"
              />
              <p className="au-field-hint">
                Defaults to 90 days when left blank.
              </p>
            </div>

            <ErrorNotice error={command.error} />
            {message && <Notice>{message}</Notice>}
            <div className="au-actions au-actions--end">
              <Button
                variant="secondary"
                disabled={command.pending}
                onClick={() => setFormOpen(false)}
              >
                Cancel
              </Button>
              {unpublished && (
                <Button
                  variant="secondary"
                  type="submit"
                  value="save"
                  disabled={command.pending || !canManage}
                >
                  Save contact
                </Button>
              )}
              {!unpublished && (
                <Button
                  variant="primary"
                  type="submit"
                  icon={Send}
                  disabled={command.pending || !canManage || !canInvite}
                >
                  {created ? 'Retry invitation' : 'Send invitation'}
                </Button>
              )}
            </div>
          </form>

          {created && (
            <Notice>Contact created. Retry sending the invitation.</Notice>
          )}
        </Modal>
      )}

      {!formOpen && (command.error || message || link) && (
      <div className="au-card-section au-card-section--muted">
        <ErrorNotice error={command.error} />
        {message && <Notice>{message}</Notice>}
        {link && (
          <Notice>
            Development invitation: <Link to={link}>Open client access</Link>.
            Keep this tab open to retain in-memory demo state.
          </Notice>
        )}
      </div>
      )}

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
          if (inviteContact) {
            void invite(inviteContact.id).then((sent) => {
              if (sent) setInviteContact(null)
            })
          }
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
            ) {
              setRevoke(null)
            }
          })()
        }
      />
    </AccessCard>
  )
}

import {
  CalendarDays,
  Info,
  Mail,
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
import { ErrorNotice, QueryState } from '@/shared/components/ProductUI'
import {
  AccessCard,
  Avatar,
  Button,
  CardHeader,
  Callout,
  EmptyState,
  IconButton,
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
  return { label: 'Active', tone: 'success' }
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
    }
  }

  return (
    <AccessCard aria-label="Project contacts">
      <CardHeader
        icon={UsersRound}
        title="Project contacts"
        subtitle="People from this customer who can access and submit content for this project."
      />

      <QueryState query={q}>
        {q.data?.data.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No project contacts yet"
            description="Add the first client contact using the form below."
          />
        ) : (
          <ul className="au-list">
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
                <li key={c.id} className="au-row">
                  <Avatar initials={initialsFrom(c.name)} label={c.name} />

                  <div className="au-row-main">
                    <div className="au-row-title">
                      <span className="au-row-name">{c.name}</span>
                      <StatusBadge tone={status.tone}>
                        {status.label}
                      </StatusBadge>
                    </div>

                    <p className="au-row-sub">
                      <Mail size={13} aria-hidden="true" />
                      <span className="au-truncate">{c.email}</span>
                    </p>

                    <div className="au-row-meta">
                      <span className="au-meta-item">
                        {c.accessInitializedAt && (
                          <Send size={12} aria-hidden="true" />
                        )}
                        {c.accessInitializedAt
                          ? 'Invitation issued'
                          : 'Not invited'}
                      </span>
                      <span className="au-meta-item">
                        <CalendarDays size={12} aria-hidden="true" />
                        Expires{' '}
                        <time dateTime={c.accessExpiresAt}>
                          {formatDate(c.accessExpiresAt)}
                        </time>
                      </span>
                    </div>
                  </div>

                  <div className="au-row-actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={Send}
                      disabled={!canSend}
                      onClick={() => setInviteContact(c)}
                    >
                      {c.accessInitializedAt ? 'Resend' : 'Invite'}
                    </Button>
                    <IconButton
                      icon={Trash2}
                      tone="danger"
                      label={`Revoke access for ${c.name}`}
                      disabled={!canRevoke}
                      onClick={() => setRevoke(c)}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </QueryState>

      {canManage && (
        <div className="au-card-section">
          {unpublished && (
            <Callout
              tone="warning"
              icon={Info}
              title="Publish this project before inviting clients."
            >
              {missing.length > 0 && (
                <>Still needed: {missing.join(', ')}. </>
              )}
              You can save a contact now and send the invitation after
              publishing.
            </Callout>
          )}

          <form onSubmit={onSubmit} className="au-form" noValidate>
            <div className="au-form-head">
              <Send size={16} aria-hidden="true" />
              <h3 className="au-form-title">Invite another contact</h3>
            </div>

            <div className="au-grid au-grid--2">
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
                className="au-input au-input--date"
                title="Defaults to 90 days when left blank"
              />
              <p className="au-field-hint">
                Defaults to 90 days when left blank.
              </p>
            </div>

            <div className="au-actions au-actions--end">
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
              <Button
                variant="primary"
                type="submit"
                icon={Send}
                disabled={
                  command.pending || !canManage || !canInvite || unpublished
                }
              >
                Send invitation
              </Button>
            </div>
          </form>

          {created && (
            <Notice>Contact created. Retry sending the invitation.</Notice>
          )}
        </div>
      )}

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

import { useState } from 'react'
import { usePortalData } from '@/services/api/resourceApi'
import { useCommand } from '@/shared/hooks/useCommand'
import { ErrorNotice, Field, QueryState } from '@/shared/components/ProductUI'
import type { ClientVisibleComment } from '../types/review.types'
export function ClientComments({
  projectId,
  itemId,
  canRespond,
}: {
  projectId: string
  itemId: string
  canRespond: boolean
}) {
  const root = `client/projects/${projectId}/items/${itemId}/comments`
  const query = usePortalData<{ data: ClientVisibleComment[] }>(root)
  const command = useCommand(true)
  const [body, setBody] = useState('')
  return (
    <section className="client-conversation" aria-label="Client conversation">
      <h3>Conversation</h3>
      <p className="client-conversation-note">
        Visible to you and your agency.
      </p>
      <QueryState query={query}>
        <ul>
          {query.data?.data.map((c) => (
            <li className="client-message" key={c.id}>
              <span className="client-message-avatar" aria-hidden="true">
                {c.authorDisplayName.slice(0, 1)}
              </span>
              <strong>{c.authorDisplayName}</strong>
              <p className="preserve-text">{c.body}</p>
              <time dateTime={c.createdAt}>
                {new Date(c.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      </QueryState>
      {canRespond && (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!body.trim() || command.pending) return
            if (await command.run(root, { body: body.trim() })) setBody('')
          }}
        >
          <Field label="Message to your agency">
            <textarea
              rows={1}
              placeholder="Write a comment…"
              required
              maxLength={5000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
          <button
            type="submit"
            className="primary-button"
            disabled={command.pending}
          >
            Send comment
          </button>
        </form>
      )}
      <ErrorNotice error={command.error} />
    </section>
  )
}

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
    <section aria-label="Client conversation">
      <h3>Comments and feedback</h3>
      <QueryState query={query}>
        <ul>
          {query.data?.data.map((c) => (
            <li key={c.id}>
              <strong>{c.authorDisplayName}</strong>
              <p className="preserve-text">{c.body}</p>
              <time>{new Date(c.createdAt).toLocaleString()}</time>
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
              required
              maxLength={5000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
          <button
            type="submit"
            className="secondary-button"
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

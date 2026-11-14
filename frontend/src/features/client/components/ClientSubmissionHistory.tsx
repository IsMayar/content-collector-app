import { useEffect, useState } from 'react'
import type { z } from 'zod'
import type { submissionRevisionSchema } from '../schemas/submissionSchema'
import { History } from 'lucide-react'
import { useLazyReadDraftQuery } from '../api/clientAnswersApi'
import { SubmittedAnswer } from '@/shared/components/SubmittedAnswer'
export function ClientSubmissionHistory({
  projectId,
  itemId,
  active,
  hasSavedAnswer = false,
  currentRevisionId,
  currentState,
}: {
  projectId: string
  itemId: string
  active: boolean
  hasSavedAnswer?: boolean
  currentRevisionId?: string | null
  currentState: string
}) {
  const [open, setOpen] = useState(false)
  const [read, query] = useLazyReadDraftQuery()
  useEffect(() => {
    if (active && open) void read({ projectId, itemId }, false)
  }, [active, open, projectId, itemId, currentRevisionId, currentState, read])
  if (!currentRevisionId && !hasSavedAnswer) return null
  return (
    <details
      className="client-history"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <History size={16} aria-hidden="true" /> History
      </summary>
      {open && (
        <HistoryContent
          query={query}
          retry={() => void read({ projectId, itemId }, false)}
          currentRevisionId={currentRevisionId}
          currentState={currentState}
        />
      )}
    </details>
  )
}
function HistoryContent({
  query,
  retry,
  currentRevisionId,
  currentState,
}: {
  query: {
    isUninitialized: boolean
    isFetching: boolean
    isError: boolean
    currentData?: { revisions?: z.infer<typeof submissionRevisionSchema>[] }
  }
  retry: () => void
  currentRevisionId?: string | null
  currentState: string
}) {
  if (query.isUninitialized || query.isFetching)
    return (
      <p className="client-history-loading" role="status">
        Loading history…
      </p>
    )
  if (query.isError)
    return (
      <div className="client-history-error">
        <p role="alert">
          History couldn’t be loaded. Your answer is still available.
        </p>
        <button type="button" className="text-link" onClick={retry}>
          Retry history
        </button>
      </div>
    )
  const rows = query.currentData?.revisions || []
  if (!rows.length) return <p>No submitted revisions yet.</p>
  return (
    <div>
      {rows.map((r) => (
        <article key={r.revisionId}>
          <header>
            <h4>Revision {r.revisionNo}</h4>
            {r.revisionId === currentRevisionId ? (
              <span className="client-history-state">
                {currentState.replaceAll('_', ' ').toLowerCase()}
              </span>
            ) : (
              <span className="client-history-state">Submitted revision</span>
            )}
            <time dateTime={r.submittedAt}>
              {new Date(r.submittedAt).toLocaleString()}
            </time>
          </header>
          <SubmittedAnswer schema={r.schemaSnapshot} value={r.valueSnapshot} />
          {r.assets.length > 0 && (
            <ul>
              {r.assets.map((a) => (
                <li key={a.id}>{a.originalName}</li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  )
}

import { useState } from 'react'
import type { z } from 'zod'
import { submissionRevisionSchema } from '../schemas/submissionSchema'
import { useLazyReadDraftQuery } from '../api/clientAnswersApi'
import { SubmittedAnswer } from '@/shared/components/SubmittedAnswer'
export function ClientSubmissionHistory({
  projectId,
  itemId,
}: {
  projectId: string
  itemId: string
}) {
  const [read] = useLazyReadDraftQuery()
  const [rows, setRows] = useState<z.infer<typeof submissionRevisionSchema>[]>(
    [],
  )
  const [error, setError] = useState('')
  return (
    <details
      onToggle={async (e) => {
        if (!e.currentTarget.open) return
        try {
          setError('')
          const data = await read({ projectId, itemId }, false).unwrap()
          setRows(data.revisions || [])
        } catch {
          setError(
            'Submitted history could not be loaded. Check your connection and project access.',
          )
        }
      }}
    >
      <summary>Previous submitted versions</summary>
      {error && <p role="alert">{error}</p>}
      {rows.length ? (
        rows.map((r) => (
          <article key={r.revisionId}>
            <h4>Revision {r.revisionNo}</h4>
            <p>Submitted {new Date(r.submittedAt).toLocaleString()}</p>
            <SubmittedAnswer
              schema={r.schemaSnapshot}
              value={r.valueSnapshot}
            />
            <ul>
              {r.assets.map((a) => (
                <li key={a.id}>{a.originalName}</li>
              ))}
            </ul>
          </article>
        ))
      ) : (
        <p>No submitted versions loaded.</p>
      )}
    </details>
  )
}

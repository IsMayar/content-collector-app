import { ReviewComments } from '@/features/review/components/LiveReviewPanel'
import type { ReviewDecision } from '@/features/review/types/review.types'
import { env } from '@/config/env'
import { SubmittedAnswer } from '@/shared/components/SubmittedAnswer'
import { useState } from 'react'
import { useData } from '@/services/api/resourceApi'
import { useCommand } from '@/shared/hooks/useCommand'
import { QueryState, ErrorNotice } from '@/shared/components/ProductUI'
import { downloadFile } from '@/shared/utils/download'
type Summary = {
  revisionId: string
  itemId: string
  revisionNo: number
  submittedAt: string
}
type Revision = Summary & {
  submittedByContactId: string
  schemaSnapshot: { label: string; type: string }
  valueSnapshot: unknown
  assets: { id: string; originalName: string; availableVariants: string[] }[]
}
export function SubmissionHistoryPanel({
  root,
  items,
}: {
  root: string
  items: { id: string; label: string }[]
}) {
  const [itemId, setItemId] = useState(items[0]?.id || '')
  const [revisionId, setRevisionId] = useState('')
  const history = useData<{ data: Summary[] }>(
    `${root}/items/${itemId}/revisions`,
    { skip: !itemId },
  )
  const detail = useData<{ revision: Revision; decisions?: ReviewDecision[] }>(
    `${root}/items/${itemId}/revisions/${revisionId}`,
    { skip: !itemId || !revisionId },
  )
  const command = useCommand()
  const [error, setError] = useState('')
  return (
    <section className="product-panel" aria-label="Submitted versions">
      <h2>Submitted versions</h2>
      <p>
        Read the exact answer and files saved at submission. Authorized
        reviewers can make decisions from the Review tab.
      </p>
      <label>
        Question
        <select
          value={itemId}
          onChange={(e) => {
            setItemId(e.target.value)
            setRevisionId('')
          }}
        >
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
      </label>
      <QueryState query={history}>
        {!history.isFetching && history.data?.data.length ? (
          <ul>
            {history.data.data.map((r) => (
              <li key={r.revisionId}>
                <button
                  className="secondary-button"
                  onClick={() => setRevisionId(r.revisionId)}
                >
                  Revision {r.revisionNo} ·{' '}
                  {new Date(r.submittedAt).toLocaleString()}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No submitted versions for this question.</p>
        )}
      </QueryState>
      {revisionId && (
        <QueryState query={detail}>
          {!detail.isFetching && detail.data && (
            <article>
              <h3>
                {detail.data.revision.schemaSnapshot.label} · Revision{' '}
                {detail.data.revision.revisionNo}
              </h3>
              <p>
                Submitted{' '}
                {new Date(detail.data.revision.submittedAt).toLocaleString()}
              </p>
              <SubmittedAnswer
                schema={detail.data.revision.schemaSnapshot}
                value={detail.data.revision.valueSnapshot}
              />
              <ul>
                {detail.data.revision.assets.map((a) => (
                  <li key={a.id}>
                    <span>{a.originalName}</span>
                    <button
                      type="button"
                      disabled={command.pending}
                      onClick={async () => {
                        setError('')
                        const result = await command.run<{ url: string }>(
                          `${root}/assets/${a.id}/download`,
                          {
                            variant: a.availableVariants.includes('ORIGINAL')
                              ? 'ORIGINAL'
                              : 'WORKING',
                          },
                        )
                        if (result)
                          try {
                            await downloadFile(
                              result.url,
                              a.availableVariants.includes('ORIGINAL')
                                ? a.originalName
                                : a.originalName.replace(/\.[^.]+$/, '') +
                                    '.png',
                            )
                          } catch {
                            setError(
                              'The download failed. Request a fresh download and try again.',
                            )
                          }
                      }}
                    >
                      Download file
                    </button>
                  </li>
                ))}
              </ul>
            </article>
          )}
        </QueryState>
      )}
      {detail.data?.decisions?.map((d) => (
        <p key={d.id}>
          {d.decision} · {d.reviewerDisplayName} ·{' '}
          {new Date(d.reviewedAt).toLocaleString()}
          {d.reason && <span> · {d.reason}</span>}
        </p>
      ))}
      {!env.mocksEnabled && itemId && (
        <ReviewComments key={root + itemId} root={root} itemId={itemId} />
      )}
      <ErrorNotice error={command.error || error} />
    </section>
  )
}

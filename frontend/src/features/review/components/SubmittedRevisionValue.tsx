import { Copy } from 'lucide-react'
import { useState } from 'react'
import { useData } from '@/services/api/resourceApi'
import type { ReviewDecision, SubmissionRevision } from '../types/review.types'

export function useSubmittedRevision(
  root: string,
  item: string,
  revision: string,
) {
  const query = useData<{
    revision: SubmissionRevision
    decisions?: ReviewDecision[]
  }>(`${root}/items/${item}/revisions/${revision}`, { skip: !revision })
  const data = query.data
  return {
    ...query,
    data:
      !query.isError &&
      data?.revision.itemId === item &&
      data.revision.revisionId === revision
        ? data
        : undefined,
  }
}

export function answerText({
  schemaSnapshot,
  valueSnapshot,
}: SubmissionRevision): string | null {
  if (schemaSnapshot.type === 'FILE' || schemaSnapshot.type === 'IMAGE')
    return null
  if ('text' in valueSnapshot) return valueSnapshot.text
  if ('url' in valueSnapshot) return valueSnapshot.url
  return JSON.stringify(
    valueSnapshot,
    (_key, value: unknown) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).sort(([a], [b]) =>
              a < b ? -1 : a > b ? 1 : 0,
            ),
          )
        : value,
    2,
  )
}

export function CopyAnswer({ value }: { value: string }) {
  const [status, setStatus] = useState('')
  return (
    <div className="copy-answer">
      <button
        type="button"
        className="secondary-button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setStatus('Copied')
          } catch {
            setStatus(
              'Could not copy. Open the answer and select the text to copy it manually.',
            )
          }
        }}
      >
        <Copy size={17} aria-hidden="true" /> Copy answer
      </button>
      <span role="status">{status}</span>
    </div>
  )
}

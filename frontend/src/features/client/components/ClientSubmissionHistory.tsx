import { useEffect, useState } from 'react'
import type { z } from 'zod'
import type { submissionRevisionSchema } from '../schemas/submissionSchema'
import {
  History,
  ChevronDown,
  FileText,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { useLazyReadDraftQuery } from '../api/clientAnswersApi'
import { SubmittedAnswer } from '@/shared/components/SubmittedAnswer'

type Revision = z.infer<typeof submissionRevisionSchema>

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
    if (active && open) {
      void read({ projectId, itemId }, false)
    }
  }, [active, open, projectId, itemId, currentRevisionId, currentState, read])

  if (!currentRevisionId && !hasSavedAnswer) return null

  return (
    <details
      className="group"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 rounded-md py-1 text-[13px] font-medium text-slate-700 transition-colors hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <History size={16} aria-hidden="true" className="text-slate-500" />
          Version history
        </span>

        <ChevronDown
          size={16}
          aria-hidden="true"
          className="text-slate-500 transition-transform group-open:rotate-180"
        />
      </summary>

      {open && (
        <div className="pt-3">
          <HistoryContent
            query={query}
            retry={() => void read({ projectId, itemId }, false)}
            currentRevisionId={currentRevisionId}
            currentState={currentState}
          />
        </div>
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
    currentData?: {
      revisions?: Revision[]
    }
  }
  retry: () => void
  currentRevisionId?: string | null
  currentState: string
}) {
  if (query.isUninitialized || query.isFetching) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-3 text-[13px] text-slate-500"
      >
        <RefreshCw size={15} aria-hidden="true" className="animate-spin" />
        Loading history...
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
        <div className="flex items-start gap-2">
          <AlertCircle
            size={16}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-red-600"
          />

          <div className="space-y-2">
            <p role="alert" className="text-[13px] leading-5 text-red-700">
              History couldn't be loaded. Your answer is still available.
            </p>

            <button
              type="button"
              onClick={retry}
              className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-red-700 hover:underline focus-visible:outline-2 focus-visible:outline-red-500"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  const rows = query.currentData?.revisions || []

  if (!rows.length) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-3 text-[13px] text-slate-500">
        No submitted versions yet.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {rows.map((revision) => {
        const isCurrent = revision.revisionId === currentRevisionId

        const stateLabel = isCurrent
          ? currentState.replaceAll('_', ' ').toLowerCase()
          : 'Previous submission'

        return (
          <details
            key={revision.revisionId}
            className="group/revision overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <FileText size={15} aria-hidden="true" />
                </span>

                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-slate-900">
                    Version {revision.revisionNo}
                  </span>

                  <span className="block text-[11px] capitalize text-slate-500">
                    {stateLabel}
                  </span>
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-2">
                <time
                  dateTime={revision.submittedAt}
                  className="hidden text-[11px] text-slate-500 sm:inline"
                >
                  {new Date(revision.submittedAt).toLocaleDateString()}
                </time>

                <ChevronDown
                  size={15}
                  aria-hidden="true"
                  className="text-slate-400 transition-transform group-open/revision:rotate-180"
                />
              </span>
            </summary>

            <div className="space-y-3 border-t border-slate-100 px-3 py-3">
              <p className="text-[11px] text-slate-500">
                Submitted {new Date(revision.submittedAt).toLocaleString()}
              </p>

              <div className="min-w-0 overflow-x-auto text-[13px] text-slate-800">
                <SubmittedAnswer
                  schema={revision.schemaSnapshot}
                  value={revision.valueSnapshot}
                />
              </div>

              {revision.assets.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="mb-2 text-xs font-medium text-slate-700">
                    Attached files
                  </p>

                  <ul className="space-y-1.5">
                    {revision.assets.map((asset) => (
                      <li
                        key={asset.id}
                        className="flex min-w-0 items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-[12px] text-slate-700"
                      >
                        <FileText
                          size={14}
                          aria-hidden="true"
                          className="shrink-0 text-slate-400"
                        />

                        <span className="min-w-0 break-all">
                          {asset.originalName}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        )
      })}
    </div>
  )
}

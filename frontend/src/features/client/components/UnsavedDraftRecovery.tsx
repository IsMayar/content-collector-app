import { ClipboardCopy, ChevronDown, FileText, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { pendingDrafts } from '../hooks/draftAutosave'

export function UnsavedDraftRecovery({ projectId }: { projectId: string }) {
  const [copyState, setCopyState] = useState('')
  const entries = [...pendingDrafts.entries()].filter(
    ([key, draft]) => key.startsWith(projectId + '/') && draft.state.dirty,
  )

  if (!entries.length) return null

  return (
    <section
      aria-label="Unsaved answer recovery"
      className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert
          size={19}
          className="mt-0.5 shrink-0 text-amber-700"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">
            Your unsaved answers are still in this tab
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            These edits have not been confirmed as saved. Copy anything
            important before opening a new project session.
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {entries.map(([key, draft], index) => (
          <details
            key={key}
            className="group overflow-hidden rounded-lg border border-amber-200/80 bg-white"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 text-sm font-medium text-slate-800 focus-visible:outline-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
              <FileText
                size={16}
                className="shrink-0 text-amber-700"
                aria-hidden="true"
              />
              <span className="flex-1">Unsaved answer {index + 1}</span>
              <ChevronDown
                size={16}
                className="shrink-0 text-slate-500 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="border-t border-slate-100 px-3 pb-3 pt-3">
              <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                {JSON.stringify(draft.state.value, null, 2)}
              </pre>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(JSON.stringify(draft.state.value, null, 2))
                      .then(() => setCopyState(key))
                      .catch(() => setCopyState('error:' + key))
                  }
                >
                  <ClipboardCopy size={14} aria-hidden="true" />
                  Copy answer
                </button>
                {copyState === key && (
                  <span
                    role="status"
                    className="text-xs font-medium text-emerald-700"
                  >
                    Copied to clipboard
                  </span>
                )}
                {copyState === 'error:' + key && (
                  <span role="alert" className="text-xs text-red-700">
                    Copy failed. Select the text above instead.
                  </span>
                )}
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

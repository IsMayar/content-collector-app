import { AlertCircle, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { CollectionData } from '../schemas/collectionSchema'

/** Whether a saved answer includes user-provided content. */
export function hasSavedAnswer(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') {
    return Object.values(value).some(hasSavedAnswer)
  }
  return false
}

export function SubmissionValidationSummary({
  data,
  onSelect,
}: {
  data: CollectionData
  onSelect: (sectionId: string, itemId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const missing = data.sections
    .map((section) => ({
      id: section.id,
      title: section.title,
      items: section.items.filter(
        (item) =>
          item.required &&
          item.state !== 'SUBMITTED' &&
          item.state !== 'APPROVED' &&
          !hasSavedAnswer(item.answer?.value),
      ),
    }))
    .filter((section) => section.items.length > 0)

  const count = missing.reduce((total, section) => total + section.items.length, 0)
  if (count === 0) return null

  return (
    <section
      aria-label="Missing required answers"
      className="mb-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4"
    >
      <div className="flex items-start gap-3">
        <AlertCircle
          size={19}
          className="mt-0.5 shrink-0 text-amber-700"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900">
            {count} required {count === 1 ? 'answer' : 'answers'} without saved content
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Add the missing content before submitting those questions for review.
          </p>
        </div>
      </div>

      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="missing-required-answers"
        onClick={() => setExpanded((open) => !open)}
        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        View required questions without saved answers
        <ChevronDown
          size={15}
          className={expanded ? 'rotate-180 transition-transform' : 'transition-transform'}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div id="missing-required-answers" className="mt-3 space-y-3">
          {missing.map((section) => (
            <div key={section.id} className="rounded-lg border border-amber-200/80 bg-white p-3">
              <h3 className="text-sm font-semibold text-slate-900">{section.title}</h3>
              <ul className="mt-2 space-y-1">
                {section.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(section.id, item.id)}
                      className="w-full rounded-md px-2 py-2 text-left text-sm text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

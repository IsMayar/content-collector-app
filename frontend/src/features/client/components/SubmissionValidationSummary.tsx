import type { CollectionData } from '../schemas/collectionSchema'
export function hasSavedAnswer(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  return Object.values(value).some((v) =>
    typeof v === 'string' ? !!v.trim() : Array.isArray(v) && v.length > 0,
  )
}
export function SubmissionValidationSummary({
  data,
  onSelect,
}: {
  data: CollectionData
  onSelect: (section: string, item: string) => void
}) {
  const sections = data.sections
    .map((s) => ({
      ...s,
      items: s.items.filter(
        (i) =>
          i.required &&
          !['SUBMITTED', 'APPROVED'].includes(i.state) &&
          !hasSavedAnswer(i.answer?.value),
      ),
    }))
    .filter((s) => s.items.length)
  return (
    <section className="product-panel" aria-label="Submission readiness">
      <h2>Submission readiness</h2>
      <p>
        Each question is submitted separately. Saved answers must pass a final
        check on the server, including file verification.
      </p>
      {sections.length ? (
        <details>
          <summary>View required questions without saved answers</summary>
          {sections.map((s) => (
            <div key={s.id}>
              <h3>{s.title}</h3>
              <ul>
                {s.items.map((i) => (
                  <li key={i.id}>
                    <button
                      className="text-link"
                      type="button"
                      onClick={() => onSelect(s.id, i.id)}
                    >
                      {i.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      ) : (
        <p>
          All visible required questions have saved answers. Review each answer
          and submit when ready.
        </p>
      )}
    </section>
  )
}

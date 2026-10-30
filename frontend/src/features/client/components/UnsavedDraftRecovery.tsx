import { pendingDrafts } from '../hooks/draftAutosave'
export function UnsavedDraftRecovery({ projectId }: { projectId: string }) {
  const entries = [...pendingDrafts.entries()].filter(
    ([key, d]) => key.startsWith(projectId + '/') && d.state.dirty,
  )
  if (!entries.length) return null
  return (
    <section aria-label="Unsaved answer recovery">
      <h2>Your unsaved answers are kept in this tab</h2>
      <p>
        Copy these answers before opening a new session. They have not been
        confirmed as saved.
      </p>
      {entries.map(([key, d], i) => (
        <details key={key}>
          <summary>Unsaved answer {i + 1}</summary>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {JSON.stringify(d.state.value, null, 2)}
          </pre>
          <button
            onClick={() =>
              void navigator.clipboard.writeText(
                JSON.stringify(d.state.value, null, 2),
              )
            }
          >
            Copy unsaved answer {i + 1}
          </button>
        </details>
      ))}
    </section>
  )
}

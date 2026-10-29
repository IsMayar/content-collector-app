import { useClientPreview } from '@/features/projects/api/previewApi'
import { TypedValue } from '@/features/client/components/TypedValue'
import type { AnswerValue } from '@/features/client/types/client.types'
import { Notice } from '@/shared/components/Feedback'
import { Panel, QueryState } from '@/shared/components/ProductUI'
import { useState } from 'react'
export function PreviewPanel({ root }: { root: string }) {
  const q = useClientPreview(root),
    [section, setSection] = useState('')
  const preview = q.data?.preview
  const selected = preview?.sections.some((s) => s.id === section)
    ? section
    : preview?.sections[0]?.id
  return (
    <QueryState query={q}>
      <Notice>
        Read-only owner preview. This does not create or impersonate a client
        session. Answers, uploads, submissions and AI are unavailable.
      </Notice>
      {preview && (
        <>
          <h2>{preview.project.title}</h2>
          <p>
            {preview.project.agencyDisplayName} · Due {preview.project.dueDate}
          </p>
          {preview.sections.length === 0 && (
            <p>No visible sections to preview.</p>
          )}
          <nav className="reference-tabs" aria-label="Preview sections">
            {preview.sections.map((s) => (
              <button
                type="button"
                key={s.id}
                aria-pressed={s.id === selected}
                className={s.id === selected ? 'active' : ''}
                onClick={() => setSection(s.id)}
              >
                {s.title}
              </button>
            ))}
          </nav>
          {preview.sections
            .filter((s) => s.id === selected)
            .map((s) => (
              <Panel key={s.id} title={s.title}>
                {s.items.length === 0 && (
                  <p>No visible requests in this section.</p>
                )}
                {s.items.map((i) => {
                  const value: AnswerValue =
                    i.type === 'REPEATER'
                      ? {
                          rows: [
                            {
                              rowId: 'preview',
                              values: Object.fromEntries(
                                (i.validation.columns || []).map((c) => [
                                  c.key,
                                  c.type === 'IMAGE' ? [] : '',
                                ]),
                              ),
                            },
                          ],
                        }
                      : { text: '' }
                  return (
                    <div className="preview-item" key={i.id}>
                      <h3>
                        {i.label}{' '}
                        <small>{i.required ? 'Required' : 'Optional'}</small>
                      </h3>
                      <p>{i.instructions}</p>
                      {i.example && <p>Example: {i.example}</p>}
                      <TypedValue
                        item={i}
                        value={value}
                        onChange={() => {}}
                        disabled
                        root=""
                        preview
                      />
                    </div>
                  )
                })}
              </Panel>
            ))}
        </>
      )}
    </QueryState>
  )
}

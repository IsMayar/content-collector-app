import type { ClientChecklist } from '@/features/client/types/client.types'
import { useData } from '@/services/api/resourceApi'
import { Notice } from '@/shared/components/Feedback'
import { Panel, QueryState } from '@/shared/components/ProductUI'
import { useState } from 'react'

export function PreviewPanel({ root }: { root: string }) {
  const q = useData<ClientChecklist>(`${root}/client-preview`)
  const [section, setSection] = useState('')
  return (
    <QueryState query={q}>
      <Notice>
        Read-only owner preview. This does not create or impersonate a client
        session.
      </Notice>
      <nav className="reference-tabs" aria-label="Preview sections">
        {q.data?.sections.map((s) => (
          <button
            key={s.id}
            className={
              s.id === (section || q.data?.sections[0]?.id) ? 'active' : ''
            }
            onClick={() => setSection(s.id)}
          >
            {s.title}
          </button>
        ))}
      </nav>
      {q.data?.sections
        .filter((s) => s.id === (section || q.data?.sections[0]?.id))
        .map((s) => (
          <Panel key={s.id} title={s.title}>
            {s.items.map((i) => (
              <div className="preview-item" key={i.id}>
                <strong>
                  {i.label}
                  {i.required ? ' *' : ''}
                </strong>
                <p>{i.instructions}</p>
                <div className="disabled-preview">
                  {i.example ||
                    `Client response · ${i.type.replaceAll('_', ' ')}`}
                </div>
              </div>
            ))}
          </Panel>
        ))}
    </QueryState>
  )
}

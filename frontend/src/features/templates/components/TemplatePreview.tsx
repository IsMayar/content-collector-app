import { FieldSymbol } from '@/features/structure-editor/components/FieldSymbol'
import type { TemplateDefinition } from '@/features/templates/types/template.types'
import { FileText } from 'lucide-react'
import { useState } from 'react'
export function TemplatePreview({
  definition,
}: {
  definition: TemplateDefinition
}) {
  const [selected, setSelected] = useState('')
  const section =
    definition.sections.find((s) => s.key === selected) ||
    definition.sections[0]
  return (
    <div className="template-preview-layout">
      <nav aria-label="Template sections">
        {definition.sections.map((s) => (
          <button
            type="button"
            className={s.key === section?.key ? 'selected' : ''}
            key={s.key}
            onClick={() => setSelected(s.key)}
          >
            <FileText size={18} />
            <span>
              {s.title}
              <small>{s.items.length} items</small>
            </span>
          </button>
        ))}
      </nav>
      <section className="template-request-list">
        <h2>{definition.title} · Requested content</h2>
        {section?.items.map((i) => (
          <article key={i.key}>
            <FieldSymbol type={i.type} />
            <div>
              <h3>{i.label}</h3>
              <p>{i.instructions}</p>
            </div>
            <aside>
              <strong>
                {['IMAGE', 'FILE'].includes(i.type)
                  ? 'Asset request'
                  : 'Example'}
              </strong>
              <p>{i.example || 'Your client provides this content.'}</p>
            </aside>
          </article>
        ))}
      </section>
    </div>
  )
}

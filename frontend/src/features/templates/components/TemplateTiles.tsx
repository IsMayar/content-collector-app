import { TemplateSymbol } from '@/features/templates/components/TemplateSymbol'
import type { TemplateCardData } from '@/features/templates/types/template.types'
import { Check } from 'lucide-react'
export function TemplateTiles({
  templates,
  selected,
  onSelect,
}: {
  templates: TemplateCardData[]
  selected?: string
  onSelect: (template: TemplateCardData) => void
}) {
  return (
    <div className="reference-template-grid">
      {templates.map((t) => (
        <button
          type="button"
          key={t.versionId}
          className={`reference-template-tile ${selected === t.versionId ? 'selected' : ''}`}
          onClick={() => onSelect(t)}
          aria-pressed={selected === t.versionId}
        >
          <TemplateSymbol industry={t.industry} />
          {selected === t.versionId && (
            <Check className="selection-check" size={16} />
          )}
          <strong>{t.title.replace(/\s*(website|template)$/gi, '')}</strong>
          <span>
            {t.projectType === 'WEBSITE'
              ? `Collect website content for ${t.industry.replaceAll('_', ' ').toLowerCase()}.`
              : 'Define the goals, users, screens and assets for your application.'}
          </span>
        </button>
      ))}
    </div>
  )
}

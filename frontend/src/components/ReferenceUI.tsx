import { useState } from 'react'
import { Link } from 'react-router'
import {
  AppWindow,
  Smartphone,
  Globe,
  FileText,
  Image,
  List,
  Type,
  Link2,
  Users,
  Wrench,
  Zap,
  HeartPulse,
  Utensils,
  Scale,
  House,
  Scissors,
  Rocket,
  Check,
  ChevronRight,
} from 'lucide-react'
import type {
  Project,
  TemplateCardData,
  TemplateDefinition,
} from '@/api/productTypes'
import { Badge } from './ProductUI'

export function ProjectSymbol({ type }: { type: string }) {
  const Icon =
    type === 'WEBSITE' ? Globe : type === 'WEB_APP' ? AppWindow : Smartphone
  return (
    <span className={`project-symbol type-${type}`}>
      <Icon size={20} />
    </span>
  )
}
export function FieldSymbol({ type }: { type: string }) {
  const Icon =
    type === 'IMAGE'
      ? Image
      : type === 'URL'
        ? Link2
        : type === 'REPEATER'
          ? Users
          : type.includes('SELECT')
            ? List
            : type === 'SHORT_TEXT'
              ? Type
              : FileText
  return <Icon size={20} aria-hidden="true" />
}
export function TemplateSymbol({ industry }: { industry: string }) {
  const key = industry.toLowerCase()
  const Icon = key.includes('plumb')
    ? Wrench
    : key.includes('electric')
      ? Zap
      : key.includes('dent')
        ? HeartPulse
        : key.includes('restaurant')
          ? Utensils
          : key.includes('law')
            ? Scale
            : key.includes('estate')
              ? House
              : key.includes('salon')
                ? Scissors
                : Rocket
  return (
    <span className={`template-symbol symbol-${key}`}>
      <Icon size={27} />
    </span>
  )
}
export function Steps({ step }: { step: number }) {
  return (
    <ol className="wizard-steps" aria-label="Project creation progress">
      {['Choose a template', 'Project details', 'Review and create'].map(
        (name, index) => (
          <li
            key={name}
            aria-current={step === index + 1 ? 'step' : undefined}
            className={step >= index + 1 ? 'reached' : ''}
          >
            <span>{index + 1}</span>
            <span className="sr-only">{name}</span>
          </li>
        ),
      )}
    </ol>
  )
}
export function ProjectTable({
  projects,
  base,
}: {
  projects: Project[]
  base: string
}) {
  return (
    <div className="reference-table-wrap">
      <table className="reference-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Client</th>
            <th>Type</th>
            <th>Due date</th>
            <th>Submitted</th>
            <th>Approved</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Open project</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              <td>
                <Link className="table-project" to={`${base}/projects/${p.id}`}>
                  <ProjectSymbol type={p.projectType} />
                  <strong>{p.title}</strong>
                </Link>
              </td>
              <td>{p.clientBusinessName}</td>
              <td>
                {p.projectType === 'WEBSITE'
                  ? 'Website'
                  : p.projectType === 'WEB_APP'
                    ? 'Web app'
                    : 'Mobile app'}
              </td>
              <td>
                {new Date(`${p.dueDate}T12:00:00`).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </td>
              {[p.progress.submittedRequired, p.progress.approvedRequired].map(
                (count, index) => (
                  <td key={index}>
                    <div
                      className={`table-progress ${index ? 'approved' : ''}`}
                    >
                      <strong>
                        {count}/{p.progress.requiredTotal}
                      </strong>
                      <progress
                        aria-label={`${p.title} ${index ? 'approved' : 'submitted'}`}
                        max={p.progress.requiredTotal || 1}
                        value={count}
                      />
                    </div>
                  </td>
                ),
              )}
              <td>
                <Badge>{p.state}</Badge>
              </td>
              <td>
                <Link
                  className="icon-button"
                  aria-label={`Open ${p.title}`}
                  to={`${base}/projects/${p.id}`}
                >
                  <ChevronRight size={16} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
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

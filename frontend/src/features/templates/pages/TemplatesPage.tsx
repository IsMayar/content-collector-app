import { projectTypes } from '@/features/projects/types/projectOptions'
import { TemplateEditor } from '@/features/templates/components/TemplateEditor'
import { TemplatePreview } from '@/features/templates/components/TemplatePreview'
import { TemplateSymbol } from '@/features/templates/components/TemplateSymbol'
import type {
  TemplateCardData,
  TemplateDefinition,
} from '@/features/templates/types/template.types'
import { useData } from '@/services/api/resourceApi'
import {
  Empty,
  ErrorNotice,
  Field,
  Heading,
  QueryState,
} from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import { useState } from 'react'
import { Link } from 'react-router'

export function TemplatesPage() {
  const { id, base, owner } = useWorkspace()
  const query = useData<{ data: TemplateCardData[] }>(
    `workspaces/${id}/templates`,
  )
  const [type, setType] = useState('')
  const [industry, setIndustry] = useState('')
  const [preview, setPreview] = useState('')
  const [editing, setEditing] = useState('')
  const detail = useData<{ definition: TemplateDefinition }>(
    preview ? `workspaces/${id}/template-versions/${preview}` : '',
  )
  const command = useCommand()
  const [message, setMessage] = useState('')
  const [library, setLibrary] = useState('builtin')
  const selected = query.data?.data.find((t) => t.versionId === preview)
  return (
    <>
      {selected ? (
        <>
          <button
            className="back-link"
            onClick={() => {
              setPreview('')
              setEditing('')
            }}
          >
            Templates / {selected.industry.replaceAll('_', ' ')}
          </button>
          <Heading
            title={selected.title}
            description="Collect all the content you need from your client. Explore the sections, questions and examples in this template."
          >
            {owner && (
              <Link
                className="primary-button"
                to={`${base}/projects/new?type=${selected.projectType}&template=${selected.versionId}`}
              >
                Use this template
              </Link>
            )}
          </Heading>
          <QueryState query={detail}>
            {detail.data && (
              <TemplatePreview
                key={preview}
                definition={detail.data.definition}
              />
            )}
          </QueryState>
          <div className="actions template-actions">
            {owner && !selected.isBuiltin && (
              <button
                className="secondary-button"
                onClick={() => setEditing(selected.id)}
              >
                Edit workspace template
              </button>
            )}
            {owner && detail.data && (
              <button
                className="secondary-button"
                disabled={command.pending}
                onClick={async () => {
                  if (
                    await command.run(`workspaces/${id}/templates`, {
                      definition: {
                        ...detail.data!.definition,
                        title: `${selected.title} — workspace copy`,
                      },
                    })
                  )
                    setMessage('Independent workspace template created.')
                }}
              >
                Copy to workspace
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <Heading
            title="Project templates"
            description="Reusable starting structures for new projects. Your live client work is in Projects."
          />
          <nav className="reference-tabs" aria-label="Template library">
            {[
              ['builtin', 'Built-in templates'],
              ['workspace', 'My templates'],
            ].map(([key, label]) => (
              <button
                key={key}
                className={library === key ? 'active' : ''}
                aria-pressed={library === key}
                onClick={() => setLibrary(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="filter-bar">
            <Field label="Project type">
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">All types</option>
                {projectTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Industry">
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              >
                <option value="">All industries</option>
                {[...new Set(query.data?.data.map((t) => t.industry))].map(
                  (i) => (
                    <option key={i}>{i}</option>
                  ),
                )}
              </select>
            </Field>
          </div>
          <QueryState query={query}>
            <div className="template-grid template-library-grid">
              {query.data?.data
                .filter(
                  (t) =>
                    (library === 'builtin' ? t.isBuiltin : !t.isBuiltin) &&
                    (!type || t.projectType === type) &&
                    (!industry || t.industry === industry),
                )
                .map((t) => (
                  <article className="template-card" key={t.id}>
                    <TemplateSymbol industry={t.industry} />
                    <div className="template-copy">
                      <p className="eyebrow">
                        {t.isBuiltin ? 'Built-in' : 'Workspace'} ·{' '}
                        {t.projectType.replaceAll('_', ' ')}
                      </p>
                      <h2>{t.title}</h2>
                      <p>
                        {t.industry.replaceAll('_', ' ')} · Version {t.version}
                      </p>
                      <div className="template-card-actions">
                        <button
                          className="secondary-button"
                          onClick={() => setPreview(t.versionId)}
                        >
                          Preview
                        </button>
                        {owner && (
                          <Link
                            className="primary-button template-use-button"
                            to={`${base}/projects/new?type=${t.projectType}&template=${t.versionId}`}
                          >
                            Use template{' '}
                          </Link>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
            </div>
            {library === 'workspace' &&
              !query.data?.data.some((t) => !t.isBuiltin) && (
                <Empty
                  title="Your templates will appear here"
                  description="Preview a built-in template and copy it to your workspace to make it your own."
                />
              )}
          </QueryState>
          <p className="reference-info">
            ⓘ Templates are saved as a stable snapshot. Changes to a template do
            not affect existing projects.
          </p>
        </>
      )}
      <ErrorNotice error={command.error} />
      {message && <p role="status">{message}</p>}
      {editing && detail.data && (
        <TemplateEditor
          root={`workspaces/${id}/templates/${editing}`}
          definition={detail.data.definition}
          onClose={() => setEditing('')}
        />
      )}
    </>
  )
}

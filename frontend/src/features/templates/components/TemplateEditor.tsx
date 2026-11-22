import type { TemplateDefinition } from '@/features/templates/types/template.types'
import { Notice } from '@/shared/components/Feedback'
import {
  ErrorNotice,
  Field,
  Panel,
  QueryState,
} from '@/shared/components/ProductUI'
import { useData } from '@/services/api/resourceApi'
import { useCommand } from '@/shared/hooks/useCommand'
import { useState } from 'react'

export function TemplateEditor(props: {
  root: string
  definition: TemplateDefinition
  onClose: () => void
}) {
  const query = useData<{ version: number; definition: TemplateDefinition }>(
    `${props.root}/draft`,
  )
  return (
    <QueryState query={query}>
      {query.data && (
        <TemplateDraftEditor
          root={props.root}
          definition={query.data.definition}
          initialVersion={query.data.version}
          onClose={props.onClose}
        />
      )}
    </QueryState>
  )
}

function TemplateDraftEditor({
  root,
  definition,
  onClose,
  initialVersion,
}: {
  root: string
  definition: TemplateDefinition
  onClose: () => void
  initialVersion: number
}) {
  const [draft, setDraft] = useState(() => structuredClone(definition))
  const [version, setVersion] = useState(initialVersion)
  const command = useCommand()
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState('')
  return (
    <Panel title="Edit workspace template">
      <p>
        Publishing creates a new version for future projects. Existing project
        snapshots remain unchanged.
      </p>
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault()
          const result = await command.run<{ version: number }>(
            `${root}/draft`,
            { definition: draft, expectedVersion: version },
            'PUT',
          )
          if (result) {
            setVersion(result.version)
            setSaved(true)
            setMessage('Template draft saved. Publish when you’re ready.')
          }
        }}
      >
        <Field label="Template title">
          <input
            required
            value={draft.title}
            onChange={(e) => {
              setDraft({ ...draft, title: e.target.value })
              setSaved(false)
            }}
          />
        </Field>
        {draft.sections.map((section, index) => (
          <fieldset className="inset stack-form" key={section.key}>
            <legend>Section {index + 1}</legend>
            <Field label="Section name">
              <input
                required
                value={section.title}
                onChange={(e) => {
                  setDraft({
                    ...draft,
                    sections: draft.sections.map((s, i) =>
                      i === index ? { ...s, title: e.target.value } : s,
                    ),
                  })
                  setSaved(false)
                }}
              />
            </Field>
            {section.items.map((item, n) => (
              <div className="stack-form" key={item.key}>
                <div className="form-grid">
                  <Field label={`Question ${n + 1}`}>
                    <input
                      required
                      value={item.label}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          sections: draft.sections.map((s, i) =>
                            i === index
                              ? {
                                  ...s,
                                  items: s.items.map((it, j) =>
                                    j === n
                                      ? { ...it, label: e.target.value }
                                      : it,
                                  ),
                                }
                              : s,
                          ),
                        })
                        setSaved(false)
                      }}
                    />
                  </Field>
                  <Field label="Instructions">
                    <input
                      value={item.instructions}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          sections: draft.sections.map((s, i) =>
                            i === index
                              ? {
                                  ...s,
                                  items: s.items.map((it, j) =>
                                    j === n
                                      ? { ...it, instructions: e.target.value }
                                      : it,
                                  ),
                                }
                              : s,
                          ),
                        })
                        setSaved(false)
                      }}
                    />
                  </Field>
                </div>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={item.required}
                    onChange={(e) => {
                      setDraft({
                        ...draft,
                        sections: draft.sections.map((s, i) =>
                          i === index
                            ? {
                                ...s,
                                items: s.items.map((it, j) =>
                                  j === n
                                    ? { ...it, required: e.target.checked }
                                    : it,
                                ),
                              }
                            : s,
                        ),
                      })
                      setSaved(false)
                    }}
                  />
                  Required · {item.type.replaceAll('_', ' ')}
                </label>
              </div>
            ))}
          </fieldset>
        ))}
        <ErrorNotice error={command.error} />
        {message && <Notice>{message}</Notice>}
        <div className="actions">
          <button className="secondary-button" disabled={command.pending}>
            Save template draft
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!saved || command.pending}
            onClick={async () => {
              const result = await command.run<{ version: number }>(
                `${root}/versions`,
                { expectedVersion: version },
              )
              if (result) {
                setVersion(result.version)
                setMessage(
                  'New template version published. Existing projects are unchanged.',
                )
                setSaved(false)
              }
            }}
          >
            Publish new version
          </button>
          <button type="button" className="secondary-button" onClick={onClose}>
            Close editor
          </button>
        </div>
      </form>
    </Panel>
  )
}

import { useState } from 'react'
import type { TemplateDefinition } from '@/api/contracts'
import { ErrorNotice, Field, Panel, useCommand } from '@/components/ProductUI'
import { Notice } from '@/components/Feedback'
export function TemplateEditor({
  root,
  definition,
  onClose,
}: {
  root: string
  definition: TemplateDefinition
  onClose: () => void
}) {
  const [draft, setDraft] = useState(() => structuredClone(definition))
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
          if (
            await command.run(`${root}/draft`, { definition: draft }, 'PUT')
          ) {
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
              if (await command.run(`${root}/versions`, {})) {
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

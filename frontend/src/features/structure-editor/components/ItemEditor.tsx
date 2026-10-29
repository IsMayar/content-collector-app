import type { ProjectDetail } from '@/features/projects/types/project.types'
import { fieldTypes } from '@/features/structure-editor/types/fieldOptions'
import type {
  Item,
  ItemDefinition,
  RepeaterColumn,
  Section,
} from '@/features/structure-editor/types/structure.types'
import { useData } from '@/services/api/resourceApi'
import { ErrorNotice, Field, Panel } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { X } from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'

export function ItemEditor({
  root,
  structureVersion,
  section,
  item,
  onClose,
}: {
  root: string
  structureVersion: number
  section: Section
  item?: Item
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    const previous = document.activeElement as HTMLElement | null
    element?.showModal()
    return () => {
      element?.close()
      previous?.focus()
    }
  }, [])
  const [type, setType] = useState<ItemDefinition['type']>(
    item?.type || 'SHORT_TEXT',
  )
  const latest = useData<ProjectDetail>(root)
  const [options, setOptions] = useState(
    item?.validation.options?.map((o) => `${o.key}|${o.label}`).join('\n') ||
      'yes|Yes\nno|No',
  )
  const [columns, setColumns] = useState<RepeaterColumn[]>(
    item?.validation.columns || [
      { key: 'name', label: 'Name', type: 'SHORT_TEXT', required: true },
    ],
  )
  const command = useCommand()
  const [localError, setLocalError] = useState('')
  const [controller, setController] = useState(
    item?.visibleWhen?.dependsOnItemKey || '',
  )
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLocalError('')
    const v = Object.fromEntries(new FormData(e.currentTarget))
    try {
      const definition: ItemDefinition = {
        key: String(v.key),
        label: String(v.label),
        type,
        instructions: String(v.instructions || ''),
        example: String(v.example || ''),
        required: v.required === 'on',
        enabled: v.enabled === 'on',
        validation: {
          ...(item?.type === type ? item.validation : {}),
          ...(['SHORT_TEXT', 'LONG_TEXT'].includes(type)
            ? {
                maxLength:
                  Number(v.maxLength) || (type === 'SHORT_TEXT' ? 200 : 10000),
              }
            : {}),
          ...(['SINGLE_SELECT', 'MULTI_SELECT'].includes(type)
            ? {
                options: options
                  .split('\n')
                  .filter(Boolean)
                  .map((line) => {
                    const [key, label] = line.split('|')
                    return { key: key.trim(), label: (label || key).trim() }
                  }),
              }
            : {}),
          ...(type === 'URL' &&
          !(item?.type === type && item.validation.allowedSchemes)
            ? { allowedSchemes: ['https', 'http'] }
            : {}),
          ...(type === 'MULTI_SELECT' &&
          !(item?.type === type && item.validation.maxOptions)
            ? { maxOptions: options.split('\n').filter(Boolean).length }
            : {}),
          ...(['IMAGE', 'FILE'].includes(type)
            ? { maxFiles: Number(v.maxFiles) || 10 }
            : {}),
          ...(type === 'REPEATER'
            ? {
                columns,
                maxRows: Math.min(20, Number(v.maxRows) || 20),
              }
            : {}),
        },
        ...(controller
          ? {
              visibleWhen: {
                dependsOnItemKey: controller,
                operator: 'EQUALS' as const,
                optionKey: String(v.optionKey),
              },
            }
          : {}),
        ...(type === 'LONG_TEXT'
          ? {
              ai: {
                enabled: v.ai === 'on',
                targetWords: item?.ai?.targetWords ?? 150,
              },
            }
          : {}),
      }
      const result = await command.run(
        item
          ? `${root}/items/${item.id}/schema`
          : `${root}/sections/${section.id}/items`,
        {
          definition,
          expectedStructureVersion: structureVersion,
          reopenAffected: v.reopen === 'on',
        },
        item ? 'PATCH' : 'POST',
      )
      if (result) onClose()
    } catch {
      setLocalError('Check the field settings and try saving again.')
    }
  }
  return (
    <dialog
      ref={dialog}
      className="item-settings-drawer"
      aria-label="Item settings"
      onCancel={onClose}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
          ),
        ).filter((element) => element.getClientRects().length > 0)
        const first = controls[0]
        const last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }}
    >
      <header className="drawer-heading">
        <h2>{type === 'REPEATER' ? 'Repeater builder' : 'Item settings'}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close item settings"
        >
          <X size={20} />
        </button>
      </header>
      <Panel title={item ? 'Edit checklist item' : 'New checklist item'}>
        <p className="subtle">
          Your edits stay here if another change causes a version conflict.
        </p>
        <form className="stack-form" onSubmit={submit}>
          <div className="form-grid">
            <Field label="Label">
              <input required name="label" defaultValue={item?.label} />
            </Field>
            <Field label="Stable key">
              <input
                required
                pattern="[a-zA-Z][a-zA-Z0-9_.]*"
                name="key"
                defaultValue={item?.key || `item_${Date.now()}`}
                readOnly={!!item}
              />
            </Field>
            <Field label="Field type">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
              >
                {fieldTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Example">
              <input name="example" defaultValue={item?.example} />
            </Field>
          </div>
          <Field label="Instructions">
            <textarea name="instructions" defaultValue={item?.instructions} />
          </Field>
          <div className="actions">
            <label className="check-row">
              <input
                type="checkbox"
                name="required"
                defaultChecked={item?.required ?? true}
              />
              Required
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={item?.enabled !== false}
              />
              Enabled
            </label>
          </div>
          {['SHORT_TEXT', 'LONG_TEXT'].includes(type) && (
            <Field label="Maximum characters">
              <input
                type="number"
                name="maxLength"
                min={1}
                max={type === 'SHORT_TEXT' ? 200 : 10000}
                defaultValue={
                  item?.validation.maxLength ||
                  (type === 'SHORT_TEXT' ? 200 : 10000)
                }
              />
            </Field>
          )}
          {type === 'LONG_TEXT' && (
            <label className="check-row">
              <input
                type="checkbox"
                name="ai"
                defaultChecked={item?.ai?.enabled}
              />
              Allow optional fact-based writing assistance
            </label>
          )}
          {['SINGLE_SELECT', 'MULTI_SELECT'].includes(type) && (
            <Field label="Options (one key|Label per line)">
              <textarea
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                required
              />
            </Field>
          )}
          {['IMAGE', 'FILE'].includes(type) && (
            <Field label="Maximum files">
              <input
                name="maxFiles"
                type="number"
                min={1}
                max={50}
                defaultValue={item?.validation.maxFiles || 10}
              />
            </Field>
          )}
          {type === 'REPEATER' && (
            <>
              <Field label="Maximum rows">
                <input
                  name="maxRows"
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={item?.validation.maxRows || 20}
                />
              </Field>
              <fieldset className="stack-form repeater-columns">
                <legend>Entry fields · up to 8</legend>
                {columns.map((c, index) => (
                  <div className="inset stack-form" key={index}>
                    <div className="form-grid">
                      <Field label="Entry field label">
                        <input
                          required
                          value={c.label}
                          onChange={(e) =>
                            setColumns(
                              columns.map((v, i) =>
                                i === index
                                  ? { ...v, label: e.target.value }
                                  : v,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="Entry field key">
                        <input
                          required
                          pattern="[a-zA-Z][a-zA-Z0-9_]*"
                          value={c.key}
                          onChange={(e) =>
                            setColumns(
                              columns.map((v, i) =>
                                i === index ? { ...v, key: e.target.value } : v,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="Entry field type">
                        <select
                          value={c.type}
                          onChange={(e) =>
                            setColumns(
                              columns.map((v, i) =>
                                i === index
                                  ? {
                                      ...v,
                                      type: e.target
                                        .value as RepeaterColumn['type'],
                                    }
                                  : v,
                              ),
                            )
                          }
                        >
                          {[
                            'SHORT_TEXT',
                            'LONG_TEXT',
                            'URL',
                            'NUMBER',
                            'SINGLE_SELECT',
                            'IMAGE',
                          ].map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </Field>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={c.required}
                          onChange={(e) =>
                            setColumns(
                              columns.map((v, i) =>
                                i === index
                                  ? { ...v, required: e.target.checked }
                                  : v,
                              ),
                            )
                          }
                        />
                        Required
                      </label>
                    </div>
                    {c.type === 'SINGLE_SELECT' && (
                      <Field label="Entry options (one per line)">
                        <textarea
                          value={
                            c.options?.map((o) => o.label).join('\n') || ''
                          }
                          onChange={(e) =>
                            setColumns(
                              columns.map((v, i) =>
                                i === index
                                  ? {
                                      ...v,
                                      options: e.target.value
                                        .split('\n')
                                        .filter(Boolean)
                                        .map((label, n) => ({
                                          key: `option_${n + 1}`,
                                          label,
                                        })),
                                    }
                                  : v,
                              ),
                            )
                          }
                        />
                      </Field>
                    )}
                    <button
                      type="button"
                      className="danger-link"
                      disabled={columns.length === 1}
                      onClick={() =>
                        setColumns(columns.filter((_, i) => i !== index))
                      }
                    >
                      Remove entry field
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="secondary-button"
                  disabled={columns.length >= 8}
                  onClick={() =>
                    setColumns([
                      ...columns,
                      {
                        key: `field_${columns.length + 1}`,
                        label: 'New field',
                        type: 'SHORT_TEXT',
                        required: false,
                      },
                    ])
                  }
                >
                  Add entry field
                </button>
              </fieldset>
              <section
                className="repeater-preview"
                aria-label="Repeater preview"
              >
                <h3>Preview — one row</h3>
                <p className="subtle">
                  A repeating group of fields. Limited to one level and 20 rows.
                </p>
                <div>
                  {columns.map((column, index) => (
                    <div className="product-field" key={index}>
                      <label htmlFor={`preview-column-${index}`}>
                        {column.label}
                        {column.required ? ' *' : ''}
                      </label>
                      {column.type === 'LONG_TEXT' ? (
                        <textarea
                          id={`preview-column-${index}`}
                          disabled
                          placeholder="Add a short description…"
                        />
                      ) : column.type === 'SINGLE_SELECT' ? (
                        <select id={`preview-column-${index}`} disabled>
                          <option>Select an option</option>
                          {column.options?.map((o) => (
                            <option key={o.key}>{o.label}</option>
                          ))}
                        </select>
                      ) : column.type === 'IMAGE' ? (
                        <div className="preview-upload">Upload image</div>
                      ) : (
                        <input
                          id={`preview-column-${index}`}
                          disabled
                          placeholder={`Enter ${column.label.toLowerCase()}`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
          <Field label="Show when an earlier single select equals">
            <select
              value={controller}
              onChange={(e) => setController(e.target.value)}
            >
              <option value="">Always visible</option>
              {section.items
                .filter(
                  (i) =>
                    i.type === 'SINGLE_SELECT' &&
                    (!item || i.sortOrder < item.sortOrder),
                )
                .map((i) => (
                  <option value={i.key} key={i.id}>
                    {i.label}
                  </option>
                ))}
            </select>
          </Field>
          {controller && (
            <Field label="Matching option">
              <select
                name="optionKey"
                defaultValue={item?.visibleWhen?.optionKey}
              >
                {section.items
                  .find((i) => i.key === controller)
                  ?.validation.options?.map((o) => (
                    <option value={o.key} key={o.key}>
                      {o.label}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          {controller && (
            <p className="reference-info">
              When hidden, previously entered answers are retained. Hidden items
              return when their condition is met.
            </p>
          )}
          {item && ['SUBMITTED', 'APPROVED'].includes(item.state) && (
            <label className="check-row">
              <input required name="reopen" type="checkbox" />
              Reopen affected item; historical submissions remain immutable
            </label>
          )}
          <ErrorNotice error={localError || command.error} />
          {command.error && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => void latest.refetch()}
            >
              Refresh latest structure; keep my input
            </button>
          )}
          <div className="actions">
            <button className="primary-button" disabled={command.pending}>
              Save item
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </Panel>
    </dialog>
  )
}

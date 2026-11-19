import type { ProjectDetail } from '@/features/projects/types/project.types'
import { fieldTypes } from '@/features/structure-editor/types/fieldOptions'
import type {
  Item,
  ItemDefinition,
  RepeaterColumn,
  Section,
} from '@/features/structure-editor/types/structure.types'
import { useData } from '@/services/api/resourceApi'
import { ErrorNotice } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { ChevronDown, Plus, Trash2, X } from 'lucide-react'
import type { FormEvent, ReactNode, RefObject } from 'react'
import { useEffect, useId, useRef, useState } from 'react'

/* -------------------------------------------------------------------------- */
/*  Constants & styles                                                        */
/* -------------------------------------------------------------------------- */

type FieldType = ItemDefinition['type']
type ColumnType = RepeaterColumn['type']

/** A repeater column with a client-only id so React can track it stably. */
type DraftColumn = RepeaterColumn & { uid: string }

const LIMITS = {
  title: 120,
  reopenReason: 5000,
  shortText: 200,
  longText: 10_000,
  files: 50,
  defaultFiles: 10,
  rows: 20,
  repeaterColumns: 8,
} as const

const REPEATER_COLUMN_TYPES = [
  'SHORT_TEXT',
  'LONG_TEXT',
  'URL',
  'NUMBER',
  'SINGLE_SELECT',
  'IMAGE',
] as const

const ui = {
  input:
    'mt-1.5 block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/15 disabled:bg-slate-50 disabled:text-slate-500 sm:text-sm',
  label: 'block text-sm font-medium text-slate-900',
  help: 'mt-1.5 text-xs leading-5 text-slate-500',
  checkbox:
    'mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600',
  panel: 'rounded-xl border border-slate-200 bg-slate-50/60 p-4',
  button:
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50',
} as const

const buttonVariants = {
  primary: `${ui.button} bg-blue-600 px-5 text-white shadow-sm hover:bg-blue-700`,
  secondary: `${ui.button} border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50`,
} as const

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                              */
/* -------------------------------------------------------------------------- */

function formatFieldType(value: string) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function maxLengthFor(type: FieldType) {
  return type === 'SHORT_TEXT' ? LIMITS.shortText : LIMITS.longText
}

function createColumn(column: Partial<RepeaterColumn> = {}): DraftColumn {
  return {
    key: 'name',
    label: 'Name',
    type: 'SHORT_TEXT',
    required: false,
    ...column,
    uid: crypto.randomUUID(),
  }
}

/** Parses "key|Label" lines into select options. */
function parseChoices(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [key, label] = line.split('|')
      return { key: key.trim(), label: label?.trim() || key.trim() }
    })
}

function formatChoices(options: { key: string; label: string }[] = []) {
  return options.map((option) => `${option.key}|${option.label}`).join('\n')
}

/** Every item that (transitively) depends on `item` and already holds content. */
function getCollectedDependents(fields: Item[], item?: Item) {
  const affected = new Set(item ? [item.key] : [])
  let changed = true

  while (changed) {
    changed = false

    for (const field of fields) {
      if (
        field.visibleWhen &&
        affected.has(field.visibleWhen.dependsOnItemKey) &&
        !affected.has(field.key)
      ) {
        affected.add(field.key)
        changed = true
      }
    }
  }

  return fields.filter(
    (field) => affected.has(field.key) && field.state !== 'NOT_STARTED',
  )
}

function buildDefinition({
  values,
  key,
  type,
  item,
  options,
  columns,
  controller,
}: {
  values: Record<string, FormDataEntryValue>
  key: string
  type: FieldType
  item?: Item
  options: string
  columns: DraftColumn[]
  controller: string
}): ItemDefinition {
  const text = (name: string) => String(values[name] ?? '')
  const isSameType = item?.type === type
  const previous = isSameType ? item.validation : {}
  const choices = parseChoices(options)

  const validation: ItemDefinition['validation'] = { ...previous }

  if (type === 'SHORT_TEXT' || type === 'LONG_TEXT') {
    validation.maxLength = Number(values.maxLength) || maxLengthFor(type)
  }

  if (type === 'SINGLE_SELECT' || type === 'MULTI_SELECT') {
    validation.options = choices
  }

  if (type === 'URL' && !previous.allowedSchemes) {
    validation.allowedSchemes = ['https', 'http']
  }

  if (type === 'MULTI_SELECT' && !previous.maxOptions) {
    validation.maxOptions = choices.length
  }

  if (type === 'IMAGE' || type === 'FILE') {
    validation.maxFiles = Number(values.maxFiles) || LIMITS.defaultFiles
  }

  if (type === 'REPEATER') {
    validation.columns = columns.map(({ uid, ...column }) => {
      void uid
      return column
    })
    validation.maxRows = Math.min(
      LIMITS.rows,
      Number(values.maxRows) || LIMITS.rows,
    )
  }

  return {
    key,
    label: text('label'),
    type,
    instructions: text('instructions'),
    example: text('example'),
    required: values.required === 'on',
    enabled: values.enabled === 'on',
    validation,

    ...(controller && {
      visibleWhen: {
        dependsOnItemKey: controller,
        operator: 'EQUALS' as const,
        optionKey: text('optionKey'),
      },
    }),

    ...(type === 'LONG_TEXT' && {
      ai: {
        enabled: values.ai === 'on',
        targetWords: item?.ai?.targetWords ?? 150,
      },
    }),
  }
}

/* -------------------------------------------------------------------------- */
/*  Hooks                                                                     */
/* -------------------------------------------------------------------------- */

/** Opens a native <dialog> as a modal, locks body scroll, restores focus. */
function useModalDialog(ref: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const element = ref.current
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow

    element?.showModal()
    document.body.style.overflow = 'hidden'

    return () => {
      element?.close()
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [ref])
}

/* -------------------------------------------------------------------------- */
/*  Small building blocks                                                     */
/* -------------------------------------------------------------------------- */

function Field({
  id,
  label,
  optional,
  required,
  help,
  children,
}: {
  id: string
  label: string
  optional?: boolean
  required?: boolean
  help?: string
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className={ui.label}>
        {label}
        {required && (
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        )}
        {optional && (
          <span className="ml-1.5 font-normal text-slate-500">(optional)</span>
        )}
      </label>
      {children}
      {help && <p className={ui.help}>{help}</p>}
    </div>
  )
}

function CheckboxRow({
  title,
  description,
  className = '',
  ...inputProps
}: {
  title: string
  description: string
  className?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 ${className}`}>
      <input type="checkbox" className={ui.checkbox} {...inputProps} />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-900">
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">
          {description}
        </span>
      </span>
    </label>
  )
}

function SubSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-4 border-t border-slate-200 pt-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {description && <p className={ui.help}>{description}</p>}
      </div>
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Answer choices (single / multi select)                                    */
/* -------------------------------------------------------------------------- */

function ChoicesField({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className={ui.panel}>
      <Field
        id={id}
        label="Answer choices"
        help="Enter one choice per line using key|Label."
      >
        <textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          rows={5}
          spellCheck={false}
          placeholder={'yes|Yes\nno|No'}
          className={`${ui.input} resize-y font-mono`}
        />
      </Field>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Repeater                                                                  */
/* -------------------------------------------------------------------------- */

/** Keeps its own raw text so blank lines can be typed while editing. */
function ColumnOptionsInput({
  id,
  options,
  onChange,
}: {
  id: string
  options: RepeaterColumn['options']
  onChange: (options: NonNullable<RepeaterColumn['options']>) => void
}) {
  const [text, setText] = useState(
    () => options?.map((option) => option.label).join('\n') ?? '',
  )

  return (
    <Field id={id} label="Entry options" help="One option per line.">
      <textarea
        id={id}
        rows={3}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          onChange(
            event.target.value
              .split('\n')
              .map((label) => label.trim())
              .filter(Boolean)
              .map((label, index) => ({
                key: `option_${index + 1}`,
                label,
              })),
          )
        }}
        className={`${ui.input} resize-y`}
      />
    </Field>
  )
}

function ColumnCard({
  formId,
  column,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  formId: string
  column: DraftColumn
  index: number
  canRemove: boolean
  onChange: (patch: Partial<RepeaterColumn>) => void
  onRemove: () => void
}) {
  const id = `${formId}-column-${column.uid}`

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-900">
          Entry field {index + 1}
        </h4>

        <button
          type="button"
          disabled={!canRemove}
          onClick={onRemove}
          className="inline-flex items-center gap-1 rounded text-xs font-medium text-red-600 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 size={14} aria-hidden="true" />
          Remove
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-label`} label="Field label">
          <input
            id={`${id}-label`}
            required
            value={column.label}
            onChange={(event) => onChange({ label: event.target.value })}
            className={ui.input}
          />
        </Field>

        <Field id={`${id}-key`} label="Field key">
          <input
            id={`${id}-key`}
            required
            pattern="[a-zA-Z][a-zA-Z0-9_]*"
            title="Start with a letter. Use letters, numbers and underscores only."
            value={column.key}
            onChange={(event) => onChange({ key: event.target.value })}
            className={ui.input}
          />
        </Field>
      </div>

      <Field id={`${id}-type`} label="Entry field type">
        <select
          id={`${id}-type`}
          value={column.type}
          onChange={(event) =>
            onChange({ type: event.target.value as ColumnType })
          }
          className={ui.input}
        >
          {REPEATER_COLUMN_TYPES.map((type) => (
            <option key={type} value={type}>
              {formatFieldType(type)}
            </option>
          ))}
        </select>
      </Field>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={column.required}
          onChange={(event) => onChange({ required: event.target.checked })}
          className={ui.checkbox.replace('mt-0.5 ', '')}
        />
        Required entry field
      </label>

      {column.type === 'SINGLE_SELECT' && (
        <ColumnOptionsInput
          id={`${id}-options`}
          options={column.options}
          onChange={(options) => onChange({ options })}
        />
      )}
    </div>
  )
}

function RepeaterPreview({
  formId,
  columns,
}: {
  formId: string
  columns: DraftColumn[]
}) {
  return (
    <section
      aria-label="Repeater preview"
      className="space-y-3 border-t border-slate-200 pt-5"
    >
      <div>
        <h3 className="text-sm font-semibold text-slate-900">
          Preview of one row
        </h3>
        <p className={ui.help}>
          A repeating group of fields, limited to one level and {LIMITS.rows}{' '}
          rows.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        {columns.map((column) => {
          const id = `${formId}-preview-${column.uid}`

          return (
            <Field
              key={column.uid}
              id={id}
              label={column.label}
              required={column.required}
            >
              {column.type === 'LONG_TEXT' ? (
                <textarea
                  id={id}
                  disabled
                  rows={2}
                  placeholder="Add a short description..."
                  className={ui.input}
                />
              ) : column.type === 'SINGLE_SELECT' ? (
                <select id={id} disabled className={ui.input}>
                  <option>Select an option</option>
                  {column.options?.map((option) => (
                    <option key={option.key}>{option.label}</option>
                  ))}
                </select>
              ) : column.type === 'IMAGE' ? (
                <div
                  id={id}
                  className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500"
                >
                  Upload image
                </div>
              ) : (
                <input
                  id={id}
                  disabled
                  placeholder={`Enter ${column.label.toLowerCase()}`}
                  className={ui.input}
                />
              )}
            </Field>
          )
        })}
      </div>
    </section>
  )
}

function RepeaterFields({
  formId,
  columns,
  setColumns,
}: {
  formId: string
  columns: DraftColumn[]
  setColumns: (updater: (columns: DraftColumn[]) => DraftColumn[]) => void
}) {
  const updateColumn = (uid: string, patch: Partial<RepeaterColumn>) =>
    setColumns((current) =>
      current.map((column) =>
        column.uid === uid ? { ...column, ...patch } : column,
      ),
    )

  return (
    <div className={`${ui.panel} space-y-5`}>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">
          Repeating fields
        </h3>
        <p className={ui.help}>
          Let clients add multiple entries using the same fields.
        </p>
      </div>

      <div className="space-y-4">
        {columns.map((column, index) => (
          <ColumnCard
            key={column.uid}
            formId={formId}
            column={column}
            index={index}
            canRemove={columns.length > 1}
            onChange={(patch) => updateColumn(column.uid, patch)}
            onRemove={() =>
              setColumns((current) =>
                current.filter(({ uid }) => uid !== column.uid),
              )
            }
          />
        ))}
      </div>

      <button
        type="button"
        className={buttonVariants.secondary}
        disabled={columns.length >= LIMITS.repeaterColumns}
        onClick={() =>
          setColumns((current) => [
            ...current,
            createColumn({
              key: `field_${current.length + 1}`,
              label: 'New field',
            }),
          ])
        }
      >
        <Plus size={16} aria-hidden="true" />
        Add entry field
      </button>

      <RepeaterPreview formId={formId} columns={columns} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Affected content notice                                                   */
/* -------------------------------------------------------------------------- */

function AffectedItemsNotice({ fields }: { fields: Item[] }) {
  return (
    <section
      aria-label="Potentially affected collected items"
      className="rounded-xl border border-amber-200 bg-amber-50 p-4"
    >
      <h3 className="text-sm font-semibold text-amber-900">
        Collected content may be affected
      </h3>

      <p className="mt-2 text-xs leading-5 text-amber-800">
        Changes to this question may affect existing submissions or dependent
        questions.
      </p>

      <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-amber-900">
        {fields.map((field) => (
          <li key={field.id}>
            {field.label} · {field.state}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs leading-5 text-amber-800">
        Historical revisions remain unchanged. Incompatible drafts block the
        entire change.
      </p>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Advanced settings                                                         */
/* -------------------------------------------------------------------------- */

function AdvancedSettings({
  formId,
  type,
  item,
  availableControllers,
  selectedController,
  controller,
  onControllerChange,
  reopen,
  onReopenChange,
}: {
  formId: string
  type: FieldType
  item?: Item
  availableControllers: Item[]
  selectedController?: Item
  controller: string
  onControllerChange: (key: string) => void
  reopen: boolean
  onReopenChange: (value: boolean) => void
}) {
  const isText = type === 'SHORT_TEXT' || type === 'LONG_TEXT'
  const isFile = type === 'IMAGE' || type === 'FILE'
  const isRepeater = type === 'REPEATER'

  return (
    <details className="group rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-4 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-900">
            Advanced settings
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Optional configuration and visibility rules
          </span>
        </span>

        <ChevronDown
          size={18}
          className="shrink-0 text-slate-500 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="space-y-5 border-t border-slate-200 px-4 py-5">
        <CheckboxRow
          name="enabled"
          defaultChecked={item?.enabled !== false}
          title="Enabled"
          description="Allow this question to appear in the project."
        />

        {isText && (
          <Field
            id={`${formId}-max-length`}
            label="Maximum characters"
            help="Maximum number of characters the client can enter."
          >
            <input
              id={`${formId}-max-length`}
              type="number"
              name="maxLength"
              min={1}
              max={maxLengthFor(type)}
              defaultValue={item?.validation.maxLength || maxLengthFor(type)}
              className={ui.input}
            />
          </Field>
        )}

        {type === 'LONG_TEXT' && (
          <CheckboxRow
            name="ai"
            defaultChecked={item?.ai?.enabled}
            title="Writing assistance"
            description="Allow optional fact-based AI writing assistance."
          />
        )}

        {isFile && (
          <Field id={`${formId}-max-files`} label="Maximum files">
            <input
              id={`${formId}-max-files`}
              name="maxFiles"
              type="number"
              min={1}
              max={LIMITS.files}
              defaultValue={item?.validation.maxFiles || LIMITS.defaultFiles}
              className={ui.input}
            />
          </Field>
        )}

        {isRepeater && (
          <Field id={`${formId}-max-rows`} label="Maximum rows">
            <input
              id={`${formId}-max-rows`}
              name="maxRows"
              type="number"
              min={1}
              max={LIMITS.rows}
              defaultValue={item?.validation.maxRows || LIMITS.rows}
              className={ui.input}
            />
          </Field>
        )}

        <SubSection
          title="Conditional visibility"
          description="Choose when this question should appear based on an earlier dropdown answer."
        >
          <Field id={`${formId}-controller`} label="Show question when">
            <select
              id={`${formId}-controller`}
              value={controller}
              onChange={(event) => onControllerChange(event.target.value)}
              className={ui.input}
            >
              <option value="">Always visible</option>
              {availableControllers.map((field) => (
                <option key={field.id} value={field.key}>
                  {field.label}
                </option>
              ))}
            </select>
          </Field>

          {controller && (
            <Field
              id={`${formId}-option-key`}
              label="Matching answer"
              help="Previously entered answers are retained when the question is hidden."
            >
              <select
                id={`${formId}-option-key`}
                name="optionKey"
                key={controller}
                required
                defaultValue={
                  item?.visibleWhen?.dependsOnItemKey === controller
                    ? item.visibleWhen.optionKey
                    : undefined
                }
                className={ui.input}
              >
                {selectedController?.validation.options?.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </SubSection>

        {item && (
          <SubSection title="Collected content">
            <CheckboxRow
              name="reopen"
              checked={reopen}
              onChange={(event) => onReopenChange(event.target.checked)}
              title="Reopen affected items"
              description="Historical submissions remain unchanged. Use this only when existing collected content needs to be reopened."
            />

            {reopen && (
              <Field
                id={`${formId}-reopen-reason`}
                label="Reason for reopening"
                required
                help="Required when reopening submitted or approved work. Incompatible saved drafts are preserved and the change is rejected."
              >
                <textarea
                  id={`${formId}-reopen-reason`}
                  name="reopenReason"
                  maxLength={LIMITS.reopenReason}
                  required
                  rows={3}
                  placeholder="Explain why this collected content needs to be reopened..."
                  className={`${ui.input} resize-y`}
                />
              </Field>
            )}
          </SubSection>
        )}
      </div>
    </details>
  )
}

/* -------------------------------------------------------------------------- */
/*  ItemEditor                                                                */
/* -------------------------------------------------------------------------- */

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
  const dialogRef = useRef<HTMLDialogElement>(null)
  const formId = useId()
  const title = item ? 'Edit question' : 'Add question'

  useModalDialog(dialogRef)

  /* Form state ------------------------------------------------------------ */

  const [itemKey] = useState(() => item?.key || `item_${Date.now()}`)
  const [type, setType] = useState<FieldType>(item?.type || 'SHORT_TEXT')
  const [options, setOptions] = useState(
    () => formatChoices(item?.validation.options) || 'yes|Yes\nno|No',
  )
  const [columns, setColumns] = useState<DraftColumn[]>(
    () =>
      item?.validation.columns?.map((column) => ({
        ...column,
        uid: crypto.randomUUID(),
      })) ?? [createColumn({ required: true })],
  )
  const [controller, setController] = useState(
    item?.visibleWhen?.dependsOnItemKey || '',
  )
  const [reopen, setReopen] = useState(false)
  const [localError, setLocalError] = useState('')

  const command = useCommand()
  const latest = useData<ProjectDetail>(root)

  /* Derived data ---------------------------------------------------------- */

  const currentSection =
    latest.data?.structure.find((s) => s.id === section.id) || section

  const allFields =
    latest.data?.structure.flatMap((s) => s.items) || section.items

  const collectedDependents = getCollectedDependents(allFields, item)

  const availableControllers = currentSection.items.filter(
    (field) =>
      field.type === 'SINGLE_SELECT' &&
      (!item || field.sortOrder < item.sortOrder),
  )

  const selectedController = currentSection.items.find(
    (field) => field.key === controller,
  )

  /* Submit ---------------------------------------------------------------- */

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError('')

    const values = Object.fromEntries(new FormData(event.currentTarget))

    try {
      const definition = buildDefinition({
        values,
        key: itemKey,
        type,
        item,
        options,
        columns,
        controller,
      })

      const result = await command.run(
        item
          ? `${root}/items/${item.id}/schema`
          : `${root}/sections/${section.id}/items`,
        {
          definition,
          expectedStructureVersion: structureVersion,
          reopenAffected: values.reopen === 'on',
          ...(values.reopen === 'on' && {
            reason: String(values.reopenReason || ''),
          }),
        },
        item ? 'PATCH' : 'POST',
      )

      if (result) onClose()
    } catch {
      setLocalError('Check the field settings and try saving again.')
    }
  }

  /* Render ---------------------------------------------------------------- */

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${formId}-title`}
      onCancel={(event) => {
        event.preventDefault()
        if (!command.pending) onClose()
      }}
      className="fixed inset-0 m-auto h-[min(92dvh,900px)] max-h-[92dvh] w-[calc(100%-24px)] max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-sm open:flex sm:w-[calc(100%-48px)]"
    >
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-7 sm:py-5">
        <div className="min-w-0">
          <h2
            id={`${formId}-title`}
            className="text-xl font-semibold tracking-tight text-slate-950"
          >
            {title}
          </h2>
          <p className="mt-1 truncate text-sm text-slate-500">
            {section.title}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={command.pending}
          aria-label="Close question editor"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
        >
          <X size={19} aria-hidden="true" />
        </button>
      </header>

      <form
        id={formId}
        onSubmit={handleSubmit}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="space-y-6 px-5 py-6 sm:px-7">
          <Field id={`${formId}-label`} label="Question title" required>
            <input
              id={`${formId}-label`}
              name="label"
              required
              autoFocus
              maxLength={LIMITS.title}
              defaultValue={item?.label}
              placeholder="e.g. What is your business name?"
              className={ui.input}
            />
          </Field>

          <Field
            id={`${formId}-type`}
            label="Answer type"
            help="Choose how your client should answer this question."
          >
            <select
              id={`${formId}-type`}
              value={type}
              onChange={(event) => setType(event.target.value as FieldType)}
              className={ui.input}
            >
              {fieldTypes.map((fieldType) => (
                <option key={fieldType} value={fieldType}>
                  {formatFieldType(fieldType)}
                </option>
              ))}
            </select>
          </Field>

          <Field id={`${formId}-instructions`} label="Instructions" optional>
            <textarea
              id={`${formId}-instructions`}
              name="instructions"
              defaultValue={item?.instructions}
              rows={3}
              placeholder="Explain what information the client should provide..."
              className={`${ui.input} min-h-24 resize-y`}
            />
          </Field>

          <Field id={`${formId}-example`} label="Example answer" optional>
            <input
              id={`${formId}-example`}
              name="example"
              defaultValue={item?.example}
              placeholder="e.g. Ayaantrix Technologies"
              className={ui.input}
            />
          </Field>

          <CheckboxRow
            name="required"
            defaultChecked={item?.required ?? true}
            title="Required question"
            description="The client must answer this question before submitting."
            className={ui.panel}
          />

          {(type === 'SINGLE_SELECT' || type === 'MULTI_SELECT') && (
            <ChoicesField
              id={`${formId}-options`}
              value={options}
              onChange={setOptions}
            />
          )}

          {type === 'REPEATER' && (
            <RepeaterFields
              formId={formId}
              columns={columns}
              setColumns={setColumns}
            />
          )}

          {item && collectedDependents.length > 0 && (
            <AffectedItemsNotice fields={collectedDependents} />
          )}

          <AdvancedSettings
            formId={formId}
            type={type}
            item={item}
            availableControllers={availableControllers}
            selectedController={selectedController}
            controller={controller}
            onControllerChange={setController}
            reopen={reopen}
            onReopenChange={setReopen}
          />

          <ErrorNotice error={localError || command.error} />

          {command.error && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                If the project structure changed elsewhere, refresh the latest
                version before trying again. Your current form input remains in
                this editor.
              </p>

              <button
                type="button"
                className={buttonVariants.secondary}
                onClick={() => void latest.refetch()}
              >
                Refresh latest structure
              </button>
            </div>
          )}
        </div>
      </form>

      <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-7">
        <button
          type="button"
          className={buttonVariants.secondary}
          disabled={command.pending}
          onClick={onClose}
        >
          Cancel
        </button>

        <button
          type="submit"
          form={formId}
          className={buttonVariants.primary}
          disabled={command.pending}
        >
          {command.pending ? 'Saving…' : item ? 'Save changes' : 'Add question'}
        </button>
      </footer>
    </dialog>
  )
}

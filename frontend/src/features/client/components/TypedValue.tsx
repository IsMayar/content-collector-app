import { UploadQueue } from '@/features/client/components/UploadQueue'
import type {
  AnswerValue,
  ClientItem,
} from '@/features/client/types/client.types'
import { Field } from '@/shared/components/ProductUI'
import { useRef } from 'react'
import { List, ListOrdered } from 'lucide-react'

type TypedValueProps = {
  item: Pick<ClientItem, 'id' | 'label' | 'type' | 'validation' | 'assets'>
  value: AnswerValue
  onChange: (value: AnswerValue) => void
  disabled: boolean
  root: string
  preview?: boolean
  liveUploads?: boolean
  uploadsUnavailable?: boolean
  compact?: boolean
  currentValue?: () => AnswerValue
  onFilesChanged?: () => void
  beforeDelete?: () => Promise<boolean>
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-600'

export function TypedValue({
  item,
  value,
  onChange,
  disabled,
  root,
  preview = false,
  liveUploads = false,
  uploadsUnavailable = false,
  compact = false,
  currentValue,
  onFilesChanged,
  beforeDelete,
}: TypedValueProps) {
  const textRef = useRef<HTMLTextAreaElement>(null)
  const data = value as unknown as Record<string, unknown>
  const rules = item.validation

  if (
    item.type === 'SHORT_TEXT' ||
    item.type === 'LONG_TEXT' ||
    item.type === 'URL'
  ) {
    const text =
      item.type === 'URL' ? String(data.url || '') : String(data.text || '')

    const maxLength =
      rules.maxLength || (item.type === 'SHORT_TEXT' ? 200 : 10000)

    const control =
      item.type === 'LONG_TEXT' ? (
        <div className={compact ? 'client-long-answer' : undefined}>
          {compact && !disabled && (
            <div className="client-text-tools" role="group" aria-label="Plain text list tools">
              <span>Text</span>
              {([['Bulleted list', '• ', List], ['Numbered list', '1. ', ListOrdered]] as const).map(([label, prefix, Icon]) => (
                <button
                  key={label}
                  type="button"
                  title={label}
                  aria-label={label}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    const el = textRef.current
                    if (!el) return
                    const start = el.selectionStart
                    const end = el.selectionEnd
                    const selected = text.slice(start, end)
                    const insert = selected
                      ? selected.split('\n').map((line, index) =>
                          (prefix === '1. ' ? `${index + 1}. ` : prefix) + line
                        ).join('\n')
                      : (start > 0 && text[start - 1] !== '\n' ? '\n' : '') + prefix
                    const next = text.slice(0, start) + insert + text.slice(end)
                    if (next.length > maxLength) return
                    onChange({ text: next })
                    requestAnimationFrame(() => {
                      el.focus()
                      el.setSelectionRange(start + insert.length, start + insert.length)
                    })
                  }}
                >
                  <Icon size={16} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        <textarea
          ref={textRef}
          aria-label={compact ? item.label : undefined}
          rows={4}
          value={text}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={compact ? 'Write your answer...' : undefined}
          onChange={(event) => onChange({ text: event.target.value })}
          className={`${inputClass} min-h-30 max-h-60 resize-y`}
        />
        </div>
      ) : (
        <input
          aria-label={compact ? item.label : undefined}
          type={
            item.type === 'URL'
              ? 'url'
              : rules.format === 'email'
                ? 'email'
                : 'text'
          }
          value={text}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={
            item.type === 'URL'
              ? 'https://example.com'
              : compact
                ? 'Enter your answer...'
                : undefined
          }
          onChange={(event) =>
            onChange(
              item.type === 'URL'
                ? { url: event.target.value }
                : { text: event.target.value },
            )
          }
          className={`${inputClass} min-h-11`}
        />
      )

    if (compact) {
      return (
        <div>
          {control}

          {item.type === 'URL' && (
            <p className="mt-1 text-xs text-slate-500">
              Use a valid HTTP or HTTPS link.
            </p>
          )}
        </div>
      )
    }

    return (
      <Field
        label="Your response"
        hint={
          item.type === 'URL'
            ? 'Use an HTTP or HTTPS link.'
            : `${text.length} / ${maxLength} characters`
        }
      >
        {control}
      </Field>
    )
  }

  if (item.type === 'SINGLE_SELECT') {
    const select = (
      <select
        aria-label={compact ? item.label : undefined}
        disabled={disabled}
        value={String(data.optionKey || '')}
        onChange={(event) => onChange({ optionKey: event.target.value })}
        className={`${inputClass} min-h-11`}
      >
        <option value="">Choose an option</option>
        {rules.options?.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    )

    return compact ? select : <Field label="Choose one">{select}</Field>
  }

  if (item.type === 'MULTI_SELECT') {
    const selected = (data.optionKeys as string[]) || []

    return (
      <fieldset
        disabled={disabled}
        aria-label={compact ? item.label : undefined}
        className="space-y-2"
      >
        <legend
          className={
            compact ? 'sr-only' : 'mb-2 text-sm font-medium text-slate-700'
          }
        >
          Choose all that apply
        </legend>

        {rules.options?.map((option) => (
          <label
            key={option.key}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 hover:bg-slate-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
          >
            <input
              type="checkbox"
              checked={selected.includes(option.key)}
              className="h-4 w-4 shrink-0 accent-blue-600"
              onChange={(event) =>
                onChange({
                  optionKeys: event.target.checked
                    ? [...selected, option.key]
                    : selected.filter((key) => key !== option.key),
                })
              }
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
    )
  }

  if (item.type === 'FILE' || item.type === 'IMAGE') {
    if (preview || uploadsUnavailable) {
      return (
        <div
          role="status"
          className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-[13px] leading-5 text-slate-600"
        >
          <p className="font-medium text-slate-800">
            {item.type === 'IMAGE' ? 'Image upload' : 'File upload'}
          </p>

          <p className="mt-1">
            {rules.minFiles || 0}–{rules.maxFiles || 1} files
            {' · '}
            {rules.allowedExtensions?.join(', ') || 'Supported file types'}
          </p>

          <p className="mt-2">
            {preview
              ? 'Uploads are unavailable in preview.'
              : 'Uploads are currently unavailable for this project. Contact your agency for help.'}
          </p>
        </div>
      )
    }

    return (
      <UploadQueue
        root={root}
        itemId={item.id}
        image={item.type === 'IMAGE'}
        live={liveUploads}
        allowedExtensions={
          liveUploads
            ? rules.allowedExtensions?.filter((extension) =>
                ['jpg', 'jpeg', 'png', 'pdf', 'docx', 'txt', 'svg'].includes(
                  extension,
                ),
              )
            : undefined
        }
        maxFiles={rules.maxFiles}
        onRefresh={onFilesChanged}
        beforeDelete={beforeDelete}
        onReady={
          currentValue
            ? (id) => {
                const latest = currentValue() as {
                  assetIds?: string[]
                }

                onChange({
                  assetIds: [...new Set([...(latest.assetIds || []), id])],
                })
              }
            : undefined
        }
        assets={item.assets}
        selected={(data.assetIds as string[]) || []}
        onChange={(assetIds) => onChange({ assetIds })}
        disabled={disabled}
      />
    )
  }

  if (item.type === 'REPEATER') {
    const rows = (value as Extract<AnswerValue, { rows: unknown }>).rows || []

    return (
      <div className="space-y-3">
        {rows.map((row, index) => (
          <fieldset
            key={row.rowId}
            disabled={disabled}
            className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/50 p-3 sm:p-4"
          >
            <legend className="px-1 text-[13px] font-semibold text-slate-800">
              Entry {index + 1}
            </legend>

            {rules.columns?.map((column) => {
              const cell = row.values[column.key]

              const update = (nextValue: typeof cell) =>
                onChange({
                  rows: rows.map((currentRow) =>
                    currentRow.rowId === row.rowId
                      ? {
                          ...currentRow,
                          values: {
                            ...currentRow.values,
                            [column.key]: nextValue,
                          },
                        }
                      : currentRow,
                  ),
                })

              if (column.type === 'IMAGE') {
                if (preview || uploadsUnavailable) {
                  return (
                    <p
                      key={column.key}
                      className="text-[13px] leading-5 text-slate-600"
                    >
                      {column.label}: uploads are{' '}
                      {preview
                        ? 'unavailable in preview.'
                        : 'currently unavailable for this project. Contact your agency for help.'}
                    </p>
                  )
                }

                return (
                  <div key={column.key} className="space-y-2">
                    <h3 className="text-[13px] font-semibold text-slate-800">
                      {column.label}
                    </h3>

                    <UploadQueue
                      root={root}
                      itemId={item.id}
                      image
                      live={liveUploads}
                      onRefresh={onFilesChanged}
                      beforeDelete={beforeDelete}
                      allowedExtensions={
                        liveUploads ? ['jpg', 'jpeg', 'png'] : undefined
                      }
                      onReady={
                        currentValue
                          ? (id) => {
                              const latest = currentValue() as Extract<
                                AnswerValue,
                                { rows: unknown }
                              >

                              onChange({
                                rows: (latest.rows || []).map((currentRow) =>
                                  currentRow.rowId === row.rowId
                                    ? {
                                        ...currentRow,
                                        values: {
                                          ...currentRow.values,
                                          [column.key]: [
                                            ...new Set([
                                              ...(Array.isArray(
                                                currentRow.values[column.key],
                                              )
                                                ? (currentRow.values[
                                                    column.key
                                                  ] as string[])
                                                : []),
                                              id,
                                            ]),
                                          ],
                                        },
                                      }
                                    : currentRow,
                                ),
                              })
                            }
                          : undefined
                      }
                      assets={item.assets}
                      selected={Array.isArray(cell) ? cell : []}
                      onChange={update}
                      disabled={disabled}
                    />
                  </div>
                )
              }

              return (
                <div key={column.key} className="space-y-1.5">
                  <Field
                    label={`${column.label}${column.required ? ' *' : ''}`}
                  >
                    {column.type === 'SINGLE_SELECT' ? (
                      <select
                        disabled={disabled}
                        value={String(cell || '')}
                        onChange={(event) => update(event.target.value)}
                        className={`${inputClass} min-h-11`}
                      >
                        <option value="">Choose</option>

                        {column.options?.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : column.type === 'LONG_TEXT' ? (
                      <textarea
                        rows={4}
                        disabled={disabled}
                        value={String(cell || '')}
                        maxLength={10000}
                        onChange={(event) => update(event.target.value)}
                        className={`${inputClass} min-h-28 max-h-60 resize-y`}
                      />
                    ) : (
                      <input
                        disabled={disabled}
                        type={
                          column.type === 'NUMBER'
                            ? 'number'
                            : column.type === 'URL'
                              ? 'url'
                              : 'text'
                        }
                        value={String(cell ?? '')}
                        onChange={(event) =>
                          update(
                            column.type === 'NUMBER' &&
                              event.target.value !== ''
                              ? Number(event.target.value)
                              : event.target.value,
                          )
                        }
                        className={`${inputClass} min-h-11`}
                      />
                    )}
                  </Field>
                </div>
              )
            })}

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                disabled={disabled || !index}
                onClick={() => {
                  const next = [...rows]

                  ;[next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ]

                  onChange({ rows: next })
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Move up
              </button>

              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    rows: rows.filter(
                      (currentRow) => currentRow.rowId !== row.rowId,
                    ),
                  })
                }
                className="rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Remove entry
              </button>
            </div>
          </fieldset>
        ))}

        <button
          type="button"
          disabled={disabled || rows.length >= (rules.maxRows || 20)}
          onClick={() =>
            onChange({
              rows: [
                ...rows,
                {
                  rowId: crypto.randomUUID(),
                  values: Object.fromEntries(
                    (rules.columns || []).map((column) => [
                      column.key,
                      column.type === 'IMAGE' ? [] : '',
                    ]),
                  ),
                },
              ],
            })
          }
          className="inline-flex min-h-10 items-center rounded-lg border border-blue-200 bg-blue-50 px-3.5 text-[13px] font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add entry ({rows.length}/{rules.maxRows || 20})
        </button>
      </div>
    )
  }

  return null
}

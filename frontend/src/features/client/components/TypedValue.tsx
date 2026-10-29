import { UploadQueue } from '@/features/client/components/UploadQueue'
import type {
  AnswerValue,
  ClientItem,
} from '@/features/client/types/client.types'
import { Field } from '@/shared/components/ProductUI'
export function TypedValue({
  item,
  value,
  onChange,
  disabled,
  root,
}: {
  item: Pick<ClientItem, 'id' | 'label' | 'type' | 'validation' | 'assets'>
  value: AnswerValue
  onChange: (v: AnswerValue) => void
  disabled: boolean
  root: string
}) {
  const data = value as unknown as Record<string, unknown>
  const rules = item.validation
  if (
    item.type === 'SHORT_TEXT' ||
    item.type === 'LONG_TEXT' ||
    item.type === 'URL'
  )
    return (
      <Field
        label="Your response"
        hint={
          item.type === 'URL'
            ? 'Use an HTTP or HTTPS link.'
            : `${String(data.text || '').length} / ${rules.maxLength || (item.type === 'SHORT_TEXT' ? 200 : 10000)} characters`
        }
      >
        {item.type === 'LONG_TEXT' ? (
          <textarea
            rows={9}
            value={String(data.text || '')}
            disabled={disabled}
            maxLength={rules.maxLength || 10000}
            onChange={(e) => onChange({ text: e.target.value })}
          />
        ) : (
          <input
            type={
              item.type === 'URL'
                ? 'url'
                : rules.format === 'email'
                  ? 'email'
                  : 'text'
            }
            value={String(data.text || data.url || '')}
            disabled={disabled}
            maxLength={rules.maxLength || 200}
            onChange={(e) =>
              onChange(
                item.type === 'URL'
                  ? { url: e.target.value }
                  : { text: e.target.value },
              )
            }
          />
        )}
      </Field>
    )
  if (item.type === 'SINGLE_SELECT')
    return (
      <Field label="Choose one">
        <select
          disabled={disabled}
          value={String(data.optionKey || '')}
          onChange={(e) => onChange({ optionKey: e.target.value })}
        >
          <option value="">Choose an option</option>
          {rules.options?.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    )
  if (item.type === 'MULTI_SELECT')
    return (
      <fieldset className="option-list" disabled={disabled}>
        <legend>Choose all that apply</legend>
        {rules.options?.map((o) => (
          <label key={o.key} className="check-row">
            <input
              type="checkbox"
              checked={((data.optionKeys as string[]) || []).includes(o.key)}
              onChange={(e) =>
                onChange({
                  optionKeys: e.target.checked
                    ? [...((data.optionKeys as string[]) || []), o.key]
                    : ((data.optionKeys as string[]) || []).filter(
                        (k) => k !== o.key,
                      ),
                })
              }
            />
            {o.label}
          </label>
        ))}
      </fieldset>
    )
  if (item.type === 'FILE' || item.type === 'IMAGE')
    return (
      <UploadQueue
        root={root}
        itemId={item.id}
        image={item.type === 'IMAGE'}
        assets={item.assets}
        selected={(data.assetIds as string[]) || []}
        onChange={(assetIds) => onChange({ assetIds })}
        disabled={disabled}
      />
    )
  if (item.type === 'REPEATER') {
    const rows = (value as Extract<AnswerValue, { rows: unknown }>).rows || []
    return (
      <div className="repeater">
        {rows.map((row, index) => (
          <fieldset key={row.rowId} disabled={disabled}>
            <legend>Entry {index + 1}</legend>
            {rules.columns?.map((column) => {
              const cell = row.values[column.key]
              const update = (v: typeof cell) =>
                onChange({
                  rows: rows.map((r) =>
                    r.rowId === row.rowId
                      ? { ...r, values: { ...r.values, [column.key]: v } }
                      : r,
                  ),
                })
              if (column.type === 'IMAGE')
                return (
                  <div key={column.key}>
                    <h3>{column.label}</h3>
                    <UploadQueue
                      root={root}
                      itemId={item.id}
                      image
                      assets={item.assets}
                      selected={Array.isArray(cell) ? cell : []}
                      onChange={update}
                      disabled={disabled}
                    />
                  </div>
                )
              return (
                <Field
                  key={column.key}
                  label={`${column.label}${column.required ? ' *' : ''}`}
                >
                  {column.type === 'SINGLE_SELECT' ? (
                    <select
                      value={String(cell || '')}
                      onChange={(e) => update(e.target.value)}
                    >
                      <option value="">Choose</option>
                      {column.options?.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : column.type === 'LONG_TEXT' ? (
                    <textarea
                      value={String(cell || '')}
                      maxLength={10000}
                      onChange={(e) => update(e.target.value)}
                    />
                  ) : (
                    <input
                      type={
                        column.type === 'NUMBER'
                          ? 'number'
                          : column.type === 'URL'
                            ? 'url'
                            : 'text'
                      }
                      value={String(cell ?? '')}
                      onChange={(e) =>
                        update(
                          column.type === 'NUMBER' && e.target.value !== ''
                            ? Number(e.target.value)
                            : e.target.value,
                        )
                      }
                    />
                  )}
                </Field>
              )
            })}
            <div className="actions">
              <button
                type="button"
                className="secondary-button"
                disabled={!index}
                onClick={() => {
                  const next = [...rows]
                  ;[next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ]
                  onChange({ rows: next })
                }}
              >
                Move up
              </button>
              <button
                type="button"
                className="danger-link"
                onClick={() =>
                  onChange({ rows: rows.filter((r) => r.rowId !== row.rowId) })
                }
              >
                Remove entry
              </button>
            </div>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={disabled || rows.length >= (rules.maxRows || 20)}
          className="secondary-button"
          onClick={() =>
            onChange({
              rows: [
                ...rows,
                {
                  rowId: crypto.randomUUID(),
                  values: Object.fromEntries(
                    (rules.columns || []).map((c) => [
                      c.key,
                      c.type === 'IMAGE' ? [] : '',
                    ]),
                  ),
                },
              ],
            })
          }
        >
          ＋ Add entry ({rows.length}/{rules.maxRows || 20})
        </button>
      </div>
    )
  }
  return null
}

type Schema = {
  type: string
  validation?: {
    options?: { key: string; label: string }[]
    columns?: {
      key: string
      label: string
      type: string
      options?: { key: string; label: string }[]
    }[]
  }
}
export function SubmittedAnswer({
  schema,
  value,
}: {
  schema: Schema
  value: unknown
}) {
  const answer =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  function cell(v: unknown, options?: { key: string; label: string }[]) {
    if (Array.isArray(v))
      return `${v.length} attached image${v.length === 1 ? '' : 's'}`
    if (typeof v === 'string' || typeof v === 'number')
      return options?.find((o) => o.key === v)?.label || String(v)
    return 'No answer'
  }
  if (schema.type === 'REPEATER') {
    const rows = Array.isArray(answer.rows)
      ? (answer.rows as { rowId: string; values: Record<string, unknown> }[])
      : []
    return (
      <div className="table-scroll">
        <table>
          <caption>Submitted entries</caption>
          <thead>
            <tr>
              {schema.validation?.columns?.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rowId}>
                {schema.validation?.columns?.map((c) => (
                  <td key={c.key}>{cell(row.values[c.key], c.options)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  if (schema.type === 'FILE' || schema.type === 'IMAGE')
    return (
      <p>
        {Array.isArray(answer.assetIds) ? answer.assetIds.length : 0} submitted
        files
      </p>
    )
  if (schema.type === 'MULTI_SELECT')
    return (
      <ul>
        {Array.isArray(answer.optionKeys) &&
          answer.optionKeys.map((k) => (
            <li key={String(k)}>{cell(k, schema.validation?.options)}</li>
          ))}
      </ul>
    )
  return (
    <p className="submission-value">
      {cell(
        answer.text ?? answer.url ?? answer.optionKey,
        schema.validation?.options,
      )}
    </p>
  )
}

import type { AnswerValue } from '@/features/client/types/client.types'
import type { AssetSummary } from '@/features/projects/types/file.types'
import type { Progress } from '@/features/projects/types/project.types'
import type {
  FieldValidation,
  ItemDefinition,
  Section,
} from '@/features/structure-editor/types/structure.types'

export function visibleItems(
  sections: Section[],
  answers: Record<string, { value: AnswerValue | Record<string, never> }>,
) {
  return sections.flatMap((section) =>
    section.enabled
      ? section.items.filter(
          (item) =>
            item.enabled !== false &&
            (!item.visibleWhen ||
              section.items.some(
                (dependency) =>
                  dependency.key === item.visibleWhen?.dependsOnItemKey &&
                  'optionKey' in (answers[dependency.id]?.value || {}) &&
                  (answers[dependency.id].value as { optionKey: string })
                    .optionKey === item.visibleWhen?.optionKey,
              )),
        )
      : [],
  )
}
export function progressFor(
  sections: Section[],
  answers: Record<string, { value: AnswerValue | Record<string, never> }>,
): Progress {
  const visible = visibleItems(sections, answers)
  const required = visible.filter((item) => item.required)
  return {
    requiredTotal: required.length,
    submittedRequired: required.filter((i) =>
      ['SUBMITTED', 'APPROVED'].includes(i.state),
    ).length,
    approvedRequired: required.filter((i) => i.state === 'APPROVED').length,
    clientActionRequired: required.filter(
      (i) => !['SUBMITTED', 'APPROVED'].includes(i.state),
    ).length,
    optionalApproved: visible.filter(
      (i) => !i.required && i.state === 'APPROVED',
    ).length,
  }
}
export function validateAnswer(
  item: ItemDefinition,
  value: AnswerValue | Record<string, never>,
  assets: AssetSummary[] = [],
): string[] {
  const rules: FieldValidation = item.validation || {}
  const messages: string[] = []
  const data = value as Record<string, unknown>
  const text = String(data.text ?? data.url ?? '')
  if (['SHORT_TEXT', 'LONG_TEXT', 'URL'].includes(item.type)) {
    if (item.required && !text.trim()) messages.push('This answer is required.')
    if (text && text.length < (rules.minLength || 0))
      messages.push(`Use at least ${rules.minLength} characters.`)
    if (
      text.length >
      (rules.maxLength || (item.type === 'SHORT_TEXT' ? 200 : 10000))
    )
      messages.push('This answer is too long.')
    if (text && item.type === 'URL') {
      try {
        if (!['http:', 'https:'].includes(new URL(text).protocol))
          messages.push('Use an HTTP or HTTPS URL.')
      } catch {
        messages.push('Enter a valid URL.')
      }
    }
    if (
      text &&
      rules.format === 'email' &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
    )
      messages.push('Enter a valid email.')
  }
  if (item.type === 'SINGLE_SELECT' && (item.required || data.optionKey)) {
    if (!rules.options?.some((option) => option.key === data.optionKey))
      messages.push('Choose an available option.')
  }
  if (item.type === 'MULTI_SELECT') {
    const selected = Array.isArray(data.optionKeys) ? data.optionKeys : []
    if (
      selected.length < (rules.minOptions ?? (item.required ? 1 : 0)) ||
      selected.length > (rules.maxOptions ?? 100) ||
      new Set(selected).size !== selected.length ||
      selected.some(
        (key) => !rules.options?.some((option) => option.key === key),
      )
    )
      messages.push('Choose the permitted number of available options.')
  }
  if (['IMAGE', 'FILE'].includes(item.type)) {
    const ids = Array.isArray(data.assetIds) ? (data.assetIds as string[]) : []
    if (
      ids.length < (rules.minFiles ?? (item.required ? 1 : 0)) ||
      ids.length > (rules.maxFiles ?? 50)
    )
      messages.push('Check the required number of files.')
    if (
      ids.some(
        (id) =>
          !assets.some((asset) => asset.id === id && asset.state === 'READY'),
      )
    )
      messages.push('Wait until all selected files are ready.')
  }
  if (item.type === 'REPEATER') {
    const rows = Array.isArray(data.rows)
      ? (data.rows as { values: Record<string, unknown> }[])
      : []
    if (item.required && !rows.length) messages.push('Add at least one row.')
    if (rows.length > (rules.maxRows ?? 20)) messages.push('Too many rows.')
    for (const row of rows)
      for (const column of rules.columns || []) {
        const cell = row.values[column.key]
        if (
          column.required &&
          (cell === '' || cell == null || (Array.isArray(cell) && !cell.length))
        )
          messages.push(`${column.label} is required in every row.`)
        if (
          column.type === 'NUMBER' &&
          cell !== '' &&
          !Number.isFinite(Number(cell))
        )
          messages.push(`${column.label} must be a finite number.`)
        if (
          column.type === 'SINGLE_SELECT' &&
          cell &&
          !column.options?.some((option) => option.key === cell)
        )
          messages.push(`${column.label} must use an available option.`)
        if (column.type === 'URL' && cell) {
          try {
            if (!['http:', 'https:'].includes(new URL(String(cell)).protocol))
              messages.push(`${column.label} needs an HTTP or HTTPS URL.`)
          } catch {
            messages.push(`${column.label} needs a valid URL.`)
          }
        }
        if (
          column.type === 'IMAGE' &&
          Array.isArray(cell) &&
          cell.some(
            (id) =>
              !assets.some(
                (asset) => asset.id === id && asset.state === 'READY',
              ),
          )
        )
          messages.push(`${column.label} contains a file that is not ready.`)
      }
  }
  return [...new Set(messages)]
}
export function initialValue(type: ItemDefinition['type']): AnswerValue {
  if (type === 'SINGLE_SELECT') return { optionKey: '' }
  if (type === 'MULTI_SELECT') return { optionKeys: [] }
  if (type === 'REPEATER') return { rows: [] }
  if (['FILE', 'IMAGE'].includes(type)) return { assetIds: [] }
  if (type === 'URL') return { url: '' }
  return { text: '' }
}
export function percent(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0
}
export function formatBytes(bytes: number) {
  return bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1)} GB`
    : bytes >= 1e6
      ? `${(bytes / 1e6).toFixed(1)} MB`
      : `${Math.ceil(bytes / 1024)} KB`
}

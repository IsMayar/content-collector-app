import { useTemplateAnalyticsQuery } from '../api/analyticsApi'
import { Panel, QueryState } from '@/shared/components/ProductUI'
import { FrictionTable } from './FrictionTable'
export function TemplateFrictionPanel({
  workspaceId,
}: {
  workspaceId: string
}) {
  const q = useTemplateAnalyticsQuery(workspaceId)
  const groups = new Map<string, NonNullable<typeof q.data>>()
  for (const m of q.data || []) {
    const key = `${m.templateVersionId}/${m.projectType}`
    groups.set(key, [...(groups.get(key) || []), m])
  }
  return (
    <Panel title="Template friction insights">
      <p>
        Separate template versions, item keys and project types. Test projects
        and agency preview are excluded. Counts cover starts in the last 90
        days; open windows remain pending observation.
      </p>
      <QueryState query={q}>
        {[...groups.entries()].map(([key, rows]) => (
          <section key={key}>
            <h3>
              {rows[0].templateTitle} ·{' '}
              {rows[0].projectType.replaceAll('_', ' ')}
            </h3>
            <p className="subtle">
              Template version {rows[0].templateVersionId}
            </p>
            <FrictionTable rows={rows} />
          </section>
        ))}
        {q.data?.length === 0 && (
          <p className="insights-template-empty">
            No eligible template observations yet.
          </p>
        )}
      </QueryState>
    </Panel>
  )
}

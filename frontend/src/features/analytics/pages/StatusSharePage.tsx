import { apiBaseUrl } from '@/services/api/baseQuery'
import {
  Badge,
  ErrorNotice,
  Heading,
  Panel,
} from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useState } from 'react'
import { useParams } from 'react-router'

export function StatusSharePage() {
  const { shareId } = useParams()
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('token') || '',
  )
  const [readToken, setReadToken] = useState('')
  const [error, setError] = useState('')
  const [data, setData] = useState<{
    alias: string
    state: string
    progress: import('@/features/projects/types/project.types').Progress
  }>()
  const command = useCommand(true)
  return (
    <div className="narrow-product">
      <Heading
        eyebrow="COUNTS-ONLY PROJECT STATUS"
        title={data?.alias || 'A shared view of progress'}
        description="A small window into how the project is moving."
      />
      {!readToken ? (
        <button
          className="primary-button"
          onClick={async () => {
            const result = await command.run<{ readToken: string }>(
              `status-shares/${shareId}/exchange`,
              { token },
            )
            if (result) {
              history.replaceState(null, '', window.location.pathname)
              setReadToken(result.readToken)
              try {
                const base = new URL(
                  apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`,
                  window.location.origin,
                )
                const response = await fetch(
                  new URL(`status-shares/${shareId}/counts`, base),
                  {
                    headers: { 'X-Status-Token': result.readToken },
                    cache: 'no-store',
                  },
                )
                if (!response.ok) throw Error('This share is unavailable.')
                setData(await response.json())
              } catch (e) {
                setError(String(e))
              }
            }
          }}
        >
          View shared status
        </button>
      ) : null}
      <ErrorNotice error={command.error || error} />
      {data && (
        <Panel>
          <Badge>{data.state}</Badge>
          <div className="dual-progress">
            {[
              ['Submitted', data.progress.submittedRequired],
              ['Approved', data.progress.approvedRequired],
            ].map(([label, count]) => (
              <div key={label}>
                <strong>
                  {label}: {count}/{data.progress.requiredTotal}
                </strong>
                <progress
                  value={Number(count)}
                  max={data.progress.requiredTotal || 1}
                  aria-label={String(label)}
                />
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

import {
  useExchangeStatusMutation,
  useLazyStatusCountsQuery,
  statusApi,
} from '../api/statusApi'
import { useAppDispatch } from '@/shared/hooks/useAppStore'
import { Heading, Panel } from '@/shared/components/ProductUI'
import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router'
export function captureStatusFragment(sourceHash = window.location.hash) {
  const token = new URLSearchParams(sourceHash.slice(1)).get('token') || ''
  if (window.location.hash)
    history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search,
    )
  return token
}
export function StatusSharePage() {
  const { shareId = '' } = useParams()
  const location = useLocation()
  const [capability] = useState(() => captureStatusFragment(location.hash))
  const [readToken, setReadToken] = useState('')
  const [data, setData] =
    useState<
      import('zod').infer<typeof import('../api/statusApi').statusCounts>
    >()
  const [message, setMessage] = useState('')
  const [exchange, exchangeState] = useExchangeStatusMutation()
  const [counts, countsState] = useLazyStatusCountsQuery()
  const dispatch = useAppDispatch()
  useEffect(
    () => () => {
      dispatch(statusApi.util.resetApiState())
    },
    [dispatch],
  )
  async function open() {
    setData(undefined)
    setMessage('')
    try {
      let token = readToken
      if (!token) {
        const result = await exchange({ shareId, token: capability }).unwrap()
        token = result.readToken
        setReadToken(token)
        exchangeState.reset()
      }
      setData(await counts({ shareId, readToken: token }, false).unwrap())
    } catch {
      setReadToken('')
      setMessage(
        'This status link is unavailable, revoked or expired. Request a new link from its owner.',
      )
    }
  }
  return (
    <div className="narrow-product">
      <Heading
        eyebrow="COUNTS-ONLY PROJECT STATUS"
        title={data?.alias || 'Shared project progress'}
        description="Read-only aggregate counts. No private project content."
      />
      <button
        className="primary-button"
        disabled={exchangeState.isLoading || countsState.isFetching || !shareId}
        onClick={() => void open()}
      >
        {readToken ? 'Refresh counts' : 'View shared status'}
      </button>
      {message && <p role="alert">{message}</p>}
      {data && (
        <Panel>
          <div className="report-metrics">
            {[
              ['Required', data.requiredTotal],
              ['Submitted', data.submitted],
              ['Approved', data.approved],
            ].map(([label, value]) => (
              <article key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          <p>
            Updated{' '}
            <time dateTime={data.updatedAt}>
              {new Date(data.updatedAt).toLocaleString()}
            </time>
          </p>
        </Panel>
      )}
    </div>
  )
}

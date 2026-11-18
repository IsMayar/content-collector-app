import {
  useExchangeStatusMutation,
  useLazyStatusCountsQuery,
  statusApi,
} from '../api/statusApi'
import { useAppDispatch } from '@/shared/hooks/useAppStore'
import { BarChart3, LockKeyhole, RefreshCw } from 'lucide-react'
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
    <section className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <BarChart3 size={23} aria-hidden="true" />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.1em] text-blue-700">
          Shared project status
        </p>
        <h1 className="mt-2 text-[27px] font-bold tracking-tight text-[#0A1A2F] sm:text-[32px]">
          {data?.alias || 'Project progress'}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
          View a read-only summary of required, submitted, and approved content.
          No private project answers or files are shared here.
        </p>

        <button
          type="button"
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          disabled={
            exchangeState.isLoading || countsState.isFetching || !shareId
          }
          onClick={() => void open()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {exchangeState.isLoading || countsState.isFetching
            ? 'Loading progress…'
            : readToken
              ? 'Refresh counts'
              : 'View shared status'}
        </button>

        {message && (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
          >
            {message}
          </div>
        )}

        {data && (
          <div className="mt-7 border-t border-slate-200 pt-6">
            <h2 className="text-sm font-semibold text-slate-900">
              Content overview
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ['Required', data.requiredTotal],
                ['Submitted', data.submitted],
                ['Approved', data.approved],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <p className="text-xs font-medium text-slate-500">{label}</p>
                  <p className="mt-2 text-[28px] font-bold tabular-nums text-[#0A1A2F]">
                    {value}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-5 flex items-center gap-2 text-xs text-slate-500">
              <LockKeyhole size={14} aria-hidden="true" />
              Updated{' '}
              <time dateTime={data.updatedAt}>
                {new Date(data.updatedAt).toLocaleString()}
              </time>
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

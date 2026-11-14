import {
  billingDestination,
  useBillingSubscriptionQuery,
  useBillingUsageQuery,
} from '@/features/billing/api/billingApi'
import { SubscriptionNotice } from '@/features/billing/components/SubscriptionNotice'
import { Notice } from '@/shared/components/Feedback'
import {
  Badge,
  Empty,
  ErrorNotice,
  Heading,
} from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import { formatBytes, percent } from '@/shared/utils/domain'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useRef, useState } from 'react'
import { env } from '@/config/env'
import { errorMessage } from '@/shared/utils/apiError'
import {
  ArrowRight,
  Check,
  ChevronRight,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'

export function BillingPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const checkoutKeys = useRef<Record<string, string>>({})
  const [redirectError, setRedirectError] = useState('')

  function hosted(url: string) {
    const target = billingDestination(
      url,
      window.location.origin,
      env.mocksEnabled,
    )
    if (!target) {
      setRedirectError(
        'The service returned an invalid billing destination. Please contact support.',
      )
      return
    }
    if (target.origin === window.location.origin)
      navigate(target.pathname + target.search)
    else window.location.assign(target.href)
  }

  const { id, owner, base } = useWorkspace()
  const [params] = useSearchParams()
  const requestedView = params.get('view') || 'billing'
  const view = ['billing', 'usage', 'status'].includes(requestedView)
    ? requestedView
    : 'billing'
  const q = useBillingSubscriptionQuery(id, {
    skip: !owner,
    pollingInterval: view === 'status' ? 10000 : undefined,
  })
  const usage = useBillingUsageQuery(id, {
    skip: !owner || (!embedded && view !== 'usage'),
  })
  const command = useCommand()

  if (!owner)
    return (
      <Empty
        title="Owner access required"
        description="Billing is managed by your workspace owner."
      />
    )

  return (
    <>
      {!embedded && (
        <Heading
          title={
            view === 'usage'
              ? 'Usage'
              : view === 'status'
                ? 'Subscription status'
                : 'Billing'
          }
          description="Clear limits. A plan that fits how you work."
        />
      )}

      <div className="min-w-0 space-y-7 text-slate-900">
        <SubscriptionNotice subscription={q.data} />
        {q.isLoading && (
          <p role="status" className="text-sm text-slate-500">
            Loading subscription details…
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">
              Billing & usage
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Your subscription, allowances, and account usage in one place.
            </p>
          </div>
          <Link
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
            to="?view=status"
          >
            View subscription status{' '}
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>

        {view === 'status' && (
          <section
            className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
            aria-label="Latest subscription status"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-slate-900">
                  Latest status
                </h3>
                <Badge>
                  {q.data?.state || (q.isError ? 'UNAVAILABLE' : 'LOADING')}
                </Badge>
                <p className="max-w-xl text-sm leading-6 text-slate-500">
                  This status comes from the server. Hosted payment confirmation
                  may take a moment.
                </p>
              </div>
              <button
                type="button"
                className="secondary-button inline-flex items-center gap-2"
                onClick={() => void q.refetch()}
              >
                <RefreshCw size={15} aria-hidden="true" /> Refresh status
              </button>
            </div>
          </section>
        )}

        {params.get('hosted') === 'demo' && (
          <Notice>
            Mock hosted billing return. No payment was collected and no
            subscription was changed.
          </Notice>
        )}

        {(embedded || view !== 'usage') && (
          <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <section
              className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
              aria-labelledby="billing-current-plan"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3
                  id="billing-current-plan"
                  className="text-sm font-semibold text-slate-700"
                >
                  Current plan
                </h3>
                <Badge>Proposed pilot pricing</Badge>
              </div>
              <div className="mt-5 flex flex-wrap items-end gap-x-5 gap-y-2">
                <p className="text-2xl font-semibold tracking-tight text-slate-950">
                  {q.data
                    ? q.data.planKey === 'SOLO'
                      ? 'Solo'
                      : 'Agency'
                    : 'Loading plan…'}
                </p>
                <p className="text-3xl font-semibold tracking-tight text-slate-950">
                  {q.data ? `$${q.data.planKey === 'SOLO' ? '19' : '49'}` : '—'}
                  <span className="ml-1 text-sm font-normal text-slate-500">
                    / month
                  </span>
                </p>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                For{' '}
                {q.data?.planKey === 'SOLO'
                  ? 'freelancers and solo creators'
                  : 'small agencies and growing teams'}
                .
              </p>
              <ul className="my-5 space-y-2.5 border-t border-slate-100 pt-5 text-sm text-slate-700">
                {usage.data && (
                  <>
                    <li className="flex items-start gap-2">
                      <Check
                        size={16}
                        className="mt-0.5 shrink-0 text-slate-500"
                        aria-hidden="true"
                      />
                      {usage.data.seatsLimit} seats
                    </li>
                    <li className="flex items-start gap-2">
                      <Check
                        size={16}
                        className="mt-0.5 shrink-0 text-slate-500"
                        aria-hidden="true"
                      />
                      {formatBytes(usage.data.storageLimitBytes)} storage
                    </li>
                    <li className="flex items-start gap-2">
                      <Check
                        size={16}
                        className="mt-0.5 shrink-0 text-slate-500"
                        aria-hidden="true"
                      />
                      {usage.data.aiDraftAllowance} AI drafts per allowance
                      period
                    </li>
                    <li className="flex items-start gap-2">
                      <Check
                        size={16}
                        className="mt-0.5 shrink-0 text-slate-500"
                        aria-hidden="true"
                      />
                      {usage.data.smsSegmentAllowance} SMS segments per
                      allowance period
                    </li>
                  </>
                )}
                <li className="flex items-start gap-2">
                  <Check
                    size={16}
                    className="mt-0.5 shrink-0 text-slate-500"
                    aria-hidden="true"
                  />
                  Unlimited active projects within resource limits
                </li>
              </ul>
              <div className="mt-auto pt-1">
                <Link
                  className="secondary-button inline-flex items-center gap-2"
                  to="/pricing"
                >
                  View pricing <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
            </section>

            <section
              className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
              aria-labelledby="billing-plan-details"
            >
              <h3
                id="billing-plan-details"
                className="text-sm font-semibold text-slate-700"
              >
                Plan details
              </h3>
              {q.data && (
                <div className="mt-5 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <span className="text-base font-semibold text-slate-900">
                      {q.data.planKey}
                    </span>
                    <Badge>{q.data.state}</Badge>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      {q.data.state === 'TRIALING'
                        ? 'Trial ends'
                        : 'Current period ends'}
                    </p>
                    <p className="mt-1.5 text-sm font-medium text-slate-900">
                      {new Date(q.data.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  </div>
                  <p className="text-sm leading-6 text-slate-500">
                    14-day trial. A past-due account has 7 days of grace,
                    followed by 30 days of read-only access. Reading and
                    permitted exports remain available.
                  </p>
                </div>
              )}
              <div className="mt-auto pt-6">
                <button
                  type="button"
                  className="secondary-button inline-flex items-center gap-2"
                  disabled={command.pending}
                  onClick={async () => {
                    const result = await command.run<{ url: string }>(
                      `workspaces/${id}/billing/portal`,
                      {},
                    )
                    if (result) hosted(result.url)
                  }}
                >
                  Manage in hosted billing portal{' '}
                  <ExternalLink size={15} aria-hidden="true" />
                </button>
              </div>
            </section>
          </div>
        )}

        {(embedded || view === 'usage') && (
          <section
            className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
            aria-labelledby="billing-resource-usage"
          >
            <div className="mb-5">
              <h3
                id="billing-resource-usage"
                className="text-base font-semibold tracking-tight text-slate-900"
              >
                Resource usage
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Monitor consumption against your plan allowances.
              </p>
            </div>
            {usage.isLoading && (
              <p role="status" className="text-sm text-slate-500">
                Loading current usage…
              </p>
            )}
            <ErrorNotice error={usage.error ? errorMessage(usage.error) : ''} />
            {usage.data && (
              <div className="grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2">
                {[
                  [
                    'Storage',
                    usage.data.storageUsedBytes +
                      usage.data.storageReservedBytes,
                    usage.data.storageLimitBytes,
                    `${formatBytes(usage.data.storageUsedBytes)} used + ${formatBytes(usage.data.storageReservedBytes)} reserved`,
                  ],
                  [
                    'AI drafts',
                    usage.data.aiDraftsUsed + usage.data.aiDraftsReserved,
                    usage.data.aiDraftAllowance,
                    `${usage.data.aiDraftsUsed} used + ${usage.data.aiDraftsReserved} reserved`,
                  ],
                  [
                    'SMS segments',
                    usage.data.smsSegmentsUsed + usage.data.smsSegmentsReserved,
                    usage.data.smsSegmentAllowance,
                    `${usage.data.smsSegmentsUsed} used + ${usage.data.smsSegmentsReserved} reserved`,
                  ],
                  [
                    'Seats',
                    usage.data.seatsUsed + usage.data.seatsReserved,
                    usage.data.seatsLimit,
                    `${usage.data.seatsUsed} active + ${usage.data.seatsReserved} reserved`,
                  ],
                ].map(([label, count, total, description]) => (
                  <div key={label} className="min-w-0 space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-sm font-semibold text-slate-800">
                        {label}
                      </strong>
                      <span className="shrink-0 text-xs font-medium tabular-nums text-slate-500">
                        {Number(total) === 0
                          ? 'No allowance'
                          : `${percent(Number(count), Number(total))}%`}
                      </span>
                    </div>
                    {Number(total) > 0 && (
                      <progress
                        className="h-2 w-full overflow-hidden rounded-full accent-blue-600"
                        value={Math.min(Number(count), Number(total))}
                        max={Number(total)}
                        aria-label={`${label} usage`}
                      />
                    )}
                    <p className="text-xs leading-5 text-slate-600">
                      {description} · Limit{' '}
                      {label === 'Storage' ? formatBytes(Number(total)) : total}
                    </p>
                    <p className="text-xs leading-5 text-slate-500">
                      {Number(total) === 0
                        ? 'No allowance is included in the current trial or plan.'
                        : Number(count) >= Number(total)
                          ? 'Limit reached. New reservations are paused until capacity is available.'
                          : `${percent(Number(count), Number(total))}% of allowance reserved or used`}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-6 border-t border-slate-100 pt-5">
              <Notice>
                Storage includes active reservations. Team invitations reserve
                seats; clients do not use seats. AI resets on the UTC calendar
                month; SMS uses the subscription period. Provider availability
                and separate spending caps still apply. Reaching one quota does
                not block manual text collection or permitted reads and exports.
              </Notice>
              {usage.data && (
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Subscription/SMS period:{' '}
                  {new Date(usage.data.periodStart).toLocaleDateString()}–
                  {new Date(usage.data.periodEnd).toLocaleDateString()}.{' '}
                  {usage.data.aiPeriodStart && usage.data.aiPeriodEnd && (
                    <>
                      AI period:{' '}
                      {new Date(usage.data.aiPeriodStart).toLocaleDateString()}–
                      {new Date(usage.data.aiPeriodEnd).toLocaleDateString()}.
                    </>
                  )}
                </p>
              )}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              {!embedded && (
                <Link className="secondary-button" to="?view=billing">
                  Go to billing
                </Link>
              )}
              <Link className="secondary-button" to={`${base}/team`}>
                Manage team seats
              </Link>
            </div>
          </section>
        )}

        {view !== 'usage' && (
          <section
            className="space-y-4"
            aria-labelledby="billing-compare-plans"
          >
            <div>
              <h3
                id="billing-compare-plans"
                className="text-lg font-semibold tracking-tight text-slate-900"
              >
                Compare plans
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Proposed pilot pricing for individuals and teams.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                ['SOLO', '19', '1 seat', '100 AI drafts', '25 SMS segments'],
                [
                  'AGENCY',
                  '49',
                  '5 seats',
                  '300 AI drafts',
                  '100 SMS segments',
                ],
              ].map(([plan, price, seats, ai, sms]) => (
                <article
                  key={plan}
                  className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-base font-semibold capitalize text-slate-900">
                      {plan.toLowerCase()}
                    </h4>
                    {q.data?.planKey === plan && <Badge>Current plan</Badge>}
                  </div>
                  <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
                    ${price}
                    <span className="ml-1 text-sm font-normal text-slate-500">
                      / month
                    </span>
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Proposed pricing · 50 GB storage
                  </p>
                  <ul className="my-6 space-y-3 border-t border-slate-100 pt-5 text-sm text-slate-700">
                    {[
                      seats,
                      `${ai} per month`,
                      `${sms} per month`,
                      'Unlimited active projects within resource limits',
                    ].map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5">
                        <Check
                          size={16}
                          className="mt-0.5 shrink-0 text-slate-500"
                          aria-hidden="true"
                        />{' '}
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="primary-button mt-auto inline-flex items-center justify-center gap-2"
                    disabled={command.pending}
                    onClick={async () => {
                      const result = await command.run<{ url: string }>(
                        `workspaces/${id}/billing/checkout`,
                        { planKey: plan },
                        'POST',
                        {
                          'Idempotency-Key': (checkoutKeys.current[
                            `${id}:${plan}`
                          ] ??= crypto.randomUUID()),
                        },
                      )
                      if (result) hosted(result.url)
                    }}
                  >
                    Choose {plan.toLowerCase()}{' '}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        <ErrorNotice error={command.error} />
        <ErrorNotice
          error={redirectError || (q.error ? errorMessage(q.error) : '')}
        />
      </div>
    </>
  )
}

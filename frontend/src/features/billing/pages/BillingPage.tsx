import { SettingsNav } from '@/features/auth/components/AccountPanel'
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
  Panel,
} from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import { formatBytes, percent } from '@/shared/utils/domain'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useRef, useState } from 'react'
import { env } from '@/config/env'
import { errorMessage } from '@/shared/utils/apiError'

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
      {!embedded && <SettingsNav active="billing" />}
      <SubscriptionNotice subscription={q.data} />
      {q.isLoading && <p role="status">Loading subscription details…</p>}
      <Link className="subscription-status-link" to="?view=status">
        View subscription status
      </Link>
      {view === 'status' && (
        <Panel title="Latest status">
          <div className="subscription-state">
            <Badge>
              {q.data?.state || (q.isError ? 'UNAVAILABLE' : 'LOADING')}
            </Badge>
            <p>
              This status comes from the server. Hosted payment confirmation may
              take a moment.
            </p>
            <button
              className="secondary-button"
              onClick={() => void q.refetch()}
            >
              Refresh status
            </button>
          </div>
        </Panel>
      )}
      {params.get('hosted') === 'demo' && (
        <Notice>
          Mock hosted billing return. No payment was collected and no
          subscription was changed.
        </Notice>
      )}
      {(embedded || view !== 'usage') && (
        <div className="billing-summary">
          <Panel title="Current plan">
            <h2>
              {q.data
                ? q.data.planKey === 'SOLO'
                  ? 'Solo'
                  : 'Agency'
                : 'Loading plan…'}
            </h2>
            <p className="price">
              {q.data ? `$${q.data.planKey === 'SOLO' ? '19' : '49'}` : '—'}
              <small>/ month</small>
            </p>
            <Badge>Proposed pilot pricing</Badge>
            <p>
              For{' '}
              {q.data?.planKey === 'SOLO'
                ? 'freelancers and solo creators'
                : 'small agencies and growing teams'}
              .
            </p>
            <ul>
              {usage.data && (
                <>
                  <li>{usage.data.seatsLimit} seats</li>
                  <li>{formatBytes(usage.data.storageLimitBytes)} storage</li>
                  <li>
                    {usage.data.aiDraftAllowance} AI drafts per allowance period
                  </li>
                  <li>
                    {usage.data.smsSegmentAllowance} SMS segments per allowance
                    period
                  </li>
                </>
              )}
              <li>Unlimited active projects within resource limits</li>
            </ul>
            <Link className="secondary-button" to="/pricing">
              View pricing
            </Link>
          </Panel>
          <Panel title="Plan details">
            {q.data && (
              <>
                <div className="actions">
                  <h3>{q.data.planKey}</h3>
                  <Badge>{q.data.state}</Badge>
                </div>
                <p>
                  {q.data.state === 'TRIALING'
                    ? 'Trial ends'
                    : 'Current period ends'}{' '}
                  {new Date(q.data.currentPeriodEnd).toLocaleDateString()}
                </p>
                <p className="subtle">
                  14-day trial. A past-due account has 7 days of grace, followed
                  by 30 days of read-only access. Reading and permitted exports
                  remain available.
                </p>
              </>
            )}
            <button
              className="secondary-button"
              disabled={command.pending}
              onClick={async () => {
                const result = await command.run<{ url: string }>(
                  `workspaces/${id}/billing/portal`,
                  {},
                )
                if (result) hosted(result.url)
              }}
            >
              Manage in hosted billing portal
            </button>
          </Panel>
        </div>
      )}
      {(embedded || view === 'usage') && (
        <>
          <Panel title="Storage and resource usage">
            {usage.isLoading && <p role="status">Loading current usage…</p>}
            <ErrorNotice error={usage.error ? errorMessage(usage.error) : ''} />
            {usage.data && (
              <div className="usage-grid">
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
                  <div key={label}>
                    <strong>{label}</strong>
                    {Number(total) > 0 && (
                      <progress
                        value={Math.min(Number(count), Number(total))}
                        max={Number(total)}
                        aria-label={`${label} usage`}
                      />
                    )}
                    <p>
                      {description} · Limit{' '}
                      {label === 'Storage' ? formatBytes(Number(total)) : total}
                    </p>
                    <p>
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
            <Notice>
              Storage includes active reservations. Team invitations reserve
              seats; clients do not use seats. AI resets on the UTC calendar
              month; SMS uses the subscription period. Provider availability and
              separate spending caps still apply. Reaching one quota does not
              block manual text collection or permitted reads and exports.
            </Notice>
            {usage.data && (
              <p className="subtle">
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
          </Panel>
          <div className="actions">
            {!embedded && (
              <Link className="secondary-button" to="?view=billing">
                Go to billing
              </Link>
            )}
            <Link className="secondary-button" to={`${base}/team`}>
              Manage team seats
            </Link>
          </div>
        </>
      )}
      {view !== 'usage' && (
        <div className="pricing-grid">
          {[
            ['SOLO', '19', '1 seat', '100 AI drafts', '25 SMS segments'],
            ['AGENCY', '49', '5 seats', '300 AI drafts', '100 SMS segments'],
          ].map(([plan, price, seats, ai, sms]) => (
            <Panel key={plan} title={plan}>
              <p className="price">
                ${price}
                <small>/ month</small>
              </p>
              <p>Proposed pricing · 50 GB storage</p>
              <ul>
                <li>{seats}</li>
                <li>{ai} per month</li>
                <li>{sms} per month</li>
                <li>Unlimited active projects within resource limits</li>
              </ul>
              <button
                className="primary-button"
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
                Choose {plan.toLowerCase()}
              </button>
            </Panel>
          ))}
        </div>
      )}
      <ErrorNotice error={command.error} />
      <ErrorNotice
        error={redirectError || (q.error ? errorMessage(q.error) : '')}
      />
    </>
  )
}

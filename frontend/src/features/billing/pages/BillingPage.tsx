import { SettingsNav } from '@/features/auth/components/AccountPanel'
import {
  billingDestination,
  useBillingSubscriptionQuery,
} from '@/features/billing/api/billingApi'
import type { UsageSummary } from '@/features/billing/types/billing.types'
import { useData } from '@/services/api/resourceApi'
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

export function BillingPage() {
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
  const usage = useData<UsageSummary>(`workspaces/${id}/usage`, {
    skip: !owner || view !== 'usage',
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
      <SettingsNav active={view} />
      <Link className="subscription-status-link" to="?view=status">
        View subscription status
      </Link>
      {view === 'status' && (
        <Panel title="Subscription status">
          <div className="subscription-state">
            <Badge>{q.data?.state || 'LOADING'}</Badge>
            <p>
              {q.data?.state === 'PAST_DUE'
                ? 'Payment needs attention. Update your payment method to keep the workspace active.'
                : q.data?.state === 'READ_ONLY'
                  ? 'Your plan is read-only. You can still view and export permitted content.'
                  : 'Your latest subscription state is shown below. Hosted payment confirmation may take a moment.'}
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
      {view !== 'usage' && (
        <div className="billing-summary">
          <Panel title="Current plan">
            <h2>{q.data?.planKey === 'SOLO' ? 'Solo' : 'Agency'}</h2>
            <p className="price">
              ${q.data?.planKey === 'SOLO' ? '19' : '49'}
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
              <li>{usage.data?.seatsLimit || 0} seats</li>
              <li>50 GB storage</li>
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
                  Current period ends{' '}
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
      {view === 'usage' && (
        <>
          <Panel title="Storage and resource usage">
            {' '}
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
                    usage.data.aiDraftsUsed,
                    usage.data.aiDraftAllowance,
                    `${usage.data.aiDraftsUsed} used`,
                  ],
                  [
                    'SMS segments',
                    usage.data.smsSegmentsUsed,
                    usage.data.smsSegmentAllowance,
                    `${usage.data.smsSegmentsUsed} used`,
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
                    <progress
                      value={Number(count)}
                      max={Number(total)}
                      aria-label={`${label} usage`}
                    />
                    <p>
                      {description} · {percent(Number(count), Number(total))}%
                    </p>
                  </div>
                ))}
              </div>
            )}
            <Notice>
              Limits apply to the current billing period. Existing content
              remains available when allowances are reached.
            </Notice>
          </Panel>
          <div className="actions">
            <Link className="secondary-button" to="?view=billing">
              Go to billing
            </Link>
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

import {
  billingDestination,
  useBillingSubscriptionQuery,
  useBillingUsageQuery,
} from '@/features/billing/api/billingApi'
import { SubscriptionNotice } from '@/features/billing/components/SubscriptionNotice'
import { Notice } from '@/shared/components/Feedback'
import { Empty, ErrorNotice } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import { formatBytes, percent } from '@/shared/utils/domain'
import { errorMessage } from '@/shared/utils/apiError'
import { env } from '@/config/env'
import { useNavigate, useSearchParams } from 'react-router'
import { useRef, useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  Info,
  Layers,
  Tag,
} from 'lucide-react'
import '@/features/settings/pages/SettingsPage.css'

type QuotaMeterProps = {
  label: string
  count: number
  limit: number | null
  description: string
  limitLabel: string
}

function QuotaMeter({
  label,
  count,
  limit,
  description,
  limitLabel,
}: QuotaMeterProps) {
  const ratio = limit !== null && limit > 0 ? percent(count, limit) : 0

  return (
    <div className="settings-quota min-w-0 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
        <span className="text-xs font-semibold tabular-nums text-slate-500">
          {limit === null
            ? 'Unlimited'
            : limit === 0
              ? 'Not included'
              : `${ratio}%`}
        </span>
      </div>

      {limit !== null && limit > 0 ? (
        <progress
          className="mt-3 block h-2 w-full overflow-hidden rounded-full accent-blue-600"
          value={Math.min(count, limit)}
          max={limit}
          aria-label={`${label} usage`}
        />
      ) : (
        <div
          className="mt-3 h-2 rounded-full bg-slate-200"
          aria-hidden="true"
        />
      )}

      <p className="mt-2 break-words text-xs leading-5 text-slate-600">
        {description} · Limit {limitLabel}
      </p>

      {limit === 0 && (
        <p className="mt-1 text-xs leading-5 text-slate-600">
          No allowance is included in your current plan.
        </p>
      )}

      {limit !== null && limit > 0 && count >= limit && (
        <p className="mt-1 text-xs font-medium text-amber-700">
          Limit reached. New reservations are paused.
        </p>
      )}
    </div>
  )
}

const planOptions = [
  {
    key: 'SOLO',
    title: 'Solo',
    price: 7,
    features: [
      '1 seat',
      '5 GB storage',
      '50 AI drafts per month',
      '10 active projects · 50 client contacts',
    ],
  },
  {
    key: 'AGENCY',
    title: 'Agency',
    price: 19,
    features: [
      '5 seats',
      '25 GB storage',
      '200 AI drafts per month',
      'Unlimited active projects within resource limits',
    ],
  },
] as const

const primaryButton =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50'

type PlanSelection = { planKey: 'FREE' | 'SOLO' | 'AGENCY'; state: string }

function planActionLabel(
  current: PlanSelection | undefined,
  plan: (typeof planOptions)[number],
) {
  if (
    current?.planKey === plan.key &&
    ['ACTIVE', 'PAST_DUE', 'READ_ONLY', 'SUSPENDED'].includes(current.state)
  )
    return 'Current plan'
  if (
    current?.planKey === 'AGENCY' &&
    plan.key === 'SOLO' &&
    ['ACTIVE', 'PAST_DUE', 'READ_ONLY', 'SUSPENDED'].includes(current.state)
  )
    return 'Downgrade to Solo'
  return `Upgrade to ${plan.title}`
}

export function BillingPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const checkoutKeys = useRef<Record<string, string>>({})
  const [redirectError, setRedirectError] = useState('')
  const { id, owner } = useWorkspace()
  const [params] = useSearchParams()

  const subscription = useBillingSubscriptionQuery(id, {
    skip: !owner,
  })

  const usage = useBillingUsageQuery(id, {
    // The status-only view should not request private resource counters.
    skip: !owner || params.get('view') === 'status',
  })

  const command = useCommand()

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

    if (target.origin === window.location.origin) {
      navigate(target.pathname + target.search)
    } else {
      window.location.assign(target.href)
    }
  }

  if (!owner) {
    return (
      <Empty
        title="Owner access required"
        description="Billing is managed by your workspace owner."
      />
    )
  }

  const current = subscription.data

  const planName =
    current?.planKey === 'SOLO'
      ? 'Solo'
      : current?.planKey === 'AGENCY'
        ? 'Agency'
        : current?.planKey === 'FREE'
          ? 'Free'
          : 'Loading…'

  const illustrativePrice =
    current?.planKey === 'SOLO'
      ? 7
      : current?.planKey === 'AGENCY'
        ? 19
        : current?.planKey === 'FREE'
          ? 0
          : null

  return (
    <div className="settings-billing min-w-0 space-y-3 text-[#0A1A2F]">
      {!embedded && (
        <header className="settings-page-header">
          <h1 className="settings-page-title">
            Billing &amp; usage
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Your plan, subscription, and resource usage.
          </p>
        </header>
      )}

      <SubscriptionNotice subscription={current} />

      {subscription.isLoading && (
        <p role="status" className="text-sm text-slate-500">
          Loading subscription details…
        </p>
      )}

      {params.get('hosted') === 'demo' && (
        <Notice>
          Mock hosted billing return. No payment was collected and no
          subscription was changed.
        </Notice>
      )}

      <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
        <section
          className="settings-card min-w-0 rounded-xl border border-slate-200 bg-white p-4"
          aria-labelledby="current-plan-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="settings-section-heading">
              <span className="settings-icon">
                <Layers size={18} aria-hidden="true" />
              </span>
              <h2 id="current-plan-heading">Current plan</h2>
            </div>

            {current && (
              <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                {current.state.replaceAll('_', ' ')}
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-2xl font-semibold text-[#0A1A2F]">{planName}</p>

            {illustrativePrice !== null && (
              <p className="text-xl font-semibold tabular-nums text-[#0A1A2F]">
                ${illustrativePrice}
                <span className="ml-1 text-sm font-normal text-slate-500">
                  / month
                </span>
              </p>
            )}
          </div>

          <p className="mt-1 text-xs text-slate-500">
            Catalog pricing. Existing subscriptions retain their
            provider-confirmed price until changed.
          </p>

          {usage.data && (
            <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 text-xs text-slate-700 sm:grid-cols-3">
              <span>{usage.data.seatsLimit} team seats</span>
              <span>{formatBytes(usage.data.storageLimitBytes)} storage</span>
              <span>{usage.data.aiDraftAllowance} AI drafts / period</span>
            </div>
          )}
        </section>

        <section
          className="settings-card min-w-0 rounded-xl border border-slate-200 bg-white p-4"
          aria-labelledby="subscription-heading"
        >
          <div className="settings-section-heading">
            <span className="settings-icon">
              <CalendarDays size={18} aria-hidden="true" />
            </span>
            <h2 id="subscription-heading">Subscription</h2>
          </div>

          {current && (
            <div className="mt-4 flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <CalendarDays size={18} aria-hidden="true" />
              </span>

              <div>
                <p className="text-xs text-slate-500">
                  {current.state === 'TRIALING'
                    ? 'Existing trial ends'
                    : current.state === 'FREE'
                      ? 'No expiration'
                      : 'Current billing period ends'}
                </p>

                <p className="mt-1 text-base font-semibold text-slate-900">
                  {current.currentPeriodEnd
                    ? new Date(current.currentPeriodEnd).toLocaleDateString()
                    : 'Free forever · No credit card required'}
                </p>

                {current.cancelAtPeriodEnd && (
                  <p className="mt-1 text-xs text-amber-700">
                    Cancellation scheduled at period end.
                  </p>
                )}
              </div>
            </div>
          )}

          {current?.state !== 'FREE' && (
            <p className="mt-3 max-w-lg text-xs leading-5 text-slate-600">
              If a renewal payment fails, editing remains available for at least
              7 days and through the paid billing period, whichever is later.
              Read-only access then lasts up to 30 days. Permitted reads and
              exports remain available.
            </p>
          )}

          {current?.state !== 'FREE' && (
            <button
              type="button"
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={command.pending}
              onClick={async () => {
                setRedirectError('')
                const result = await command.run<{ url: string }>(
                  `workspaces/${id}/billing/portal`,
                  {},
                  'POST',
                  {
                    'Idempotency-Key': (checkoutKeys.current[`${id}:portal`] ??=
                      crypto.randomUUID()),
                  },
                )
                if (result) hosted(result.url)
              }}
            >
              Manage in hosted billing portal
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </section>
      </div>

      <section
        className="settings-card min-w-0 rounded-xl border border-slate-200 bg-white p-4"
        aria-labelledby="billing-usage-heading"
      >
        <div className="settings-section-heading mb-3">
          <span className="settings-icon">
            <BarChart3 size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 id="billing-usage-heading">Resource usage</h2>
            <p className="mt-1 text-xs text-slate-500">
              Your current allowances and consumption.
            </p>
          </div>
        </div>

        {usage.isLoading && (
          <p role="status" className="text-sm text-slate-500">
            Loading usage…
          </p>
        )}

        <ErrorNotice error={usage.error ? errorMessage(usage.error) : ''} />

        {usage.data && (
          <div className="settings-usage-grid">
            {usage.data.activeProjects !== undefined &&
              usage.data.activeProjectLimit !== undefined && (
                <QuotaMeter
                  label="Active projects"
                  count={usage.data.activeProjects}
                  limit={usage.data.activeProjectLimit}
                  description={`${usage.data.activeProjects} draft, active or paused`}
                  limitLabel={
                    usage.data.activeProjectLimit === null
                      ? 'Unlimited'
                      : String(usage.data.activeProjectLimit)
                  }
                />
              )}
            {usage.data.clientContacts !== undefined &&
              usage.data.clientContactLimit !== undefined && (
                <QuotaMeter
                  label="Client contacts"
                  count={usage.data.clientContacts}
                  limit={usage.data.clientContactLimit}
                  description={`${usage.data.clientContacts} unique active or reserved contacts`}
                  limitLabel={
                    usage.data.clientContactLimit === null
                      ? 'Unlimited'
                      : String(usage.data.clientContactLimit)
                  }
                />
              )}
            <QuotaMeter
              label="Storage"
              count={
                usage.data.storageUsedBytes + usage.data.storageReservedBytes
              }
              limit={usage.data.storageLimitBytes}
              description={`${formatBytes(
                usage.data.storageUsedBytes,
              )} used + ${formatBytes(
                usage.data.storageReservedBytes,
              )} reserved`}
              limitLabel={formatBytes(usage.data.storageLimitBytes)}
            />

            <QuotaMeter
              label="Team seats"
              count={usage.data.seatsUsed + usage.data.seatsReserved}
              limit={usage.data.seatsLimit}
              description={`${usage.data.seatsUsed} active + ${usage.data.seatsReserved} reserved`}
              limitLabel={String(usage.data.seatsLimit)}
            />

            <QuotaMeter
              label="AI drafts"
              count={usage.data.aiDraftsUsed + usage.data.aiDraftsReserved}
              limit={usage.data.aiDraftAllowance}
              description={`${usage.data.aiDraftsUsed} used + ${usage.data.aiDraftsReserved} reserved`}
              limitLabel={String(usage.data.aiDraftAllowance)}
            />
          </div>
        )}

        <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
          <Info
            size={18}
            className="mt-0.5 shrink-0 text-blue-600"
            aria-hidden="true"
          />

          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              How limits and billing periods work
            </h3>

            <p className="mt-1 text-xs leading-5 text-slate-600">
              Storage includes active reservations. Team invitations reserve
              seats; clients do not use seats. AI resets on the UTC calendar
              month. Provider availability and separate spending caps still apply.
              Reaching a quota does not block manual text collection or
              permitted reads and exports.
            </p>

            {usage.data && (
              <p className="mt-2 text-xs leading-5 text-slate-600">
                Subscription period:{' '}
                {new Date(usage.data.periodStart).toLocaleDateString()}–
                {new Date(usage.data.periodEnd).toLocaleDateString()}.
                {usage.data.aiPeriodStart && usage.data.aiPeriodEnd && (
                  <>
                    {' '}
                    AI period:{' '}
                    {new Date(usage.data.aiPeriodStart).toLocaleDateString()}–
                    {new Date(usage.data.aiPeriodEnd).toLocaleDateString()}.
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      </section>

      <section
        className="settings-card min-w-0 rounded-xl border border-slate-200 bg-white p-4"
        aria-labelledby="compare-plans-heading"
      >
        <div className="settings-section-heading mb-3">
          <span className="settings-icon">
            <Tag size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 id="compare-plans-heading">Compare plans</h2>
            <p className="mt-1 text-xs text-slate-500">
              Free is $0 forever. Upgrades from Free start at checkout; changes
              between paid plans take effect at your next renewal.
            </p>
          </div>
        </div>

        {current?.pendingChange && (
          <div
            role="status"
            className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800"
          >
            {current.pendingChange.state === 'SCHEDULED'
              ? 'Scheduled'
              : 'Awaiting provider confirmation'}
            : {current.pendingChange.planKey === 'SOLO' ? 'Solo' : 'Agency'}{' '}
            from{' '}
            {new Date(current.pendingChange.effectiveAt).toLocaleDateString()}.
            Your current plan remains in place until the provider confirms the
            change.
            {current.pendingChange.state === 'REQUESTED' && (
              <button
                type="button"
                className="button-secondary mt-3"
                disabled={command.pending}
                onClick={async () => {
                  const result = await command.run(
                    `workspaces/${id}/billing/plan-change/retry`,
                    {},
                    'POST',
                  )
                  if (result) await subscription.refetch()
                }}
              >
                Retry confirmation
              </button>
            )}
          </div>
        )}
        {current && ['PAST_DUE', 'READ_ONLY'].includes(current.state) && (
          <p className="mb-4 text-sm text-amber-800">
            Resolve the overdue payment in the hosted billing portal before
            changing plans.
          </p>
        )}
        {current?.state === 'SUSPENDED' && (
          <p className="mb-4 text-sm text-amber-800">
            Contact support to restore this subscription before changing plans.
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {planOptions.map((plan) => (
            <article
              key={plan.key}
              className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-slate-50/40 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900">
                  {plan.title}
                </h3>

                {current?.planKey === plan.key && (
                  <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                    Current plan
                  </span>
                )}
              </div>

              <p className="mt-2 text-2xl font-semibold tabular-nums text-[#0A1A2F]">
                ${plan.price}
                <span className="ml-1 text-sm font-normal text-slate-500">
                  / month
                </span>
              </p>

              <ul className="my-3 flex-1 space-y-2 border-t border-slate-200 pt-3">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm leading-5 text-slate-700"
                  >
                    <Check
                      size={16}
                      className="mt-0.5 shrink-0 text-blue-600"
                      aria-hidden="true"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className={`${primaryButton} w-full`}
                aria-label={planActionLabel(current, plan)}
                disabled={
                  !current ||
                  command.pending ||
                  !!current.pendingChange ||
                  !['FREE', 'TRIALING', 'ACTIVE'].includes(current.state) ||
                  (current.state === 'ACTIVE' &&
                    (current.planKey === plan.key || current.cancelAtPeriodEnd))
                }
                onClick={async () => {
                  if (
                    current?.state === 'ACTIVE' &&
                    current.planKey !== 'FREE' &&
                    current.currentPeriodEnd
                  ) {
                    if (
                      !window.confirm(
                        `Schedule ${plan.title} at $${plan.price}/month from ${new Date(current.currentPeriodEnd).toLocaleDateString()}? Your current paid plan continues until then.`,
                      )
                    )
                      return
                    const result = await command.run(
                      `workspaces/${id}/billing/plan-change`,
                      {
                        planKey: plan.key,
                        effectiveAt: current.currentPeriodEnd,
                      },
                      'POST',
                      {
                        'Idempotency-Key': (checkoutKeys.current[
                          `${id}:change:${plan.key}:${current.currentPeriodEnd}`
                        ] ??= crypto.randomUUID()),
                      },
                    )
                    if (result) await subscription.refetch()
                    return
                  }
                  const result = await command.run<{ url: string }>(
                    `workspaces/${id}/billing/checkout`,
                    { planKey: plan.key },
                    'POST',
                    {
                      'Idempotency-Key': (checkoutKeys.current[
                        `${id}:${plan.key}`
                      ] ??= crypto.randomUUID()),
                    },
                  )

                  if (result) hosted(result.url)
                }}
              >
                {planActionLabel(current, plan)}
                {planActionLabel(current, plan) === 'Current plan' ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <ArrowRight size={16} aria-hidden="true" />
                )}
              </button>
            </article>
          ))}
        </div>
      </section>

      <ErrorNotice error={command.error} />
      <ErrorNotice
        error={
          redirectError ||
          (subscription.error ? errorMessage(subscription.error) : '')
        }
      />
    </div>
  )
}

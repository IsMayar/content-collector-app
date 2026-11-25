import type { Subscription } from '@/features/billing/types/billing.types'
import { Link } from 'react-router'
import { Info } from 'lucide-react'

function formatDate(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString()
    : 'the end of the access period'
}

export function SubscriptionNotice({
  subscription,
  billingUrl,
}: {
  subscription?: Subscription
  billingUrl?: string
}) {
  if (!subscription) return null
  const s = subscription
  // A future-dated Stripe test-clock period is not readable yet, even if its
  // stored subscription state is ACTIVE. Never promise read/export access.
  const periodNotStarted =
    s.currentPeriodStart !== null &&
    Date.parse(s.currentPeriodStart) > Date.now()
  const message =
    s.state === 'TRIALING'
      ? `Your existing trial ends ${formatDate(s.currentPeriodEnd)}. Your workspace will continue on Free unless you choose a paid plan.`
      : s.state === 'PAST_DUE'
        ? `Payment needs attention. Editing remains available until ${formatDate(s.cancelAtPeriodEnd ? s.currentPeriodEnd : s.graceEndsAt)}. Update your payment method to avoid read-only access.`
        : s.state === 'READ_ONLY'
          ? periodNotStarted
            ? `This subscription period starts ${formatDate(s.currentPeriodStart)}, which is in the future. Workspace access is paused. Review billing dates or contact support.`
            : `This workspace is read-only. Editing, AI, reminders and new invitations are paused. Authorized reads and exports remain available until ${formatDate(s.readOnlyEndsAt)}.`
          : s.state === 'SUSPENDED'
            ? 'This subscription is suspended. Contact support about restoring access.'
            : s.cancelAtPeriodEnd
              ? `Cancellation is scheduled for ${formatDate(s.currentPeriodEnd)}. Your workspace will then continue on Free with its limits. No content is deleted.`
              : null

  if (!message) return null

  return (
    <div
      role="status"
      className="flex min-w-0 items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50/60 px-3.5 py-3 text-[13px] leading-5 text-slate-700"
    >
      <Info
        size={17}
        className="mt-0.5 shrink-0 text-blue-600"
        aria-hidden="true"
      />
      <p className="m-0 min-w-0 flex-1">
        {message}{' '}
        {billingUrl && (
          <Link
            to={billingUrl}
            className="font-semibold text-blue-700 underline-offset-2 hover:underline"
          >
            Manage billing
          </Link>
        )}
      </p>
    </div>
  )
}

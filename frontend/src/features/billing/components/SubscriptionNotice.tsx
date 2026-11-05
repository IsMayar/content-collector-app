import type { Subscription } from '@/features/billing/types/billing.types'
import { Notice } from '@/shared/components/Feedback'
import { Link } from 'react-router'

function date(value: string | null) {
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
  const message =
    s.state === 'TRIALING'
      ? `Your 14-day trial ends ${date(s.currentPeriodEnd)}. Trial AI and SMS allowances may be reduced. Review your plan and limits before choosing a subscription.`
      : s.state === 'PAST_DUE'
        ? `Payment needs attention. Editing remains available until ${date(s.cancelAtPeriodEnd ? s.currentPeriodEnd : s.graceEndsAt)}. Update your payment method to avoid read-only access.`
        : s.state === 'READ_ONLY'
          ? `This workspace is read-only. Editing, AI, reminders and new invitations are paused. Authorized reads and exports are available until ${date(s.readOnlyEndsAt)}. Manage billing to restore access.`
          : s.state === 'SUSPENDED'
            ? 'This subscription is suspended. Contact support about restoring access.'
            : s.cancelAtPeriodEnd
              ? `Cancellation is scheduled for ${date(s.currentPeriodEnd)}. Editing remains available until then.`
              : null
  return message ? (
    <Notice>
      <span>{message}</span>
      {billingUrl && (
        <>
          {' '}
          <Link to={billingUrl}>Manage billing</Link>
        </>
      )}
    </Notice>
  ) : null
}

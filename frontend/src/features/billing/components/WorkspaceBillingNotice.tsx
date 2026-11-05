import { useBillingSubscriptionQuery } from '@/features/billing/api/billingApi'
import { SubscriptionNotice } from './SubscriptionNotice'
import { Notice } from '@/shared/components/Feedback'

/** Billing details remain owner-only; other members use the generic workspace notice. */
export function WorkspaceBillingNotice({
  workspace,
  owner,
  canWrite,
}: {
  workspace: string
  owner: boolean
  canWrite?: boolean
}) {
  const query = useBillingSubscriptionQuery(workspace, {
    skip: !owner || !workspace,
    pollingInterval: 60000,
  })
  const subscription = query.data
  if (owner && !subscription && canWrite === false)
    return (
      <Notice>
        Workspace editing is paused. Open Billing in Settings or contact
        support.
      </Notice>
    )
  if (
    !owner ||
    !subscription ||
    (['ACTIVE', 'TRIALING'].includes(subscription.state) &&
      !subscription.cancelAtPeriodEnd)
  )
    return null
  return (
    <SubscriptionNotice
      subscription={subscription}
      billingUrl={`/app/w/${workspace}/billing`}
    />
  )
}

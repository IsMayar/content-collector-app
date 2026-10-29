import type { PlanKey } from '@/features/workspace/types/workspace.types'
import type { Instant } from '@/shared/types/common.types'

export interface Subscription {
  planKey: PlanKey
  state: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'READ_ONLY' | 'SUSPENDED'
  currentPeriodStart: Instant
  currentPeriodEnd: Instant
  cancelAtPeriodEnd: boolean
  graceEndsAt: Instant | null
  readOnlyEndsAt: Instant | null
}
export interface UsageSummary {
  periodStart: Instant
  periodEnd: Instant
  storageUsedBytes: number
  storageReservedBytes: number
  storageLimitBytes: number
  aiDraftsUsed: number
  aiDraftAllowance: number
  smsSegmentsUsed: number
  smsSegmentAllowance: number
  seatsUsed: number
  seatsReserved: number
  seatsLimit: number
}

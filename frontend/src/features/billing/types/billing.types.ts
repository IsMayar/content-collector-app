import type { PlanKey } from '@/features/workspace/types/workspace.types'
import type { Instant } from '@/shared/types/common.types'

export interface Subscription {
  planKey: PlanKey
  state: 'FREE' | 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'READ_ONLY' | 'SUSPENDED'
  currentPeriodStart: Instant | null
  currentPeriodEnd: Instant | null
  cancelAtPeriodEnd: boolean
  pendingChange?: {
    planKey: 'SOLO' | 'AGENCY'
    effectiveAt: Instant
    state: 'REQUESTED' | 'SCHEDULED'
  } | null
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
  aiDraftsReserved?: number
  smsSegmentsReserved?: number
  aiPeriodStart?: Instant
  aiPeriodEnd?: Instant
  activeProjects?: number
  activeProjectLimit?: number | null
  clientContacts?: number
  clientContactLimit?: number | null
}

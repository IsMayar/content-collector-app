import type { UserSummary } from '@/features/auth/types/auth.types'
import type { Instant, Timezone, UUID } from '@/shared/types/common.types'
export type WorkspaceRole = 'OWNER' | 'MEMBER'
export type PlanKey = 'SOLO' | 'AGENCY'
export interface Workspace {
  id: UUID
  name: string
  timezone: Timezone
  state: 'ACTIVE' | 'READ_ONLY' | 'SUSPENDED' | 'DELETION_PENDING'
  version: number
}
export interface Member {
  id: UUID
  user: UserSummary
  role: WorkspaceRole
  state: 'ACTIVE' | 'DISABLED'
}
export interface InviteSummary {
  id: UUID
  email: string
  expiresAt: Instant
  state: 'PENDING' | 'CONSUMED' | 'REVOKED' | 'EXPIRED'
}
export interface Entitlements {
  planKey: PlanKey
  seats: number
  storageLimitBytes: number
  unlimitedActiveProjects: boolean
  aiDraftAllowance: number
  smsSegmentAllowance: number
  canWrite: boolean
  aiEnabled: boolean
  smsEnabled: boolean
}
export interface NotificationPreferences {
  smsAvailable?: boolean
  smsConsentTextVersion?: string
  smsUsage?: {
    allowance: number
    usedSegments: number
    reservedSegments: number
    spendingLimitMicrousd: number
  }

  emailEnabled: boolean
  timezone: Timezone | null
  smsStatus:
    | 'NOT_CONFIGURED'
    | 'UNVERIFIED'
    | 'VERIFIED_OPTED_IN'
    | 'OPTED_OUT'
    | 'UNAVAILABLE'
}

export interface WorkspaceDetail {
  workspace: Workspace
  entitlements: Entitlements
}

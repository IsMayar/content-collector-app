import {
  meSchema,
  tokenSchema,
} from '@/features/auth/schemas/authResponseSchemas'
import type { WorkspaceRole } from '@/features/workspace/types/workspace.types'
import type { Instant, UUID } from '@/shared/types/common.types'
import { z } from 'zod'
export interface UserSummary {
  id: UUID
  email: string
  displayName: string
  verified: boolean
}
export interface SessionSummary {
  id: UUID
  createdAt: Instant
  lastSeenAt: Instant
  expiresAt: Instant
  current: boolean
  label: string
}
export interface MembershipSummary {
  memberId: UUID
  workspaceId: UUID
  workspaceName: string
  role: WorkspaceRole
}
export type Me = z.infer<typeof meSchema>
export type TokenResponse = z.infer<typeof tokenSchema>
export type LoginCommand = { email: string; password: string }

export interface AuthState {
  status: 'loading' | 'authenticated' | 'anonymous' | 'error'
  accessToken: string | null
  expiresAt: number
  user: Me['user'] | null
  memberships: Me['memberships']
  workspaceId: string | null
  generation: number
}

import type { Instant, Timezone, UUID } from '@/shared/types/common.types'
export interface Client {
  id: UUID
  businessName: string
  contactName: string | null
  email: string | null
  version: number
}
export interface ProjectContact {
  id: UUID
  name: string
  email: string
  state: 'ACTIVE' | 'REVOKED'
  timezone: Timezone | null
  accessExpiresAt: Instant
  accessInitializedAt?: string | null
  emailRemindersEnabled: boolean
}
export interface ContactCreate {
  clientId: string
  name: string
  email: string
  accessExpiresAt: string
}

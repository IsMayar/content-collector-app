import type { Instant, Timezone, UUID } from '@/shared/types/common.types'

export interface ReminderRule {
  id: UUID
  channel: 'EMAIL' | 'SMS'
  daysRelativeToDueDate: number
  localTime: string
  weekdaysOnly: boolean
}
export interface ReminderPolicy {
  version: number
  enabled: boolean
  paused: boolean
  timezone: Timezone
  rules: ReminderRule[]
}
export interface ReminderPreview {
  channel: 'EMAIL' | 'SMS'
  subject: string | null
  body: string
  eligible: boolean
  reasons: string[]
  estimatedSegments: number | null
}
export interface DeliverySummary {
  id: UUID
  channel: 'EMAIL' | 'SMS'
  dueAt: Instant
  state:
    | 'QUEUED'
    | 'SENDING'
    | 'ACCEPTED'
    | 'DELIVERED'
    | 'BOUNCED'
    | 'SUPPRESSED'
    | 'FAILED'
    | 'UNKNOWN'
    | 'CANCELLED'
  failureCode: string | null
}

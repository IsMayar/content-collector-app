import type { UUID } from '@/shared/types/common.types'

export interface AiDraftCommand {
  facts: string[]
  tone: string
  targetWords: number
  baseAnswerVersion: number
  consent: true
}
export interface AiDraftResult {
  draft: string
  factsUsed: string[]
  missingFacts: string[]
  warnings: string[]
}
export interface AiDraftJob {
  id: UUID
  itemId: UUID
  state:
    | 'QUEUED'
    | 'RUNNING'
    | 'SUCCEEDED'
    | 'REFUSED'
    | 'FAILED'
    | 'ACCEPTED'
    | 'EXPIRED'
  baseAnswerVersion: number
  result: AiDraftResult | null
  failureCode: string | null
}

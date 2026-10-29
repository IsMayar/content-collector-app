import type { AnswerValue } from '@/features/client/types/client.types'
import type { AssetSummary } from '@/features/projects/types/file.types'
import type {
  ItemDefinition,
  ItemState,
} from '@/features/structure-editor/types/structure.types'
import type { Instant, UUID } from '@/shared/types/common.types'
export interface SubmissionSummary {
  revisionId: UUID
  itemId: UUID
  itemKey: string
  revisionNo: number
  submittedAt: Instant
}
export interface RevisionSummary extends SubmissionSummary {
  state: ItemState
}
export interface SubmissionRevision extends SubmissionSummary {
  structureVersion: number
  schemaSnapshot: ItemDefinition
  valueSnapshot: AnswerValue
  assets: AssetSummary[]
  submittedByContactId: UUID
}
export interface ReviewCommand {
  revisionId: UUID
  expectedItemVersion: number
  decision: 'APPROVE' | 'REQUEST_CHANGES'
  reason?: string
}
export interface ReviewDecision {
  id: UUID
  revisionId: UUID
  decision: 'APPROVE' | 'REQUEST_CHANGES'
  reason: string | null
  reviewedAt: Instant
  reviewerDisplayName: string
}
export interface ClientVisibleComment {
  id: UUID
  body: string
  authorDisplayName: string
  createdAt: Instant
  revisionId: UUID | null
}
export interface Comment extends ClientVisibleComment {
  visibility: 'CLIENT' | 'INTERNAL'
}
export interface SafeAuditEvent {
  id: UUID
  action: string
  resourceKind: string
  resourceId: UUID | null
  actorDisplayName: string
  occurredAt: Instant
}
export interface ExportCommand {
  format: 'APPROVED_ZIP' | 'APPROVED_JSON' | 'APPROVED_MARKDOWN'
  expectedProjectVersion: number
  includeOriginals: boolean
  acknowledgePartial: boolean
}
export interface ExportSummary {
  id: UUID
  state: 'QUEUED' | 'RUNNING' | 'READY' | 'FAILED' | 'EXPIRED' | 'CANCELLED'
  format: ExportCommand['format']
  projectVersion: number
  partial: boolean
  createdAt: Instant
  expiresAt: Instant
  olderThanCurrentProject: boolean
}

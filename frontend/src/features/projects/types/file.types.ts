import type { Instant, UUID } from '@/shared/types/common.types'
export type AssetState =
  | 'RESERVED'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'READY'
  | 'REJECTED'
  | 'FAILED'
  | 'DELETED'
export interface AssetSummary {
  id: UUID
  itemId: UUID
  originalName: string
  contentType: string | null
  state: AssetState
  sourceBytes: number
  retainedBytes: number
  keepOriginal: boolean
  availableVariants: ('ORIGINAL' | 'WORKING' | 'THUMBNAIL')[]
  rejectionCode: string | null
}
export interface UploadReservationCommand {
  itemId: UUID
  originalName: string
  contentType: string
  bytes: number
  keepOriginal: boolean
}
export interface UploadReservation {
  assetId: UUID
  uploadId: UUID
  putUrl: string
  requiredHeaders: Record<string, string>
  expiresAt: Instant
}

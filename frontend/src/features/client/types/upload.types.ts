import type { UploadReservation } from '@/features/projects/types/file.types'

export type Transfer = {
  id: string
  file: File
  progress: number | null
  state:
    'queued' | 'uploading' | 'processing' | 'ready' | 'failed' | 'cancelled'
  keepOriginal?: boolean
  reservation?: UploadReservation
  phase?: 'reserve' | 'transfer' | 'finalize' | 'verify'
  uploaded?: boolean
  retryable?: boolean
  restart?: boolean
  cancellationConfirmed?: boolean
  assetId?: string
  uploadId?: string
  error?: string
  controller?: AbortController
}

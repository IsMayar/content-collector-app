export type Transfer = {
  id: string
  file: File
  progress: number
  state:
    'queued' | 'uploading' | 'processing' | 'ready' | 'failed' | 'cancelled'
  assetId?: string
  uploadId?: string
  error?: string
  controller?: AbortController
}

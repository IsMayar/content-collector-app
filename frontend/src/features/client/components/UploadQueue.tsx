import type {} from '@/features/client/api/clientApi'
import { fetchLatestAsset } from '@/features/client/api/clientApi'
import type { Transfer } from '@/features/client/types/upload.types'
import type {
  AssetSummary,
  UploadReservation,
} from '@/features/projects/types/file.types'
import { Notice } from '@/shared/components/Feedback'
import { Badge, ErrorNotice, Field } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { formatBytes } from '@/shared/utils/domain'
import { downloadFile } from '@/shared/utils/download'
import { FileText, FolderOpen } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
export function UploadQueue({
  client = true,
  root,
  itemId,
  image,
  assets,
  selected,
  onChange,
  disabled,
}: {
  client?: boolean
  root: string
  itemId: string
  image: boolean
  assets: AssetSummary[]
  selected: string[]
  onChange: (ids: string[]) => void
  disabled: boolean
}) {
  const command = useCommand(client)
  const [queue, setQueue] = useState<Transfer[]>([])
  const [keep, setKeep] = useState(true)
  const [error, setError] = useState('')
  const active = useRef(0)
  const started = useRef(new Set<string>())
  const cancelled = useRef(new Set<string>())
  const queueRef = useRef(queue)
  queueRef.current = queue
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const unmounted = useRef(false)
  useEffect(() => {
    unmounted.current = false
    return () => {
      unmounted.current = true
      for (const t of queueRef.current) t.controller?.abort()
    }
  }, [])
  function patch(id: string, changes: Partial<Transfer>) {
    if (!unmounted.current)
      setQueue((q) => q.map((t) => (t.id === id ? { ...t, ...changes } : t)))
  }
  async function transfer(t: Transfer) {
    active.current++
    patch(t.id, { state: 'uploading', error: undefined, progress: 0 })
    let reservation: UploadReservation | undefined
    try {
      reservation = await command.run<UploadReservation>(`${root}/uploads`, {
        itemId,
        originalName: t.file.name,
        contentType: t.file.type || 'application/octet-stream',
        bytes: t.file.size,
        keepOriginal: keep,
      })
      if (!reservation)
        throw Error('Reservation failed. Check type, size and workspace quota.')
      if (cancelled.current.has(t.id)) throw Error('Upload cancelled.')
      patch(t.id, {
        assetId: reservation.assetId,
        uploadId: reservation.uploadId,
      })
      const controller = new AbortController()
      patch(t.id, { controller })
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', reservation!.putUrl)
        Object.entries(reservation!.requiredHeaders).forEach(([k, v]) =>
          xhr.setRequestHeader(k, v),
        )
        xhr.upload.onprogress = (e) =>
          patch(t.id, {
            progress: e.lengthComputable
              ? Math.round((e.loaded / e.total) * 90)
              : 40,
          })
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(
                Error(
                  xhr.status === 403
                    ? 'Upload link expired. Retry for a fresh link.'
                    : 'Transfer failed.',
                ),
              )
        xhr.onerror = () =>
          reject(Error('Connection interrupted. Retry this file.'))
        xhr.onabort = () => reject(Error('Upload cancelled.'))
        controller.signal.addEventListener('abort', () => xhr.abort())
        xhr.send(t.file)
      })
      if (
        !(await command.run(
          `${root}/uploads/${reservation.uploadId}/finalize`,
          {},
        ))
      )
        throw Error('Could not finalize the upload.')
      patch(t.id, { state: 'processing', progress: 100 })
      let state = 'PROCESSING'
      for (
        let attempts = 0;
        attempts < 40 &&
        state === 'PROCESSING' &&
        !unmounted.current &&
        !controller.signal.aborted;
        attempts++
      ) {
        await new Promise((r) => setTimeout(r, 600))
        const result = await fetchLatestAsset(
          `${root}/assets/${reservation.assetId}`,
          client,
        )
        state = result?.state || 'FAILED'
        if (state === 'REJECTED' || state === 'FAILED')
          throw Error(result?.rejectionCode || 'File processing failed.')
      }
      if (controller.signal.aborted) throw Error('Upload cancelled.')
      if (state !== 'READY')
        throw Error(
          'Processing is taking longer than expected. Retry status later.',
        )
      patch(t.id, { state: 'ready' })
      onChange([...new Set([...selectedRef.current, reservation.assetId])])
    } catch (e) {
      patch(t.id, {
        state: cancelled.current.has(t.id) ? 'cancelled' : 'failed',
        error: e instanceof Error ? e.message : 'Upload failed.',
      })
      if (reservation)
        await command.run(
          `${root}/uploads/${reservation.uploadId}`,
          undefined,
          'DELETE',
        )
    } finally {
      active.current--
      started.current.delete(t.id)
      if (!unmounted.current) setQueue((q) => [...q])
    }
  }
  const startTransfer = useEffectEvent((t: Transfer) => void transfer(t))
  useEffect(() => {
    for (const t of queue) {
      if (active.current >= 3) break
      if (t.state === 'queued' && !started.current.has(t.id)) {
        started.current.add(t.id)
        startTransfer(t)
      }
    }
  }, [queue])
  function add(files: FileList | null) {
    if (!files) return
    if (queue.length + files.length > 50) {
      setError('Choose no more than 50 files in a batch.')
      return
    }
    const valid: Transfer[] = []
    for (const file of files) {
      if (file.size > (image ? 50 : 100) * 1024 * 1024) {
        setError(`${file.name} exceeds ${image ? 50 : 100} MiB.`)
        continue
      }
      valid.push({
        id: crypto.randomUUID(),
        file,
        progress: 0,
        state: 'queued',
      })
    }
    setQueue((q) => [...q, ...valid])
  }
  return (
    <div className="upload-area">
      <label
        className="upload-drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (!disabled) add(e.dataTransfer.files)
        }}
      >
        <FolderOpen size={28} />
        <strong>{image ? 'Add images' : 'Add project files'}</strong>
        <span>
          {image
            ? 'JPEG, PNG, WebP, HEIC/HEIF · 50 MiB each'
            : 'Images, PDF, DOCX, TXT, SVG · 100 MiB each'}
        </span>
        <input
          aria-label={
            image
              ? 'Choose images from library or files'
              : 'Choose project files'
          }
          type="file"
          multiple
          accept={
            image
              ? '.jpg,.jpeg,.png,.webp,.heic,.heif'
              : '.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,.docx,.txt,.svg'
          }
          disabled={disabled}
          onChange={(e) => {
            add(e.target.files)
            e.target.value = ''
          }}
        />
      </label>
      {image && (
        <Field label="Take a photo">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={disabled}
            onChange={(e) => add(e.target.files)}
          />
        </Field>
      )}
      <label className="check-row">
        <input
          type="checkbox"
          checked={keep}
          disabled={disabled}
          onChange={(e) => setKeep(e.target.checked)}
        />
        Keep originals for this upload
      </label>
      <small>
        Turning this off saves space. Discarded originals cannot be recovered.
        Only ready files can be submitted.
      </small>
      <ErrorNotice error={error || command.error} />
      {queue.some((t) => t.state === 'failed') && (
        <Notice error>
          Some files couldn’t be uploaded. Review each error and retry, or
          remove the failed upload.
        </Notice>
      )}
      {queue.map((t) => (
        <div className="upload-row" key={t.id}>
          <FileText size={20} />
          <div className="grow">
            <strong>{t.file.name}</strong>
            <small>
              {formatBytes(t.file.size)} · {t.state}
            </small>
            <progress
              value={t.progress}
              max={100}
              aria-label={`${t.file.name} upload progress`}
            />
            {t.error && <p role="alert">{t.error}</p>}
          </div>
          {['failed', 'cancelled'].includes(t.state) && (
            <button
              className="secondary-button"
              onClick={() => {
                cancelled.current.delete(t.id)
                patch(t.id, { state: 'queued' })
              }}
            >
              Retry
            </button>
          )}
          {['failed', 'cancelled'].includes(t.state) && (
            <button
              className="text-link"
              onClick={() =>
                setQueue((q) => q.filter((row) => row.id !== t.id))
              }
            >
              Remove
            </button>
          )}
          {['queued', 'uploading', 'processing'].includes(t.state) && (
            <button
              className="secondary-button"
              onClick={() => {
                cancelled.current.add(t.id)
                t.controller?.abort()
                patch(t.id, { state: 'cancelled' })
                if (t.uploadId)
                  void command.run(
                    `${root}/uploads/${t.uploadId}`,
                    undefined,
                    'DELETE',
                  )
              }}
            >
              Cancel
            </button>
          )}
        </div>
      ))}
      {assets
        .filter((a) => a.state !== 'DELETED')
        .map((a) => (
          <div className="upload-row" key={a.id}>
            <label className="check-row grow">
              <input
                type="checkbox"
                disabled={disabled || a.state !== 'READY'}
                checked={selected.includes(a.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...selected, a.id]
                      : selected.filter((id) => id !== a.id),
                  )
                }
              />
              <span>
                <strong>{a.originalName}</strong>
                <small>
                  {formatBytes(a.retainedBytes)} ·{' '}
                  {a.keepOriginal ? 'Original retained' : 'Working copy only'}
                </small>
              </span>
            </label>
            <Badge>{a.state}</Badge>
            {a.state === 'READY' && (
              <button
                className="text-link"
                onClick={async () => {
                  const result = await command.run<{ url: string }>(
                    `${root}/assets/${a.id}/download`,
                    { variant: 'WORKING' },
                  )
                  if (result) {
                    try {
                      await downloadFile(result.url, a.originalName)
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : 'Download failed.',
                      )
                    }
                  }
                }}
              >
                Download
              </button>
            )}
            {!disabled && !selected.includes(a.id) && (
              <button
                className="danger-link"
                onClick={() =>
                  void command.run(
                    `${root}/assets/${a.id}`,
                    undefined,
                    'DELETE',
                  )
                }
              >
                Delete
              </button>
            )}
          </div>
        ))}
    </div>
  )
}

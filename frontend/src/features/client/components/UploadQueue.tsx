import type {} from '@/features/client/api/clientApi'
import { useUploadQueue, raster } from '@/features/client/hooks/useUploadQueue'
import type { Transfer } from '@/features/client/types/upload.types'
import type { AssetSummary } from '@/features/projects/types/file.types'
import { Notice } from '@/shared/components/Feedback'
import { Badge, ErrorNotice, Field } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { formatBytes } from '@/shared/utils/domain'
import { downloadFile } from '@/shared/utils/download'
import { FileText, FolderOpen } from 'lucide-react'
import { useState } from 'react'
export function UploadQueue({
  client = true,
  root,
  itemId,
  image,
  assets,
  selected,
  onChange,
  disabled,
  live = false,
  allowedExtensions,
  maxFiles,
  onRefresh,
  onReady,
  beforeDelete,
}: {
  client?: boolean
  root: string
  itemId: string
  image: boolean
  assets: AssetSummary[]
  selected: string[]
  onChange: (ids: string[]) => void
  disabled: boolean
  live?: boolean
  allowedExtensions?: string[]
  maxFiles?: number
  onRefresh?: () => void
  onReady?: (id: string) => void
  beforeDelete?: () => Promise<boolean>
}) {
  const command = useCommand(client)
  const [keep, setKeep] = useState(true)
  const [error, setError] = useState('')
  const uploads = useUploadQueue({
    root,
    client,
    itemId,
    disabled,
    selected,
    onChange,
    onReady,
    onRefresh,
  })
  const { queue } = uploads
  function add(files: FileList | null) {
    if (!files || disabled) return
    setError('')
    if (queue.length + files.length > 50) {
      setError('Choose no more than 50 files in a batch.')
      return
    }
    const valid: Transfer[] = []
    if (
      live &&
      maxFiles &&
      assets.filter(
        (a) =>
          ['RESERVED', 'UPLOADED', 'PROCESSING'].includes(a.state) ||
          (a.state === 'READY' && selected.includes(a.id)),
      ).length +
        queue.filter(
          (t) =>
            ['queued', 'uploading'].includes(t.state) &&
            !assets.some((a) => a.id === t.assetId),
        ).length +
        files.length >
        maxFiles
    ) {
      setError(`Choose no more than ${maxFiles} files for this question.`)
      return
    }
    for (const file of files) {
      if (
        live &&
        allowedExtensions?.length &&
        !allowedExtensions
          .map((x) => (x === 'jpeg' ? 'jpg' : x))
          .includes(
            (file.name.split('.').pop()?.toLowerCase() || '').replace(
              /^jpeg$/,
              'jpg',
            ),
          )
      ) {
        setError(
          'This file format is not permitted. Choose a supported format for this question.',
        )
        continue
      }

      if (file.size === 0) {
        setError(`${file.name} is empty. Choose a file containing data.`)
        continue
      }
      if (file.size > (image || raster(file) ? 50 : 100) * 1024 * 1024) {
        setError(
          `${file.name} exceeds ${image || raster(file) ? 50 : 100} MiB.`,
        )
        continue
      }
      valid.push({
        id: crypto.randomUUID(),
        file,
        keepOriginal: raster(file) ? keep : true,
        progress: 0,
        state: 'queued',
      })
    }
    uploads.add(valid)
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
            ? live
              ? 'JPEG and PNG · 50 MiB each'
              : 'JPEG, PNG, WebP, HEIC/HEIF · 50 MiB each'
            : 'JPEG/PNG images · 50 MiB; PDF, DOCX, TXT, SVG · 100 MiB'}
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
            live
              ? allowedExtensions
                  ?.flatMap((x) =>
                    x === 'jpg' || x === 'jpeg' ? ['.jpg', '.jpeg'] : ['.' + x],
                  )
                  .join(',') ||
                (image
                  ? '.jpg,.jpeg,.png'
                  : '.jpg,.jpeg,.png,.pdf,.docx,.txt,.svg')
              : image
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
      {(image ||
        allowedExtensions?.some((x) => ['jpg', 'jpeg', 'png'].includes(x))) && (
        <Field label="Take a photo">
          <input
            type="file"
            accept={live ? 'image/jpeg,image/png' : 'image/*'}
            capture="environment"
            disabled={disabled}
            onChange={(e) => {
              add(e.target.files)
              e.target.value = ''
            }}
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
        {keep
          ? 'Original image bytes stay private and count toward storage. '
          : 'Discarded originals cannot be recovered. '}
        This choice applies to images selected next; documents always retain
        their originals. Only verified ready files can be saved in your draft.
      </small>
      {live && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => void uploads.refreshProcessing()}
          disabled={!uploads.online}
        >
          Refresh file status
        </button>
      )}
      {!uploads.online && (
        <Notice error>
          You’re offline. Selected files stay in this open page. Reconnect, then
          retry interrupted files. Uploads do not continue after closing this
          page.
        </Notice>
      )}
      <p aria-live="polite" aria-atomic="true" className="upload-summary">
        {queue.filter((t) => t.state === 'ready').length} ready ·{' '}
        {
          queue.filter((t) =>
            ['queued', 'uploading', 'processing'].includes(t.state),
          ).length
        }{' '}
        pending · Up to 3 transfers at a time
      </p>
      <ErrorNotice error={uploads.accessError || error || command.error} />
      {queue.some((t) =>
        ['ready', 'failed', 'cancelled'].includes(t.state),
      ) && (
        <button type="button" className="text-link" onClick={uploads.clear}>
          Clear finished rows
        </button>
      )}
      {queue.some((t) => t.state === 'failed') && (
        <Notice error>
          Some files couldn’t be uploaded. Review each error and retry, or
          remove the failed upload.
        </Notice>
      )}
      {queue.map((t) => (
        <div
          className="upload-row"
          key={t.id}
          role="group"
          aria-label={`Upload ${t.file.name}`}
        >
          <FileText size={20} />
          <div className="grow">
            <strong>{t.file.name}</strong>
            <small>
              {formatBytes(t.file.size)} · {t.state}
              {raster(t.file)
                ? t.keepOriginal
                  ? ' · Original retained'
                  : ' · Working copy only'
                : ''}
            </small>
            <progress
              value={t.progress ?? undefined}
              max={100}
              aria-label={`${t.file.name} upload progress`}
            />
            <small>
              {t.state === 'uploading'
                ? t.progress === null
                  ? 'Transferring…'
                  : `${t.progress}% transferred`
                : t.state === 'processing'
                  ? 'Transfer complete. Server verification pending.'
                  : ''}
            </small>
            {t.error && <p role="alert">{t.error}</p>}
          </div>
          {['failed', 'cancelled'].includes(t.state) && (
            <button
              type="button"
              className="secondary-button"
              disabled={
                disabled ||
                !uploads.online ||
                !!uploads.accessError ||
                t.retryable === false
              }
              onClick={() => uploads.retry(t)}
            >
              Retry
            </button>
          )}
          {['failed', 'cancelled'].includes(t.state) && (
            <button
              type="button"
              className="text-link"
              disabled={uploads.isRunning(t.id)}
              onClick={() => uploads.remove(t.id)}
            >
              Remove
            </button>
          )}
          {['queued', 'uploading'].includes(t.state) &&
            !['finalize', 'verify'].includes(t.phase || '') && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void uploads.cancel(t)}
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
                type="button"
                className="text-link"
                onClick={async () => {
                  const variant = a.availableVariants.includes('WORKING')
                    ? 'WORKING'
                    : 'ORIGINAL'
                  const result = await command.run<{ url: string }>(
                    `${root}/assets/${a.id}/download`,
                    { variant },
                  )
                  if (result) {
                    try {
                      await downloadFile(
                        result.url,
                        live && variant === 'WORKING'
                          ? a.originalName.replace(/\.[^.]+$/, '') + '.png'
                          : a.originalName,
                      )
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
            {a.state === 'READY' &&
              a.availableVariants.includes('ORIGINAL') &&
              a.availableVariants.includes('WORKING') && (
                <button
                  type="button"
                  className="text-link"
                  onClick={async () => {
                    const result = await command.run<{ url: string }>(
                      `${root}/assets/${a.id}/download`,
                      { variant: 'ORIGINAL' },
                    )
                    if (result)
                      try {
                        await downloadFile(result.url, a.originalName)
                      } catch {
                        setError(
                          'Original download failed. Check your connection and try again.',
                        )
                      }
                  }}
                >
                  Download original
                </button>
              )}
            {!disabled && !selected.includes(a.id) && (
              <button
                type="button"
                className="danger-link"
                disabled={command.pending}
                onClick={async () => {
                  if (beforeDelete && !(await beforeDelete())) return
                  const result = await command.run(
                    `${root}/assets/${a.id}`,
                    undefined,
                    'DELETE',
                  )
                  if (result) onRefresh?.()
                }}
              >
                Delete
              </button>
            )}
          </div>
        ))}
    </div>
  )
}

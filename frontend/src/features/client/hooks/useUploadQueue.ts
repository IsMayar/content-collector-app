import { fetchLatestAsset } from '../api/clientApi'
import { sendUploadCommand } from '../api/uploadsApi'
import type { Transfer } from '../types/upload.types'
import type { UploadReservation } from '@/features/projects/types/file.types'
import { apiProblem } from '@/shared/utils/apiError'
import { useEffect, useEffectEvent, useRef, useState } from 'react'

export function uploadError(error: unknown) {
  const problem = apiProblem(error)
  const denied =
    [401, 403, 404].includes(problem.status || 0) ||
    problem.code === 'READ_ONLY'
  let message =
    error instanceof Error
      ? error.message
      : 'Connection interrupted. Retry this file when online.'
  if (denied)
    message =
      'Upload access is unavailable. Request a fresh project link or contact your agency.'
  else if (problem.code === 'STORAGE_QUOTA_EXCEEDED')
    message =
      'Not enough workspace storage. Free space or contact your agency before retrying.'
  else if (problem.code === 'UPLOAD_EXPIRED')
    message =
      'This upload reservation expired. Start a new upload; unused reservations are released by the server.'
  else if (problem.status === 422)
    message = 'This file could not be accepted. Check its format and size.'
  return {
    message,
    denied,
    retryable: !denied && problem.status !== 422,
    restart: problem.code === 'UPLOAD_EXPIRED',
  }
}

function waitForScan(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(Error('Upload stopped.'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, 600)
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

export function useUploadQueue({
  root,
  client,
  itemId,
  disabled,
  selected,
  onChange,
  onReady,
  onRefresh,
}: {
  root: string
  client: boolean
  itemId: string
  disabled: boolean
  selected: string[]
  onChange: (ids: string[]) => void
  onReady?: (id: string) => void
  onRefresh?: () => void
}) {
  const [queue, setQueue] = useState<Transfer[]>([])
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  const [accessError, setAccessError] = useState('')
  const rows = useRef(queue)
  const running = useRef(new Set<string>())
  const cancelled = useRef(new Set<string>())
  const reported = useRef(new Set<string>())
  const mounted = useRef(true)
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled
  const callbacks = useRef({ onReady, onChange, onRefresh })
  callbacks.current = { onReady, onChange, onRefresh }
  const blocked = useRef(false)
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  function update(next: Transfer[]) {
    rows.current = next
    if (mounted.current) setQueue(next)
  }
  function patch(id: string, change: Partial<Transfer>) {
    update(
      rows.current.map((row) => (row.id === id ? { ...row, ...change } : row)),
    )
  }
  function current(id: string) {
    return rows.current.find((row) => row.id === id)!
  }
  function ready(id: string, assetId: string) {
    if (!mounted.current) return
    patch(id, { state: 'ready', error: undefined, progress: 100 })
    if (
      !disabledRef.current &&
      !blocked.current &&
      !reported.current.has(assetId)
    ) {
      reported.current.add(assetId)
      if (callbacks.current.onReady) callbacks.current.onReady(assetId)
      else {
        selectedRef.current = [...new Set([...selectedRef.current, assetId])]
        callbacks.current.onChange(selectedRef.current)
      }
    }
    callbacks.current.onRefresh?.()
  }
  function failed(id: string, error: unknown) {
    const result = uploadError(error)
    if (result.denied) {
      blocked.current = true
      if (mounted.current) setAccessError(result.message)
    }
    patch(id, {
      state: 'failed',
      error: result.message,
      retryable: result.retryable,
      restart: result.restart,
    })
  }
  async function cancelKnown(t: Transfer) {
    if (
      !t.reservation ||
      t.phase === 'finalize' ||
      t.phase === 'verify' ||
      t.uploaded
    )
      return
    await sendUploadCommand(
      `${root}/uploads/${t.reservation.uploadId}`,
      undefined,
      'DELETE',
      undefined,
      client,
    )
    patch(t.id, {
      state: 'cancelled',
      cancellationConfirmed: true,
      error: undefined,
    })
    callbacks.current.onRefresh?.()
  }
  async function poll(id: string, signal: AbortSignal) {
    for (let n = 0; n < 40 && mounted.current && !signal.aborted; n++) {
      await waitForScan(signal)
      const t = current(id)
      const result = await fetchLatestAsset(
        `${root}/assets/${t.assetId}`,
        client,
        true,
      )
      if (!mounted.current || signal.aborted) return
      if (result?.state === 'READY') {
        ready(id, t.assetId!)
        return
      }
      if (result && ['FAILED', 'REJECTED', 'DELETED'].includes(result.state)) {
        patch(id, {
          state: 'failed',
          retryable: result.state !== 'REJECTED',
          restart: true,
          error:
            result.rejectionCode === 'MALWARE_DETECTED'
              ? 'Malware detected. This file cannot be used.'
              : result.rejectionCode || 'File verification failed.',
        })
        callbacks.current.onRefresh?.()
        return
      }
    }
    patch(id, {
      state: 'processing',
      error:
        'Verification is still pending. Refresh file status; do not upload this file again.',
    })
  }
  async function transfer(initial: Transfer) {
    const id = initial.id
    const controller = new AbortController()
    patch(id, { state: 'uploading', controller, error: undefined })
    try {
      let t = current(id)
      if (t.assetId) {
        const result = await fetchLatestAsset(
          `${root}/assets/${t.assetId}`,
          client,
          true,
        )
        if (!result)
          throw Error(
            'Could not check the existing upload. Retry status before uploading again.',
          )
        if (result.state === 'READY') {
          ready(id, t.assetId)
          return
        }
        if (['PROCESSING', 'UPLOADED'].includes(result.state)) {
          patch(id, { phase: 'verify', state: 'processing', progress: 100 })
          await poll(id, controller.signal)
          return
        }
        if (['FAILED', 'REJECTED', 'DELETED'].includes(result.state)) {
          patch(id, {
            state: 'failed',
            restart: true,
            retryable: result.state !== 'REJECTED',
            error: 'The previous attempt is unavailable. Start a new upload.',
          })
          callbacks.current.onRefresh?.()
          return
        }
      }
      if (!t.uploaded) {
        patch(id, { phase: 'reserve' })
        const reservation = await sendUploadCommand<UploadReservation>(
          `${root}/uploads`,
          {
            itemId,
            originalName: t.file.name,
            contentType: contentType(t.file),
            bytes: t.file.size,
            keepOriginal: t.keepOriginal ?? true,
          },
          'POST',
          { 'Idempotency-Key': id },
          client,
        )
        if (!reservation)
          throw Error(
            'Reservation failed. Check type, size and workspace quota.',
          )
        patch(id, {
          reservation,
          assetId: reservation.assetId,
          uploadId: reservation.uploadId,
        })
        t = current(id)
        if (cancelled.current.has(id) || !mounted.current) {
          await cancelKnown(t)
          return
        }
        if (disabledRef.current || controller.signal.aborted)
          throw Error(
            'Transfer paused. Retry when access and connection are available.',
          )
        patch(id, { phase: 'transfer', progress: 0 })
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open('PUT', reservation.putUrl)
          xhr.timeout = 120000
          Object.entries(reservation.requiredHeaders).forEach(([key, value]) =>
            xhr.setRequestHeader(key, value),
          )
          xhr.upload.onprogress = (event) =>
            patch(id, {
              progress: event.lengthComputable
                ? Math.min(100, Math.round((event.loaded / event.total) * 100))
                : null,
            })
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? resolve()
              : reject(
                  Error(
                    xhr.status === 403
                      ? 'Upload link expired. Retry to check the existing reservation.'
                      : 'Transfer failed. Retry this file.',
                  ),
                )
          xhr.onerror = () =>
            reject(Error('Connection interrupted. Retry this file.'))
          xhr.ontimeout = () =>
            reject(Error('Transfer timed out. Retry this file.'))
          xhr.onabort = () => reject(Error('Transfer paused or cancelled.'))
          const abort = () => xhr.abort()
          controller.signal.addEventListener('abort', abort, { once: true })
          xhr.onloadend = () =>
            controller.signal.removeEventListener('abort', abort)
          if (controller.signal.aborted) {
            reject(Error('Transfer paused.'))
            return
          }
          xhr.send(t.file)
        })
        patch(id, { uploaded: true, progress: 100 })
      }
      t = current(id)
      if (!mounted.current || cancelled.current.has(id)) return
      if (disabledRef.current || controller.signal.aborted)
        throw Error(
          'Transfer paused. Retry when access and connection are available.',
        )
      // An uncertain finalize response must be reconciled/replayed, never deleted or re-uploaded.
      patch(id, { phase: 'finalize' })
      await sendUploadCommand(
        `${root}/uploads/${t.uploadId}/finalize`,
        {},
        'POST',
        { 'Idempotency-Key': id + '-finalize' },
        client,
      )
      patch(id, { phase: 'verify', state: 'processing', progress: 100 })
      callbacks.current.onRefresh?.()
      await poll(id, controller.signal)
    } catch (error) {
      if (cancelled.current.has(id) || !mounted.current) {
        try {
          await cancelKnown(current(id))
        } catch {
          patch(id, {
            state: 'cancelled',
            error:
              'Cancellation is not confirmed. Check again when online; unused reservations expire on the server.',
          })
        }
      } else failed(id, error)
    } finally {
      running.current.delete(id)
      if (mounted.current) update([...rows.current])
    }
  }
  const begin = useEffectEvent((t: Transfer) => void transfer(t))
  useEffect(() => {
    if (disabled || !online || blocked.current) return
    for (const t of queue) {
      if (running.current.size >= 3) break
      if (t.state === 'queued' && !running.current.has(t.id)) {
        running.current.add(t.id)
        begin(t)
      }
    }
  }, [queue, disabled, online])
  useEffect(() => {
    mounted.current = true
    const cancellationSet = cancelled.current
    const offline = () => {
      setOnline(false)
      for (const t of rows.current) t.controller?.abort()
    }
    const connected = () => setOnline(true)
    window.addEventListener('offline', offline)
    window.addEventListener('online', connected)
    return () => {
      mounted.current = false
      window.removeEventListener('offline', offline)
      window.removeEventListener('online', connected)
      for (const t of rows.current) {
        cancellationSet.add(t.id)
        t.controller?.abort()
      }
    }
  }, [])
  useEffect(() => {
    if (disabled) for (const t of rows.current) t.controller?.abort()
  }, [disabled])
  async function retry(t: Transfer) {
    if (disabled || !online || blocked.current || running.current.has(t.id))
      return
    cancelled.current.delete(t.id)
    if (t.restart || t.cancellationConfirmed) {
      if (t.reservation && !t.uploaded && !t.cancellationConfirmed) {
        try {
          await cancelKnown(t)
        } catch (error) {
          failed(t.id, error)
          return
        }
      }
      const next = {
        id: crypto.randomUUID(),
        file: t.file,
        keepOriginal: t.keepOriginal,
        progress: 0,
        state: 'queued' as const,
      }
      update(rows.current.map((row) => (row.id === t.id ? next : row)))
    } else patch(t.id, { state: 'queued', error: undefined })
  }
  async function cancel(t: Transfer) {
    cancelled.current.add(t.id)
    t.controller?.abort()
    patch(t.id, { state: 'cancelled', retryable: true })
    if (running.current.has(t.id)) return
    try {
      await cancelKnown(t)
      if (!t.reservation) patch(t.id, { cancellationConfirmed: true })
    } catch {
      patch(t.id, {
        error:
          'Cancellation is not confirmed. Check again when online; unused reservations expire on the server.',
      })
    }
  }
  async function refreshProcessing() {
    for (const t of rows.current) {
      if (
        !t.assetId ||
        running.current.has(t.id) ||
        !['processing', 'failed'].includes(t.state)
      )
        continue
      try {
        const result = await fetchLatestAsset(
          `${root}/assets/${t.assetId}`,
          client,
          true,
        )
        if (!mounted.current) return
        if (result?.state === 'READY') ready(t.id, t.assetId)
        else if (
          result &&
          ['REJECTED', 'FAILED', 'DELETED'].includes(result.state)
        )
          patch(t.id, {
            state: 'failed',
            restart: true,
            retryable: result.state !== 'REJECTED',
            error: result.rejectionCode || 'File verification failed.',
          })
      } catch (error) {
        failed(t.id, error)
        if (blocked.current) break
      }
    }
    callbacks.current.onRefresh?.()
  }
  return {
    queue,
    online,
    accessError,
    add: (files: Transfer[]) => update([...rows.current, ...files]),
    retry,
    cancel,
    refreshProcessing,
    isRunning: (id: string) => running.current.has(id),
    remove: (id: string) => {
      if (!running.current.has(id))
        update(rows.current.filter((row) => row.id !== id))
    },
    clear: () =>
      update(
        rows.current.filter(
          (row) =>
            !['ready', 'failed', 'cancelled'].includes(row.state) ||
            running.current.has(row.id),
        ),
      ),
  }
}

const mime: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
  txt: 'text/plain',
  svg: 'image/svg+xml',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}
export function contentType(file: File) {
  return (
    file.type ||
    mime[file.name.split('.').pop()?.toLowerCase() || ''] ||
    'application/octet-stream'
  )
}
export function raster(file: File) {
  return [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ].includes(contentType(file))
}

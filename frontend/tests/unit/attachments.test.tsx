import {
  render,
  screen,
  waitFor,
  act,
  fireEvent,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { UploadQueue } from '@/features/client/components/UploadQueue'
import type { AssetSummary } from '@/features/projects/types/file.types'
const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  latest: vi.fn(),
  download: vi.fn(),
}))
vi.mock('@/features/client/api/uploadsApi', () => ({
  sendUploadCommand: mocks.run,
}))
vi.mock('@/shared/utils/download', () => ({ downloadFile: mocks.download }))
vi.mock('@/shared/hooks/useCommand', () => ({
  useCommand: () => ({ run: mocks.run, error: '', pending: false }),
}))
vi.mock('@/features/client/api/clientApi', () => ({
  fetchLatestAsset: mocks.latest,
}))
const id = '77777777-7777-4777-8777-777777777777'
const asset: AssetSummary = {
  id,
  itemId: id,
  originalName: 'saved.txt',
  contentType: 'text/plain',
  state: 'READY',
  sourceBytes: 10,
  retainedBytes: 10,
  keepOriginal: true,
  availableVariants: ['ORIGINAL'],
  rejectionCode: null,
}
class Transfer {
  static sent: Transfer[] = []
  static automatic = true
  aborted = false
  upload: {
    onprogress?: (event: {
      lengthComputable: boolean
      loaded: number
      total: number
    }) => void
  } = {}
  status = 200
  onload?: () => void
  onerror?: () => void
  onabort?: () => void
  open = vi.fn()
  setRequestHeader = vi.fn()
  abort() {
    this.aborted = true
    this.onabort?.()
  }
  send() {
    Transfer.sent.push(this)
    if (!Transfer.automatic) return
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 })
      this.onload?.()
    })
  }
}
beforeEach(() => {
  mocks.run.mockReset()
  mocks.download.mockReset()
  mocks.latest.mockReset()
  Transfer.sent = []
  Transfer.automatic = true
  vi.stubGlobal('XMLHttpRequest', Transfer)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
function mount(props: Partial<Parameters<typeof UploadQueue>[0]> = {}) {
  return render(
    <UploadQueue
      root="client/projects/synthetic"
      itemId={id}
      image={false}
      assets={[]}
      selected={[]}
      onChange={vi.fn()}
      disabled={false}
      live
      allowedExtensions={['txt']}
      maxFiles={2}
      {...props}
    />,
  )
}
it('rejects empty files before allocating a reservation', async () => {
  mount()
  await userEvent.upload(
    screen.getByLabelText('Choose project files'),
    new File([], 'empty.txt', { type: 'text/plain' }),
  )
  expect(await screen.findByText(/is empty/)).toBeVisible()
  expect(mocks.run).not.toHaveBeenCalled()
})
it('keeps upload controls disabled when access is unavailable', () => {
  mount({ disabled: true })
  expect(screen.getByLabelText('Choose project files')).toBeDisabled()
})
it('counts existing pending files against the question limit', async () => {
  mount({ assets: [{ ...asset, state: 'PROCESSING' }], maxFiles: 1 })
  await userEvent.upload(
    screen.getByLabelText('Choose project files'),
    new File(['data'], 'notes.txt', { type: 'text/plain' }),
  )
  expect(await screen.findByText(/no more than 1 files/)).toBeVisible()
  expect(mocks.run).not.toHaveBeenCalled()
})
it('does not select an attachment until the server reports READY', async () => {
  const onReady = vi.fn()
  mocks.run
    .mockResolvedValueOnce({
      assetId: id,
      uploadId: 'upload',
      putUrl: 'https://storage.example.test/signed',
      requiredHeaders: { 'x-test': 'signed' },
    })
    .mockResolvedValueOnce({ state: 'PROCESSING' })
  mocks.latest.mockResolvedValue({ ...asset, state: 'READY' })
  mount({ onReady })
  await userEvent.upload(
    screen.getByLabelText('Choose project files'),
    new File(['data'], 'notes.txt', { type: 'text/plain' }),
  )
  await waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(2))
  expect(onReady).not.toHaveBeenCalled()
  await waitFor(() => expect(onReady).toHaveBeenCalledWith(id))
  expect(mocks.run.mock.calls[0][3]).toEqual({
    'Idempotency-Key': expect.any(String),
  })
  expect(mocks.run.mock.calls[1][0]).toContain('/uploads/upload/finalize')
  expect(Transfer.sent).toHaveLength(1)
})
it('does not cancel a finalized server job when scanning rejects the file', async () => {
  mocks.run
    .mockResolvedValueOnce({
      assetId: id,
      uploadId: 'upload',
      putUrl: 'https://storage.example.test/signed',
      requiredHeaders: {},
    })
    .mockResolvedValueOnce({ state: 'PROCESSING' })
  mocks.latest.mockResolvedValue({
    ...asset,
    state: 'REJECTED',
    rejectionCode: 'MALWARE_DETECTED',
  })
  const onReady = vi.fn()
  const refresh = vi.fn()
  mount({ onReady, onRefresh: refresh })
  await userEvent.upload(
    screen.getByLabelText('Choose project files'),
    new File(['data'], 'notes.txt', { type: 'text/plain' }),
  )
  expect(
    await screen.findByText('Malware detected. This file cannot be used.'),
  ).toBeVisible()
  expect(onReady).not.toHaveBeenCalled()
  expect(refresh).toHaveBeenCalledTimes(2)
  expect(mocks.run.mock.calls.some((call) => call[2] === 'DELETE')).toBe(false)
})
it('requires the pending answer save to finish before deleting a file', async () => {
  const beforeDelete = vi.fn().mockResolvedValue(false)
  mount({ assets: [asset], beforeDelete })
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
  expect(beforeDelete).toHaveBeenCalledOnce()
  expect(mocks.run).not.toHaveBeenCalled()
})
it('removes an unused attachment and refreshes persisted metadata', async () => {
  const refresh = vi.fn()
  mocks.run.mockResolvedValue({})
  mount({
    assets: [asset],
    beforeDelete: () => Promise.resolve(true),
    onRefresh: refresh,
  })
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  expect(mocks.run).toHaveBeenCalledWith(
    'client/projects/synthetic/assets/' + id,
    undefined,
    'DELETE',
  )
})
it('offers no delete action while a file is selected in the answer', () => {
  mount({ assets: [asset], selected: [id] })
  expect(
    screen.queryByRole('button', { name: 'Delete' }),
  ).not.toBeInTheDocument()
})

it('keeps retry disabled when upload access becomes read-only', async () => {
  mocks.run.mockResolvedValue(undefined)
  const view = mount()
  await userEvent.upload(
    screen.getByLabelText('Choose project files'),
    new File(['data'], 'notes.txt', { type: 'text/plain' }),
  )
  await screen.findByRole('button', { name: 'Retry' })
  view.rerender(
    <UploadQueue
      root="client/projects/synthetic"
      itemId={id}
      image={false}
      assets={[]}
      selected={[]}
      onChange={vi.fn()}
      disabled
      live
      allowedExtensions={['txt']}
      maxFiles={2}
    />,
  )
  expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled()
  expect(screen.getByLabelText('Choose project files')).toBeDisabled()
})
it('downloads a live PNG working copy with its actual format extension', async () => {
  mocks.run.mockResolvedValue({ url: 'https://storage.example.test/private' })
  mocks.download.mockResolvedValue(undefined)
  mount({
    image: true,
    assets: [
      {
        ...asset,
        originalName: 'camera.jpg',
        contentType: 'image/jpeg',
        keepOriginal: false,
        availableVariants: ['WORKING', 'THUMBNAIL'],
      },
    ],
  })
  await userEvent.click(screen.getByRole('button', { name: 'Download' }))
  await waitFor(() =>
    expect(mocks.download).toHaveBeenCalledWith(
      'https://storage.example.test/private',
      'camera.png',
    ),
  )
})

it('refreshes a slow finalized job instead of allocating a duplicate upload', async () => {
  vi.useFakeTimers()
  mocks.run
    .mockResolvedValueOnce({
      assetId: id,
      uploadId: 'upload',
      putUrl: 'https://storage.example.test/signed',
      requiredHeaders: {},
    })
    .mockResolvedValueOnce({ state: 'PROCESSING' })
  mocks.latest.mockResolvedValue({ ...asset, state: 'PROCESSING' })
  const ready = vi.fn()
  mount({ onReady: ready })
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Choose project files'), {
      target: {
        files: [new File(['data'], 'notes.txt', { type: 'text/plain' })],
      },
    })
  })
  expect(mocks.run).toHaveBeenCalledTimes(2)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(25000)
  })
  expect(screen.getByText(/Verification is still pending/)).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Retry' }),
  ).not.toBeInTheDocument()
  expect(ready).not.toHaveBeenCalled()
  mocks.latest.mockResolvedValue({ ...asset, state: 'READY' })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Refresh file status' }))
  })
  expect(ready).toHaveBeenCalledWith(id)
  expect(mocks.run).toHaveBeenCalledTimes(2)
})

function reservations() {
  let index = 0
  mocks.run.mockImplementation(async (path: string) => {
    if (path.endsWith('/uploads'))
      return {
        assetId: `asset-${++index}`,
        uploadId: `upload-${index}`,
        putUrl: 'https://storage.example.test/signed',
        requiredHeaders: {},
      }
    return {}
  })
  mocks.latest.mockResolvedValue({ ...asset, state: 'READY' })
}
function row(name: string) {
  return screen.getByRole('group', { name: `Upload ${name}` })
}

it('limits active transfers to three, freezes queued original choices and cancels pending files', async () => {
  Transfer.automatic = false
  reservations()
  const view = mount({ image: true, allowedExtensions: ['png'], maxFiles: 5 })
  await userEvent.upload(
    screen.getByLabelText('Choose images from library or files'),
    [1, 2, 3, 4].map(
      (n) => new File(['image'], `photo-${n}.png`, { type: 'image/png' }),
    ),
  )
  await waitFor(() => expect(Transfer.sent).toHaveLength(3))
  await userEvent.click(screen.getByLabelText('Keep originals for this upload'))
  expect(
    mocks.run.mock.calls
      .filter((c) => c[0].endsWith('/uploads'))
      .every((c) => c[1].keepOriginal),
  ).toBe(true)
  await userEvent.click(
    within(row('photo-4.png')).getByRole('button', { name: 'Cancel' }),
  )
  await userEvent.click(
    within(row('photo-1.png')).getByRole('button', { name: 'Cancel' }),
  )
  await waitFor(() => expect(Transfer.sent[0].aborted).toBe(true))
  expect(Transfer.sent).toHaveLength(3)
  expect(
    mocks.run.mock.calls.some(
      (c) => c[2] === 'DELETE' && c[0].endsWith('upload-1'),
    ),
  ).toBe(true)
  await act(async () => view.unmount())
})

it('shows real byte progress and indeterminate transfer instead of invented percentages', async () => {
  Transfer.automatic = false
  reservations()
  const view = mount()
  await userEvent.upload(
    screen.getByLabelText('Choose project files'),
    new File(['data'], 'bytes.txt', { type: 'text/plain' }),
  )
  await waitFor(() => expect(Transfer.sent).toHaveLength(1))
  act(() =>
    Transfer.sent[0].upload.onprogress?.({
      lengthComputable: false,
      loaded: 0,
      total: 0,
    }),
  )
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('value')
  act(() =>
    Transfer.sent[0].upload.onprogress?.({
      lengthComputable: true,
      loaded: 72,
      total: 100,
    }),
  )
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '72')
  await act(async () => view.unmount())
})

it('retries an interrupted transfer with the same reservation intent and original choice', async () => {
  Transfer.automatic = false
  const reservation = {
    assetId: id,
    uploadId: 'upload',
    putUrl: 'https://storage.example.test/signed',
    requiredHeaders: {},
  }
  mocks.run.mockImplementation(async (path: string) =>
    path.endsWith('/uploads') ? reservation : {},
  )
  mocks.latest
    .mockResolvedValueOnce({ ...asset, state: 'RESERVED' })
    .mockResolvedValue({ ...asset, state: 'READY' })
  const ready = vi.fn()
  mount({ onReady: ready })
  await userEvent.upload(
    screen.getByLabelText('Choose project files'),
    new File(['data'], 'retry.txt', { type: 'text/plain' }),
  )
  await waitFor(() => expect(Transfer.sent).toHaveLength(1))
  act(() => Transfer.sent[0].onerror?.())
  await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(Transfer.sent).toHaveLength(2))
  const calls = mocks.run.mock.calls.filter((c) => c[0].endsWith('/uploads'))
  expect(calls).toHaveLength(2)
  expect(calls[0][3]).toEqual(calls[1][3])
  expect(calls[0][1]).toEqual(calls[1][1])
  expect(mocks.run.mock.calls.some((c) => c[2] === 'DELETE')).toBe(false)
  act(() => Transfer.sent[1].onload?.())
  await waitFor(() => expect(ready).toHaveBeenCalledWith(id))
})

it('reconciles an uncertain finalize response without deleting or uploading the file twice', async () => {
  mocks.run
    .mockResolvedValueOnce({
      assetId: id,
      uploadId: 'upload',
      putUrl: 'https://storage.example.test/signed',
      requiredHeaders: {},
    })
    .mockRejectedValueOnce({ status: 'FETCH_ERROR' })
  mocks.latest.mockResolvedValue({ ...asset, state: 'READY' })
  const ready = vi.fn()
  mount({ onReady: ready })
  await userEvent.upload(
    screen.getByLabelText('Choose project files'),
    new File(['data'], 'finalize.txt', { type: 'text/plain' }),
  )
  await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(ready).toHaveBeenCalledWith(id))
  expect(Transfer.sent).toHaveLength(1)
  expect(mocks.run).toHaveBeenCalledTimes(2)
})

it('keeps files while offline and resumes queued work only when the connection returns', async () => {
  reservations()
  const ready = vi.fn()
  mount({ onReady: ready })
  act(() => window.dispatchEvent(new Event('offline')))
  await userEvent.upload(
    screen.getByLabelText('Choose project files'),
    new File(['data'], 'offline.txt', { type: 'text/plain' }),
  )
  expect(mocks.run).not.toHaveBeenCalled()
  expect(
    screen.getByText(/Selected files stay in this open page/),
  ).toBeVisible()
  act(() => window.dispatchEvent(new Event('online')))
  await waitFor(() => expect(ready).toHaveBeenCalled())
})

it('stops unauthorized retries and preserves a clear session recovery message', async () => {
  mocks.run.mockRejectedValue({
    status: 401,
    data: { code: 'CLIENT_ACCESS_UNAVAILABLE' },
  })
  mount()
  await userEvent.upload(
    screen.getByLabelText('Choose project files'),
    new File(['data'], 'private.txt', { type: 'text/plain' }),
  )
  expect(await screen.findByRole('button', { name: 'Retry' })).toBeDisabled()
  expect(
    screen.getAllByText(/Request a fresh project link/).length,
  ).toBeGreaterThan(0)
  expect(mocks.run).toHaveBeenCalledOnce()
  expect(Transfer.sent).toHaveLength(0)
})

it('explains quota exhaustion and keeps the selected file for a deliberate retry', async () => {
  mocks.run.mockRejectedValue({
    status: 409,
    data: { code: 'STORAGE_QUOTA_EXCEEDED' },
  })
  mount()
  await userEvent.upload(
    screen.getByLabelText('Choose project files'),
    new File(['data'], 'quota.txt', { type: 'text/plain' }),
  )
  expect(await screen.findByText(/Not enough workspace storage/)).toBeVisible()
  expect(row('quota.txt')).toBeVisible()
  expect(mocks.run).toHaveBeenCalledOnce()
})

it('snapshots opt-out for images and offers a separate original download', async () => {
  reservations()
  const ready = vi.fn()
  mount({
    onReady: ready,
    image: true,
    allowedExtensions: ['png'],
    assets: [
      {
        ...asset,
        originalName: 'source.png',
        contentType: 'image/png',
        availableVariants: ['ORIGINAL', 'WORKING'],
      },
    ],
  })
  await userEvent.click(screen.getByLabelText('Keep originals for this upload'))
  expect(
    screen.getByText(/Discarded originals cannot be recovered/),
  ).toBeVisible()
  await userEvent.upload(
    screen.getByLabelText('Choose images from library or files'),
    new File(['data'], 'small.png', { type: 'image/png' }),
  )
  await waitFor(() => expect(ready).toHaveBeenCalled())
  expect(
    mocks.run.mock.calls.find((c) => c[0].endsWith('/uploads'))?.[1]
      .keepOriginal,
  ).toBe(false)
  await userEvent.click(
    screen.getByRole('button', { name: 'Download original' }),
  )
  expect(mocks.run.mock.calls.some((c) => c[1]?.variant === 'ORIGINAL')).toBe(
    true,
  )
})

it('retries an uncertain reservation with the same intent and preserves document originals', async () => {
  reservations()
  const reserve = mocks.run.getMockImplementation()!
  let first = true
  mocks.run.mockImplementation((...args) => {
    if (first) {
      first = false
      return Promise.reject({ status: 'FETCH_ERROR' })
    }
    return reserve(...args)
  })
  const ready = vi.fn()
  mount({ onReady: ready })
  await userEvent.click(screen.getByLabelText('Keep originals for this upload'))
  await userEvent.upload(
    screen.getByLabelText('Choose project files'),
    new File(['data'], 'uncertain.txt', { type: 'text/plain' }),
  )
  await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(ready).toHaveBeenCalled())
  const calls = mocks.run.mock.calls.filter((c) => c[0].endsWith('/uploads'))
  expect(calls).toHaveLength(2)
  expect(calls[0][1]).toEqual(calls[1][1])
  expect(calls[0][1].keepOriginal).toBe(true)
  expect(calls[0][3]).toEqual(calls[1][3])
  expect(Transfer.sent).toHaveLength(1)
})

it('aborts and releases a known unfinalized transfer on unmount', async () => {
  reservations()
  Transfer.automatic = false
  const view = mount()
  await userEvent.upload(
    screen.getByLabelText('Choose project files'),
    new File(['data'], 'leaving.txt', { type: 'text/plain' }),
  )
  await waitFor(() => expect(Transfer.sent).toHaveLength(1))
  view.unmount()
  await waitFor(() =>
    expect(mocks.run.mock.calls.some((c) => c[2] === 'DELETE')).toBe(true),
  )
  expect(Transfer.sent[0].aborted).toBe(true)
  expect(mocks.run.mock.calls.some((c) => c[0].endsWith('/finalize'))).toBe(
    false,
  )
})

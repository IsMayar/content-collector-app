import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { UploadQueue } from '@/features/client/components/UploadQueue'
import type { AssetSummary } from '@/features/projects/types/file.types'
const mocks = vi.hoisted(() => ({ run: vi.fn(), latest: vi.fn() }))
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
    this.onabort?.()
  }
  send() {
    Transfer.sent.push(this)
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 })
      this.onload?.()
    })
  }
}
beforeEach(() => {
  mocks.run.mockReset()
  mocks.latest.mockReset()
  Transfer.sent = []
  vi.stubGlobal('XMLHttpRequest', Transfer)
})
afterEach(() => vi.unstubAllGlobals())
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
  mount({ onReady })
  await userEvent.upload(
    screen.getByLabelText('Choose project files'),
    new File(['data'], 'notes.txt', { type: 'text/plain' }),
  )
  expect(await screen.findByText('MALWARE_DETECTED')).toBeVisible()
  expect(onReady).not.toHaveBeenCalled()
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

import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { UploadQueue } from '@/features/client/components/UploadQueue'
import type { AssetSummary } from '@/features/projects/types/file.types'

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  refreshProcessing: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/features/client/hooks/useUploadQueue', () => ({
  raster: () => true,
  useUploadQueue: () => ({
    queue: [],
    online: true,
    accessError: '',
    add: mocks.add,
    refreshProcessing: mocks.refreshProcessing,
    isRunning: () => false,
  }),
}))
vi.mock('@/shared/hooks/useCommand', () => ({
  useCommand: () => ({ run: vi.fn(), error: '', pending: false }),
}))

const props = {
  root: 'client/projects/example',
  itemId: 'photo',
  image: true,
  assets: [],
  selected: [],
  onChange: vi.fn(),
  disabled: false,
  live: true,
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('uses one upload picker and retains originals automatically', () => {
  const { container } = render(<UploadQueue {...props} simplified />)
  expect(container.querySelectorAll('input[type=file]')).toHaveLength(1)
  expect(screen.queryByText('Take a photo')).toBeNull()
  expect(screen.queryByText('Keep originals for this upload')).toBeNull()
  expect(screen.queryByText('Refresh file status')).toBeNull()
  expect(screen.queryByText(/0 ready/)).toBeNull()
  const file = new File(['image'], 'photo.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText('Choose images from library or files'), {
    target: { files: [file] },
  })
  expect(mocks.add).toHaveBeenCalledWith([
    expect.objectContaining({ file, keepOriginal: true, state: 'queued' }),
  ])
})

it('checks pending assets automatically without a manual refresh button', async () => {
  vi.useFakeTimers()
  const pending = { id: 'asset', state: 'PROCESSING' } as AssetSummary
  render(<UploadQueue {...props} simplified assets={[pending]} />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000)
  })
  expect(mocks.refreshProcessing).toHaveBeenCalledWith(true)
})

it('preserves the existing controls outside the simplified client form', () => {
  const { container } = render(<UploadQueue {...props} />)
  expect(container.querySelectorAll('input[type=file]')).toHaveLength(2)
  expect(screen.getByText('Keep originals for this upload')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Refresh file status' })).toBeVisible()
})

import { renderHook, act, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useInteraction } from '@/features/client/hooks/useInteraction'
import { interactionApi } from '@/features/client/api/interactionApi'
const { record, unwrap } = vi.hoisted(() => ({
  record: vi.fn(),
  unwrap: vi.fn(),
}))
vi.mock('@/features/client/api/interactionApi', async (original) => ({
  ...(await original<typeof import('@/features/client/api/interactionApi')>()),
  useRecordInteractionMutation: () => [record],
}))
beforeEach(() => {
  record.mockReset()
  unwrap.mockReset().mockResolvedValue({ accepted: 1 })
  record.mockReturnValue({ unwrap })
})
it('sends only opaque IDs and allowed types, deduplicating locally', () => {
  const { result } = renderHook(() => useInteraction('project'))
  act(() => {
    result.current()
    result.current()
    result.current('item')
    result.current('item')
  })
  expect(record).toHaveBeenCalledTimes(2)
  expect(record.mock.calls[0][0]).toEqual({
    projectId: 'project',
    event: { clientEventId: expect.any(String), type: 'project_opened' },
  })
  expect(record.mock.calls[1][0]).toEqual({
    projectId: 'project',
    event: {
      clientEventId: expect.any(String),
      type: 'item_started',
      itemId: 'item',
    },
  })
})
it('isolates projects and allows a later interaction after telemetry fails', async () => {
  unwrap.mockRejectedValueOnce(new Error('offline'))
  const { result, rerender } = renderHook(({ id }) => useInteraction(id), {
    initialProps: { id: 'one' },
  })
  act(() => result.current('item'))
  await waitFor(() => expect(unwrap).toHaveBeenCalledOnce())
  await act(async () => {
    await Promise.resolve()
  })
  act(() => result.current('item'))
  rerender({ id: 'two' })
  act(() => result.current('item'))
  expect(record).toHaveBeenCalledTimes(3)
  expect(record.mock.calls[2][0].projectId).toBe('two')
})
it('uses the existing client transport endpoint', () => {
  expect(interactionApi.endpoints.recordInteraction).toBeDefined()
})

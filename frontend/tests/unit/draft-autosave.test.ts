import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DraftAutosave,
  clearPendingDrafts,
  pendingDrafts,
} from '@/features/client/hooks/draftAutosave'
import type {
  Answer,
  SaveAnswerCommand,
} from '@/features/client/types/client.types'
function answer(command: SaveAnswerCommand, version = 1): { answer: Answer } {
  return {
    answer: {
      itemId: 'item',
      value: command.value,
      version,
      savedAt: '2026-10-30T00:00:00Z',
    },
  }
}
describe('server-confirmed client draft autosave', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    clearPendingDrafts()
    vi.useRealTimers()
  })
  it('debounces for 800ms and never claims Saved before acknowledgement', async () => {
    const send = vi.fn(async (c: SaveAnswerCommand) => answer(c))
    const d = new DraftAutosave({ text: '' }, 0, 1, send)
    d.edit({ text: 'Hello' })
    expect(d.state.status).toBe('Unsaved changes')
    await vi.advanceTimersByTimeAsync(799)
    expect(send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(d.state.status).toMatch(/^Saved at/)
    expect(d.state.version).toBe(1)
  })
  it('serializes rapid typing and sends latest value using the acknowledged version', async () => {
    let release!: (v: { answer: Answer }) => void
    const send = vi
      .fn<(c: SaveAnswerCommand) => Promise<{ answer: Answer }>>()
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            release = r
          }),
      )
      .mockImplementation(async (c) => answer(c, 2))
    const d = new DraftAutosave({ text: '' }, 0, 1, send)
    d.edit({ text: 'One' })
    const first = d.flush()
    d.edit({ text: 'Two' })
    d.edit({ text: 'Three' })
    expect(send).toHaveBeenCalledTimes(1)
    release(answer(send.mock.calls[0][0]))
    await first
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1][0]).toMatchObject({
      value: { text: 'Three' },
      expectedVersion: 1,
    })
    expect(d.state.value).toEqual({ text: 'Three' })
    expect(d.state.version).toBe(2)
    expect(d.state.dirty).toBe(false)
  })
  it('flush waits for a pending save before navigation', async () => {
    let release!: (v: { answer: Answer }) => void
    const send = vi.fn(
      (c: SaveAnswerCommand) =>
        new Promise<{ answer: Answer }>((r) => {
          release = () => r(answer(c))
        }),
    )
    const d = new DraftAutosave({ text: '' }, 0, 1, send)
    d.edit({ text: 'Pending' })
    const a = d.flush()
    const b = d.flush()
    expect(d.state.status).toBe('Saving…')
    release({ answer: {} as Answer })
    expect(await a).toBe(true)
    expect(await b).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('retries uncertain network failures with the same operation and bounded backoff', async () => {
    const send = vi.fn().mockRejectedValue({ status: 'FETCH_ERROR' })
    const d = new DraftAutosave({ text: '' }, 0, 1, send)
    d.edit({ text: 'Keep locally' })
    expect(await d.flush()).toBe(false)
    await vi.advanceTimersByTimeAsync(3001)
    expect(send).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(60000)
    expect(send).toHaveBeenCalledTimes(3)
    expect(new Set(send.mock.calls.map((c) => c[0].saveOperationId)).size).toBe(
      1,
    )
    expect(d.state.value).toEqual({ text: 'Keep locally' })
    expect(d.state.dirty).toBe(true)
  })
  it('manual retry confirms persistence after a lost response', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce({ status: 'FETCH_ERROR' })
      .mockImplementation(async (c: SaveAnswerCommand) => answer(c))
    const d = new DraftAutosave({ text: '' }, 0, 1, send)
    d.edit({ text: 'Retry' })
    await d.flush()
    expect(await d.flush()).toBe(true)
    expect(send.mock.calls[1][0].saveOperationId).toBe(
      send.mock.calls[0][0].saveOperationId,
    )
    expect(d.state.dirty).toBe(false)
  })
  it('keeps new input while retrying an uncertain older operation', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce({ status: 'FETCH_ERROR' })
      .mockImplementation(async (c: SaveAnswerCommand) =>
        answer(c, c.expectedVersion + 1),
      )
    const d = new DraftAutosave({ text: '' }, 0, 1, send)
    d.edit({ text: 'Old' })
    await d.flush()
    d.edit({ text: 'New' })
    await d.flush()
    expect(send.mock.calls[1][0].value).toEqual({ text: 'Old' })
    expect(send.mock.calls[2][0]).toMatchObject({
      value: { text: 'New' },
      expectedVersion: 1,
    })
    expect(d.state.value).toEqual({ text: 'New' })
  })
  it.each([401, 403, 422, 409])(
    'does not auto-retry rejected writes (%s)',
    async (status) => {
      const send = vi
        .fn()
        .mockRejectedValue({ status, data: { detail: 'Safe server message' } })
      const d = new DraftAutosave({ text: '' }, 0, 1, send)
      d.edit({ text: 'Retained' })
      await d.flush()
      await vi.advanceTimersByTimeAsync(60000)
      expect(send).toHaveBeenCalledTimes(1)
      expect(d.state.dirty).toBe(true)
      expect(d.state.error).not.toBe('')
      expect(d.state.status).not.toMatch(/^Saved/)
    },
  )
  it('offers explicit conflict reconciliation without replacing local input', async () => {
    const d = new DraftAutosave(
      { text: 'Local' },
      3,
      1,
      vi.fn(async (c: SaveAnswerCommand) => answer(c, 5)),
    )
    d.edit({ text: 'Unsent' })
    d.compare({
      itemId: 'item',
      value: { text: 'Server' },
      version: 4,
      savedAt: '2026-10-30T00:00:00Z',
    })
    expect(d.state.value).toEqual({ text: 'Unsent' })
    expect(await d.flush()).toBe(false)
    d.keepLocal()
    await d.flush()
    expect(d.state.version).toBe(5)
    expect(d.state.value).toEqual({ text: 'Unsent' })
  })
  it('loads a saved version only by explicit choice', () => {
    const d = new DraftAutosave({ text: 'Local' }, 0, 1, vi.fn())
    d.compare({
      itemId: 'item',
      value: { text: 'Server' },
      version: 7,
      savedAt: '2026-10-30T00:00:00Z',
    })
    d.loadServer()
    expect(d.state.value).toEqual({ text: 'Server' })
    expect(d.state.version).toBe(7)
    expect(d.state.dirty).toBe(false)
  })
  it('respects the rate-limit wait before retrying', async () => {
    const send = vi.fn().mockRejectedValue({ status: 429, retryAfter: 90 })
    const d = new DraftAutosave({ text: '' }, 0, 1, send)
    d.edit({ text: 'Wait' })
    await d.flush()
    await vi.advanceTimersByTimeAsync(89999)
    expect(send).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(send).toHaveBeenCalledTimes(2)
  })
  it('preserves explicit clear separately from an empty string', async () => {
    const send = vi.fn(async (c: SaveAnswerCommand) => answer(c))
    const d = new DraftAutosave({ text: 'old' }, 0, 1, send)
    d.edit({} as { text: string })
    await d.flush()
    expect(send.mock.calls[0][0].value).toEqual({})
  })
  it('keeps recovery only in memory and clears it on explicit logout', () => {
    const d = new DraftAutosave({ text: 'Private' }, 1, 1, vi.fn())
    pendingDrafts.set('project/item', d)
    clearPendingDrafts()
    expect(pendingDrafts.size).toBe(0)
  })
  it('freezes conflicting writes until the user compares and explicitly reconciles', async () => {
    const send = vi.fn().mockRejectedValue({ status: 409 })
    const d = new DraftAutosave({ text: '' }, 0, 1, send)
    d.edit({ text: 'Local' })
    await d.flush()
    await d.flush()
    d.edit({ text: 'Keep edits' })
    await vi.advanceTimersByTimeAsync(800)
    expect(send).toHaveBeenCalledTimes(1)
    expect(d.state.value).toEqual({ text: 'Keep edits' })
  })
})

it('adopts server-confirmed AI acceptance without a second autosave and keeps concurrent local edits', async () => {
  const send = vi.fn()
  const saved = {
    itemId: 'item',
    value: { text: 'AI proposal' },
    version: 2,
    savedAt: '2026-11-02T00:00:00Z',
  }
  const draft = new DraftAutosave({ text: 'Original' }, 1, 1, send)
  expect(draft.applyAccepted(saved, 1)).toBe(true)
  expect(draft.state.value).toEqual(saved.value)
  expect(draft.state.dirty).toBe(false)
  expect(send).not.toHaveBeenCalled()
  draft.edit({ text: 'New local words' })
  expect(draft.applyAccepted({ ...saved, version: 3 }, 2)).toBe(false)
  expect(draft.state.value).toEqual({ text: 'New local words' })
  expect(draft.state.conflict?.version).toBe(3)
  draft.pause()
})

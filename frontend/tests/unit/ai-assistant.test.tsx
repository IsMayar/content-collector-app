import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { AiAssistant } from '@/features/ai/components/AiAssistant'
const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  job: undefined as unknown,
  error: '',
}))
const id = '77777777-7777-4777-8777-777777777777',
  jobId = '88888888-8888-4888-8888-888888888888'
const result = {
  id: jobId,
  itemId: id,
  state: 'SUCCEEDED',
  baseAnswerVersion: 1,
  result: {
    draft: 'AI generated proposal',
    factsUsed: ['A real fact'],
    missingFacts: [],
    warnings: ['Review every claim'],
  },
  failureCode: null,
}
vi.mock('@/shared/hooks/useCommand', () => ({
  useCommand: () => ({ run: mocks.run, pending: false, error: mocks.error }),
}))
vi.mock('@/services/api/resourceApi', () => ({
  usePortalData: (path: string) => ({
    data: path ? { job: mocks.job } : undefined,
    isError: false,
  }),
}))
beforeEach(() => {
  mocks.run.mockReset()
  mocks.job = result
  mocks.error = ''
})
function mount(dirty = false, version = 1) {
  const accepted = vi.fn()
  const view = render(
    <AiAssistant
      root="client/projects/test"
      item={{
        id,
        ai: { enabled: true, targetWords: 150 },
        answer: { value: { text: 'My original answer' } },
      }}
      answerVersion={version}
      dirty={dirty}
      onAccepted={accepted}
    />,
  )
  return { ...view, accepted }
}
async function generate() {
  await userEvent.type(
    screen.getByLabelText('Facts to include (one per line)'),
    'A real fact',
  )
  await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(
    screen.getByRole('button', { name: 'Draft from my notes' }),
  )
}
async function preview() {
  mocks.run.mockResolvedValueOnce({ jobId, state: 'QUEUED' })
  const view = mount()
  await generate()
  await screen.findByText('AI generated proposal')
  return view
}
it('requires separate explicit confirmation and server acknowledgment to save a draft', async () => {
  const { accepted } = await preview()
  expect(accepted).not.toHaveBeenCalled()
  expect(screen.getByText('My original answer')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Use this draft' }))
  expect(mocks.run).toHaveBeenCalledTimes(1)
  let finish!: (value: unknown) => void
  mocks.run.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await userEvent.click(screen.getByRole('button', { name: 'Save as draft' }))
  expect(accepted).not.toHaveBeenCalled()
  expect(mocks.run.mock.calls[1][0]).toMatch(/\/accept$/)
  expect(mocks.run.mock.calls[1][1]).toEqual({ expectedAnswerVersion: 1 })
  finish({
    answer: {
      itemId: id,
      value: { text: result.result.draft },
      version: 2,
      savedAt: '2026-11-02T00:00:00Z',
    },
  })
  await waitFor(() => expect(accepted).toHaveBeenCalledTimes(1))
  expect(screen.getByText(/has not been submitted/)).toBeVisible()
  expect(screen.getByText('My original answer')).toBeVisible()
})
it('discards without any mutation and preserves supplied notes', async () => {
  const { accepted } = await preview()
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard suggestion' }),
  )
  expect(mocks.run).toHaveBeenCalledTimes(1)
  expect(accepted).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Facts to include (one per line)')).toHaveValue(
    'A real fact',
  )
  expect(screen.getByText(/Suggestion discarded/)).toBeVisible()
})
it('blocks acceptance after the current answer version changes', async () => {
  mocks.job = { ...result, baseAnswerVersion: 0 }
  await preview()
  expect(screen.getByRole('button', { name: 'Use this draft' })).toBeDisabled()
  expect(screen.getByText(/newer answer will be kept/)).toBeVisible()
  expect(mocks.run).toHaveBeenCalledTimes(1)
})
it.each(['QUEUED', 'FAILED', 'REFUSED', 'EXPIRED'])(
  'keeps ordinary writing independent of %s suggestions',
  async (state) => {
    mocks.job = { ...result, state, result: null }
    mocks.run.mockResolvedValue({ jobId, state: 'QUEUED' })
    const { accepted } = mount()
    await generate()
    expect(screen.getByText(state)).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Use this draft' }),
    ).not.toBeInTheDocument()
    expect(accepted).not.toHaveBeenCalled()
  },
)
it('reconciles an uncertain acceptance with its original idempotency key', async () => {
  const { accepted } = await preview()
  mocks.run.mockImplementationOnce(async () => {
    mocks.job = { ...result, state: 'ACCEPTED' }
    return undefined
  })
  await userEvent.click(screen.getByRole('button', { name: 'Use this draft' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save as draft' }))
  expect(accepted).not.toHaveBeenCalled()
  const key = mocks.run.mock.calls[1][3]['Idempotency-Key']
  mocks.run.mockResolvedValueOnce({
    answer: {
      itemId: id,
      value: { text: result.result.draft },
      version: 2,
      savedAt: '2026-11-02T00:00:00Z',
    },
  })
  await userEvent.click(screen.getByRole('button', { name: 'Save as draft' }))
  expect(mocks.run.mock.calls[2][3]['Idempotency-Key']).toBe(key)
  expect(accepted).toHaveBeenCalledTimes(1)
})
it('never accepts an incompatible response as a saved answer', async () => {
  const { accepted } = await preview()
  mocks.run.mockResolvedValueOnce({ answer: { value: { text: 'unverified' } } })
  await userEvent.click(screen.getByRole('button', { name: 'Use this draft' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save as draft' }))
  expect(accepted).not.toHaveBeenCalled()
  expect(screen.getByText(/incompatible acceptance response/)).toBeVisible()
})
it('blocks generation while local draft content is unsaved', async () => {
  mount(true)
  expect(
    screen.getByRole('button', { name: 'Draft from my notes' }),
  ).toBeDisabled()
  expect(mocks.run).not.toHaveBeenCalled()
})

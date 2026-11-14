import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { LiveRevisionReview } from '@/features/review/components/LiveReviewPanel'
import {
  decisionResultSchema,
  clientCommentSchema,
} from '@/features/review/schemas/reviewSchema'
import { apiProblem, errorMessage } from '@/shared/utils/apiError'
const mocks = vi.hoisted(() => ({ run: vi.fn(), selected: '', error: '' }))
const id = '77777777-7777-4777-8777-777777777777',
  revisionId = '88888888-8888-4888-8888-888888888888'
const item = {
  id,
  sectionId: id,
  key: 'intro',
  label: 'Introduction',
  type: 'SHORT_TEXT' as const,
  instructions: '',
  example: '',
  required: true,
  enabled: true,
  validation: {},
  sortOrder: 0,
  version: 4,
  state: 'SUBMITTED' as const,
  currentRevisionId: revisionId,
  visible: true,
}
const revision = {
  revisionId,
  itemId: id,
  itemKey: 'intro',
  revisionNo: 2,
  submittedAt: '2026-11-01T10:00:00Z',
  submittedByContactId: id,
  structureVersion: 1,
  schemaSnapshot: item,
  valueSnapshot: { text: 'Exact immutable submission' },
  assets: [],
}
const result = {
  item: { id, state: 'APPROVED', version: 5 },
  decision: {
    id,
    revisionId,
    decision: 'APPROVE',
    reason: null,
    reviewedAt: '2026-11-01T11:00:00Z',
    reviewerDisplayName: 'Reviewer',
  },
}
vi.mock('@/shared/hooks/useCommand', () => ({
  useCommand: () => ({ run: mocks.run, pending: false, error: mocks.error }),
}))
vi.mock('@/services/api/resourceApi', () => ({
  useData: (path: string) => ({
    data: path.endsWith('/comments')
      ? { data: [] }
      : path.endsWith('/revisions')
        ? { data: [revision] }
        : { revision, decisions: [] },
    isFetching: false,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))
beforeEach(() => {
  mocks.run.mockReset()
  mocks.error = ''
})
function mount(overrides: Partial<typeof item> = {}) {
  return render(
    <LiveRevisionReview
      root="workspaces/test/projects/test"
      item={{ ...item, ...overrides }}
      initialRevision={
        overrides.currentRevisionId === id ? revisionId : undefined
      }
    />,
  )
}
it('requires explicit confirmation and server acknowledgment for an exact approval', async () => {
  let finish!: (value: typeof result) => void
  mocks.run.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  mount()
  expect(screen.getByText('Exact immutable submission')).toBeVisible()
  await userEvent.click(
    screen.getByRole('button', { name: 'Approve revision' }),
  )
  expect(mocks.run).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: /^Approve$/ }))
  expect(
    screen.queryByText('Exact submitted revision approved.'),
  ).not.toBeInTheDocument()
  expect(mocks.run.mock.calls[0][1]).toMatchObject({
    revisionId,
    expectedItemVersion: 4,
    decision: 'APPROVE',
  })
  finish(result)
  expect(
    await screen.findByText('Exact submitted revision approved.'),
  ).toBeVisible()
})
it('requires client-visible feedback and retains the same key on uncertain retries', async () => {
  mocks.run.mockResolvedValue(undefined)
  mount()
  await userEvent.click(screen.getByRole('button', { name: 'Request changes' }))
  await userEvent.click(screen.getByRole('button', { name: 'Send feedback' }))
  expect(mocks.run).not.toHaveBeenCalled()
  await userEvent.type(
    screen.getByLabelText('Feedback shared with the client'),
    'Please clarify your services.',
  )
  await userEvent.click(screen.getByRole('button', { name: 'Send feedback' }))
  await userEvent.click(screen.getByRole('button', { name: 'Send feedback' }))
  expect(mocks.run).toHaveBeenCalledTimes(2)
  expect(mocks.run.mock.calls[0][3]).toEqual(mocks.run.mock.calls[1][3])
  expect(mocks.run.mock.calls[0][1].reason).toBe(
    'Please clarify your services.',
  )
  expect(
    screen.queryByText(/Changes requested. Your feedback/),
  ).not.toBeInTheDocument()
})
it('does not permit decisions on a historical revision or an approved item', () => {
  const view = mount({ currentRevisionId: id })
  expect(
    screen.getByRole('button', { name: 'Approve revision' }),
  ).toBeDisabled()
  view.unmount()
  mount({ state: 'APPROVED' as typeof item.state })
  expect(screen.getByRole('button', { name: 'Request changes' })).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Reopen approved item' }),
  ).toBeEnabled()
})
it('rejects incompatible decision responses rather than claiming success', async () => {
  mocks.run.mockResolvedValue({
    ...result,
    decision: { ...result.decision, revisionId: id },
  })
  mount()
  await userEvent.click(
    screen.getByRole('button', { name: 'Approve revision' }),
  )
  await userEvent.click(screen.getByRole('button', { name: /^Approve$/ }))
  await waitFor(() =>
    expect(
      screen.getAllByText(/response could not be verified/).length,
    ).toBeGreaterThan(0),
  )
  expect(
    screen.queryByText('Exact submitted revision approved.'),
  ).not.toBeInTheDocument()
})
it('validates review response contracts and preserves safe error recovery', () => {
  expect(decisionResultSchema.safeParse(result).success).toBe(true)
  expect(
    decisionResultSchema.safeParse({
      ...result,
      item: { ...result.item, state: 'DRAFT' },
    }).success,
  ).toBe(false)
  expect(
    errorMessage({ status: 409, data: { code: 'ITEM_VERSION_CONFLICT' } }),
  ).toContain('Refresh the current revision')
  expect(
    apiProblem({ status: 403, data: { code: 'REVIEW_FORBIDDEN' } }).status,
  ).toBe(403)
  expect(
    clientCommentSchema.parse({
      id,
      body: 'Shared',
      authorDisplayName: 'Reviewer',
      createdAt: 'now',
      revisionId,
      visibility: 'INTERNAL',
    }),
  ).not.toHaveProperty('visibility')
})

it('rejects a response whose item state contradicts the confirmed decision', async () => {
  mocks.run.mockResolvedValue({
    ...result,
    item: { ...result.item, state: 'CHANGES_REQUESTED' },
  })
  mount()
  await userEvent.click(
    screen.getByRole('button', { name: 'Approve revision' }),
  )
  await userEvent.click(screen.getByRole('button', { name: /^Approve$/ }))
  await waitFor(() =>
    expect(
      screen.getAllByText(/response could not be verified/).length,
    ).toBeGreaterThan(0),
  )
  expect(
    screen.queryByText('Exact submitted revision approved.'),
  ).not.toBeInTheDocument()
})

it('requires a reason and server confirmation before reopening an exact approved item', async () => {
  mocks.run.mockResolvedValue({ item: { id, state: 'DRAFT', version: 6 } })
  mount({ state: 'APPROVED' as typeof item.state })
  await userEvent.click(
    screen.getByRole('button', { name: 'Reopen approved item' }),
  )
  await userEvent.click(screen.getByRole('button', { name: 'Reopen item' }))
  expect(mocks.run).not.toHaveBeenCalled()
  await userEvent.type(
    screen.getByLabelText('Feedback shared with the client'),
    'Please update your approved answer.',
  )
  await userEvent.click(screen.getByRole('button', { name: 'Reopen item' }))
  expect(
    await screen.findByText(
      'Item reopened. Historical approvals remain unchanged.',
    ),
  ).toBeVisible()
  expect(mocks.run.mock.calls[0][0]).toMatch(/\/reopen$/)
  expect(mocks.run.mock.calls[0][1].expectedItemVersion).toBe(4)
})

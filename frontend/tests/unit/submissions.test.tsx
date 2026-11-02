import { submissionSummarySchema } from '@/features/client/schemas/submissionSchema'
import { SubmissionValidationSummary } from '@/features/client/components/SubmissionValidationSummary'
import { collectionSchema } from '@/features/client/schemas/collectionSchema'
import { SubmittedAnswer } from '@/shared/components/SubmittedAnswer'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { SubmissionControls } from '@/features/client/components/SubmissionControls'
import { hasSavedAnswer } from '@/features/client/components/SubmissionValidationSummary'
import {
  DraftAutosave,
  pendingDrafts,
} from '@/features/client/hooks/draftAutosave'
const mocks = vi.hoisted(() => ({ run: vi.fn(), read: vi.fn(), error: '' }))
vi.mock('@/shared/hooks/useCommand', () => ({
  useCommand: () => ({ run: mocks.run, error: mocks.error, pending: false }),
}))
vi.mock('@/features/client/api/clientAnswersApi', () => ({
  useLazyReadDraftQuery: () => [mocks.read],
}))
const id = '77777777-7777-4777-8777-777777777777'
const baseItem: Parameters<typeof SubmissionControls>[0]['item'] = {
  id,
  key: 'intro',
  label: 'Introduction',
  type: 'SHORT_TEXT',
  instructions: '',
  example: '',
  required: true,
  enabled: true,
  validation: {},
  visible: true,
  version: 3,
  state: 'DRAFT',
  canEdit: true,
  assets: [],
  answer: null,
  comments: [],
}
function mount(
  overrides: Partial<Parameters<typeof SubmissionControls>[0]> = {},
) {
  const draft = new DraftAutosave({ text: 'Saved answer' }, 1, 2, vi.fn())
  const props = {
    item: {
      ...baseItem,
      id,
      label: 'Introduction',
      state: 'DRAFT',
      version: 3,
      canEdit: true,
      assets: [],
    } as Parameters<typeof SubmissionControls>[0]['item'],
    projectId: id,
    structureVersion: 2,
    draft,
    canRespond: true,
    onRefresh: vi.fn(),
    onBusyChange: vi.fn(),
    ...overrides,
  }
  render(<SubmissionControls {...props} />)
  return props
}
beforeEach(() => {
  mocks.run.mockReset()
  mocks.read.mockReset()
  mocks.error = ''
  mocks.read.mockReturnValue({
    unwrap: async () => ({ answer: { version: 1 } }),
  })
  pendingDrafts.clear()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})
afterEach(() => {
  pendingDrafts.clear()
  vi.restoreAllMocks()
})
async function confirm() {
  await userEvent.click(
    screen.getByRole('button', { name: 'Review and submit' }),
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit for review' }),
  )
}
it('requires explicit confirmation without submitting automatically', async () => {
  mount()
  await userEvent.click(
    screen.getByRole('button', { name: 'Review and submit' }),
  )
  expect(
    screen.getByRole('group', { name: 'Confirm submission' }),
  ).toBeVisible()
  expect(mocks.run).not.toHaveBeenCalled()
})
it('waits for all project autosaves before reading the final answer', async () => {
  let finish!: (value: boolean) => void
  const draft = new DraftAutosave({ text: 'Local' }, 0, 2, vi.fn())
  vi.spyOn(draft, 'flush').mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  pendingDrafts.set(id + '/other', draft)
  mount()
  await confirm()
  expect(mocks.read).not.toHaveBeenCalled()
  finish(true)
  await waitFor(() => expect(mocks.read).toHaveBeenCalled())
})
it('does not submit unresolved saves', async () => {
  const d = new DraftAutosave({ text: '' }, 0, 2, vi.fn())
  vi.spyOn(d, 'flush').mockResolvedValue(false)
  pendingDrafts.set(id + '/other', d)
  mount()
  await confirm()
  expect(await screen.findByText(/Save or reconcile/)).toBeVisible()
  expect(mocks.run).not.toHaveBeenCalled()
})
it('prevents duplicate clicks while the server is processing', async () => {
  let finish!: (value: undefined) => void
  mocks.run.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  mount()
  await confirm()
  fireEvent.click(screen.getByRole('button', { name: 'Submitting…' }))
  expect(mocks.run).toHaveBeenCalledTimes(1)
  finish(undefined)
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Submit for review' }),
    ).toBeEnabled(),
  )
})
it('confirms only a valid committed server revision', async () => {
  mocks.run.mockResolvedValue({
    revisionId: id,
    revisionNo: 1,
    itemVersion: 4,
    state: 'SUBMITTED',
  })
  const p = mount()
  await confirm()
  expect(await screen.findByText(/Submitted successfully/)).toBeVisible()
  expect(p.onRefresh).toHaveBeenCalledOnce()
  expect(mocks.run.mock.calls[0][1]).toEqual({
    expectedAnswerVersion: 1,
    expectedStructureVersion: 2,
  })
})
it('does not claim success for malformed confirmation', async () => {
  mocks.run.mockResolvedValue({})
  const p = mount()
  await confirm()
  expect(
    await screen.findByText(/confirmation could not be verified/),
  ).toBeVisible()
  expect(p.onRefresh).not.toHaveBeenCalled()
})
it('does not confirm network failure and retains the retry key', async () => {
  mocks.run.mockResolvedValue(undefined)
  mount()
  await confirm()
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit for review' }),
  )
  expect(mocks.run.mock.calls[0][3]).toEqual(mocks.run.mock.calls[1][3])
  expect(screen.queryByText(/Submitted successfully/)).not.toBeInTheDocument()
})
it('handles offline state without any mutation', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  mount()
  await confirm()
  expect(await screen.findByText(/You are offline/)).toBeVisible()
  expect(mocks.run).not.toHaveBeenCalled()
})
it('disables submission for pending file verification', () => {
  mount({
    item: {
      ...baseItem,
      id,
      label: 'Files',
      state: 'DRAFT',
      canEdit: true,
      assets: [{ state: 'PROCESSING' }],
    } as Parameters<typeof SubmissionControls>[0]['item'],
  })
  expect(
    screen.getByRole('button', { name: 'Review and submit' }),
  ).toBeDisabled()
})
it('renders submitted items read-only after reload and permits explicit withdrawal', async () => {
  mocks.run.mockResolvedValue({ state: 'DRAFT', itemVersion: 5 })
  mount({
    item: {
      ...baseItem,
      id,
      label: 'Introduction',
      state: 'SUBMITTED',
      version: 4,
      canEdit: false,
      assets: [],
    } as Parameters<typeof SubmissionControls>[0]['item'],
  })
  expect(
    screen.queryByRole('button', { name: 'Review and submit' }),
  ).not.toBeInTheDocument()
  await userEvent.click(
    screen.getByRole('button', { name: 'Withdraw to edit' }),
  )
  expect(mocks.run.mock.calls[0][0]).toMatch(/withdraw$/)
  expect(mocks.run.mock.calls[0][1]).toEqual({ expectedItemVersion: 4 })
})
it('does not allow actions without a live write capability', () => {
  mount({ canRespond: false })
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
it('explains requested revisions without changing history automatically', () => {
  mount({
    item: {
      ...baseItem,
      id,
      label: 'Introduction',
      state: 'CHANGES_REQUESTED',
      version: 4,
      canEdit: true,
      assets: [],
    } as Parameters<typeof SubmissionControls>[0]['item'],
  })
  expect(
    screen.getByText(/Update your draft before submitting a new revision/),
  ).toBeVisible()
  expect(mocks.run).not.toHaveBeenCalled()
})
it('announces server validation or session failure accessibly', () => {
  mocks.error = 'This project session expired.'
  mount()
  expect(screen.getByRole('alert')).toHaveTextContent('expired')
})
it('detects missing saved answers without treating numeric text as empty', () => {
  expect(hasSavedAnswer({ text: '  ' })).toBe(false)
  expect(hasSavedAnswer({ assetIds: [] })).toBe(false)
  expect(hasSavedAnswer({ text: '0' })).toBe(true)
  expect(hasSavedAnswer({ rows: [{}] })).toBe(true)
})

it('groups missing saved required answers by section and focuses their navigation target', async () => {
  const select = vi.fn()
  const data = collectionSchema.parse({
    collection: true,
    project: {
      id,
      title: 'Synthetic project',
      projectType: 'WEBSITE',
      state: 'ACTIVE',
      dueDate: '2026-12-01',
      structureVersion: 2,
      agencyDisplayName: 'Synthetic agency',
      aiEnabled: false,
    },
    sections: [{ id, key: 'home', title: 'Home', items: [baseItem] }],
    capabilities: { canRespond: true, canUpload: false, canSubmit: true },
    progress: {
      requiredTotal: 1,
      submittedRequired: 0,
      approvedRequired: 0,
      clientActionRequired: 1,
      optionalApproved: 0,
    },
  })
  render(<SubmissionValidationSummary data={data} onSelect={select} />)
  await userEvent.click(
    screen.getByText('View required questions without saved answers'),
  )
  expect(screen.getByRole('heading', { name: 'Home' })).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Introduction' }))
  expect(select).toHaveBeenCalledWith(id, id)
})
it('renders submitted files without exposing internal UUID values', () => {
  render(
    <SubmittedAnswer schema={{ type: 'FILE' }} value={{ assetIds: [id] }} />,
  )
  expect(screen.getByText('1 submitted files')).toBeVisible()
  expect(screen.queryByText(id)).not.toBeInTheDocument()
})

it('preserves existing full revision fields when validating summary-compatible history', () => {
  const full = {
    revisionId: id,
    itemId: id,
    itemKey: 'intro',
    revisionNo: 1,
    submittedAt: '2026-10-31T00:00:00Z',
    schemaSnapshot: { label: 'Introduction', type: 'SHORT_TEXT' },
    valueSnapshot: { text: 'Immutable answer' },
    assets: [],
  }
  const parsed = submissionSummarySchema.parse(full)
  expect(parsed.schemaSnapshot).toEqual(full.schemaSnapshot)
  expect(parsed.valueSnapshot).toEqual(full.valueSnapshot)
})

it('shows approved content as read-only until explicit agency reopening', () => {
  mount({ item: { ...baseItem, state: 'APPROVED', canEdit: false } })
  expect(
    screen.getByText(
      'Approved. This revision is read-only until your agency explicitly reopens it.',
    ),
  ).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Withdraw to edit' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Review and submit' }),
  ).not.toBeInTheDocument()
})

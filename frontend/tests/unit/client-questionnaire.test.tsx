import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TypedValue } from '@/features/client/components/TypedValue'
import { ClientSubmissionHistory } from '@/features/client/components/ClientSubmissionHistory'
import { ClientDraftField } from '@/features/client/components/ClientDraftField'
import { pendingDrafts } from '@/features/client/hooks/draftAutosave'
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  comments: vi.fn(),
}))
vi.mock('@/features/client/api/clientAnswersApi', () => ({
  useLazyReadDraftQuery: () => [
    mocks.read,
    { isUninitialized: false, currentData: { revisions: [] } },
  ],
  useSaveDraftMutation: () => [mocks.save],
}))
vi.mock('@/features/client/hooks/useInteraction', () => ({
  useInteraction: () => vi.fn(),
}))
vi.mock('@/features/client/components/SubmissionControls', () => ({
  SubmissionControls: () => null,
}))
vi.mock('@/features/ai/components/AiAssistant', () => ({
  AiAssistant: () => null,
}))
vi.mock('@/features/review/components/ClientComments', () => ({
  ClientComments: () => {
    mocks.comments()
    return <p>Client messages</p>
  },
}))
vi.mock('@/shared/components/Feedback', () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    onCancel,
  }: {
    open: boolean
    onConfirm: () => void
    onCancel: () => void
  }) =>
    open ? (
      <div role="dialog">
        <button onClick={onCancel}>Cancel</button>
        <button onClick={onConfirm}>Confirm clear</button>
      </div>
    ) : null,
}))
vi.mock('@/features/client/components/UploadQueue', () => ({
  UploadQueue: () => <p>Authorized upload queue</p>,
}))
afterEach(() => {
  cleanup()
  pendingDrafts.forEach((d) => d.pause())
  pendingDrafts.clear()
  vi.clearAllMocks()
})
const item = {
  id: 'question',
  key: 'intro',
  label: 'Introduction',
  type: 'LONG_TEXT' as const,
  required: true,
  enabled: true,
  visible: true as const,
  version: 1,
  state: 'DRAFT' as const,
  canEdit: true,
  validation: { maxLength: 500 },
  assets: [],
  comments: [],
  instructions: '',
  example: '',
  answer: {
    itemId: 'question',
    value: { text: 'Keep this answer' },
    version: 1,
    savedAt: '2026-11-14T10:00:00Z',
  },
}
it('uses a compact long answer and preserves its character limit', () => {
  render(
    <TypedValue
      item={item}
      value={{ text: 'Hello' }}
      onChange={vi.fn()}
      disabled={false}
      root="client/projects/test"
    />,
  )
  expect(screen.getByRole('textbox')).toHaveAttribute('rows', '5')
  expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', '500')
})
it('keeps denied live uploads disabled without mislabelling the project as preview', () => {
  render(
    <TypedValue
      item={{ ...item, type: 'IMAGE' }}
      value={{ assetIds: [] }}
      onChange={vi.fn()}
      disabled={false}
      root="client/projects/test"
      uploadsUnavailable
    />,
  )
  expect(
    screen.getByText(/Uploads are currently unavailable/),
  ).toBeInTheDocument()
  expect(screen.queryByText(/unavailable in preview/)).not.toBeInTheDocument()
  expect(screen.queryByText('Authorized upload queue')).not.toBeInTheDocument()
})
it('retains the authorized queue when live uploads are allowed', () => {
  render(
    <TypedValue
      item={{ ...item, type: 'IMAGE' }}
      value={{ assetIds: [] }}
      onChange={vi.fn()}
      disabled={false}
      root="client/projects/test"
      liveUploads
    />,
  )
  expect(screen.getByText('Authorized upload queue')).toBeInTheDocument()
})
it('does not request history until a relevant history disclosure is opened', async () => {
  render(
    <ClientSubmissionHistory
      projectId="p"
      itemId="i"
      active
      hasSavedAnswer
      currentState="DRAFT"
    />,
  )
  expect(mocks.read).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('History'))
  await waitFor(() =>
    expect(mocks.read).toHaveBeenCalledWith(
      { projectId: 'p', itemId: 'i' },
      false,
    ),
  )
})
it('protects clear with cancellation and defers conversation requests', async () => {
  render(
    <ClientDraftField
      item={item}
      expanded
      onToggle={vi.fn()}
      projectId="p"
      structureVersion={1}
      onSaved={vi.fn()}
    />,
  )
  expect(mocks.comments).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Clear answer' }))
  expect(screen.getByRole('textbox')).toHaveValue('Keep this answer')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('textbox')).toHaveValue('Keep this answer')
  fireEvent.click(screen.getByRole('button', { name: 'Clear answer' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm clear' }))
  expect(screen.getByRole('textbox')).toHaveValue('')
  expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes')
  fireEvent.click(screen.getByText('Conversation'))
  await waitFor(() => expect(mocks.comments).toHaveBeenCalled())
})

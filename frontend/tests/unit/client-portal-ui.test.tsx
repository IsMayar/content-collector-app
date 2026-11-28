import { render, screen, fireEvent } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { CollectionPortal } from '@/features/client/components/CollectionPortal'
import { TypedValue } from '@/features/client/components/TypedValue'
import { collectionSchema } from '@/features/client/schemas/collectionSchema'

const mocks = vi.hoisted(() => ({
  interaction: vi.fn(),
  run: vi.fn(),
}))

vi.mock('@/features/client/hooks/useInteraction', () => ({
  useInteraction: () => mocks.interaction,
}))
vi.mock('@/shared/hooks/useCommand', () => ({
  useCommand: () => ({ run: mocks.run, error: '', pending: false }),
}))
vi.mock('@/features/client/components/ClientDraftField', () => ({
  ClientDraftField: ({ item }: { item: { label: string } }) => (
    <div>{item.label}</div>
  ),
}))
vi.mock('@/features/client/components/UnsavedDraftRecovery', () => ({
  UnsavedDraftRecovery: () => null,
}))
vi.mock('@/features/client/components/ClientPreferences', () => ({
  ClientPreferences: () => null,
}))
vi.mock('@/features/client/components/UploadQueue', () => ({
  UploadQueue: () => null,
}))

const id = '77777777-7777-4777-8777-777777777777'
const item = {
  id,
  key: 'intro',
  label: 'Introduction',
  type: 'LONG_TEXT' as const,
  instructions: '',
  example: '',
  required: true,
  enabled: true,
  validation: {},
  visible: true,
  version: 3,
  state: 'NOT_STARTED',
  canEdit: true,
  assets: [],
  answer: null,
  comments: [],
}

it('shows progress and sections without the missing-answer warning', () => {
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
    sections: [{ id, key: 'home', title: 'Home', items: [item] }],
    capabilities: { canRespond: true, canUpload: false, canSubmit: true },
    progress: {
      requiredTotal: 1,
      submittedRequired: 0,
      approvedRequired: 0,
      clientActionRequired: 1,
      optionalApproved: 0,
    },
  })
  const { container } = render(
    <MemoryRouter>
      <CollectionPortal data={data} onRefresh={vi.fn()} />
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { name: 'Synthetic project' })).toBeVisible()
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '0')
  expect(screen.getByRole('navigation', { name: 'Requested sections' })).toBeVisible()
  expect(container.querySelector('.client-readiness')).toBeNull()
  expect(screen.queryByText(/required answers without saved content/)).toBeNull()
  expect(screen.getByLabelText('Project options')).toBeVisible()
})

it('formats selected lines as plain text through the existing answer callback', () => {
  const onChange = vi.fn()
  render(
    <TypedValue
      item={item}
      value={{ text: 'First\nSecond' }}
      onChange={onChange}
      disabled={false}
      compact
      root="client/projects/example"
    />,
  )
  const input = screen.getByRole('textbox', {
    name: 'Introduction',
  }) as HTMLTextAreaElement
  input.setSelectionRange(0, input.value.length)
  fireEvent.click(screen.getByRole('button', { name: 'Bulleted list' }))
  expect(onChange).toHaveBeenCalledWith({ text: '• First\n• Second' })
})

it('does not expose text formatting for locked answers', () => {
  render(
    <TypedValue
      item={item}
      value={{ text: 'Approved content' }}
      onChange={vi.fn()}
      disabled
      compact
      root="client/projects/example"
    />,
  )
  expect(screen.getByRole('textbox', { name: 'Introduction' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Bulleted list' })).toBeNull()
})

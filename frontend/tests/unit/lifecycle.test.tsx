import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { LiveCompletionPanel } from '@/features/projects/components/LiveCompletionPanel'
import type { Project } from '@/features/projects/types/project.types'
const progress = {
  requiredTotal: 2,
  submittedRequired: 2,
  approvedRequired: 1,
  clientActionRequired: 0,
  optionalApproved: 0,
}
function mount(state: Project['state'] = 'ACTIVE', counts = progress) {
  const action = vi.fn()
  render(
    <MemoryRouter>
      <LiveCompletionPanel
        project={{ state, progress: counts } as Project}
        onAction={action}
      />
    </MemoryRouter>,
  )
  return action
}
it('does not offer completion until every visible required item is approved', () => {
  mount()
  expect(
    screen.getByRole('button', { name: 'Mark project completed' }),
  ).toBeDisabled()
})
it('requires explicit completion when all required items are approved', async () => {
  const action = mount('ACTIVE', { ...progress, approvedRequired: 2 })
  expect(action).not.toHaveBeenCalled()
  await userEvent.click(
    screen.getByRole('button', { name: 'Mark project completed' }),
  )
  expect(action).toHaveBeenCalledWith('complete')
})
it('allows zero required items consistently with the server evaluator', () => {
  mount('ACTIVE', { ...progress, requiredTotal: 0, approvedRequired: 0 })
  expect(
    screen.getByRole('button', { name: 'Mark project completed' }),
  ).toBeEnabled()
})
it('provides reason-bearing project reopening and restores archives only to paused', async () => {
  const action = mount('COMPLETED')
  await userEvent.click(screen.getByRole('button', { name: 'Reopen project' }))
  expect(action).toHaveBeenCalledWith('reopen')
})
it('offers archive restoration without inventing export or deletion features', async () => {
  const action = mount('ARCHIVED')
  await userEvent.click(
    screen.getByRole('button', { name: 'Restore to paused' }),
  )
  expect(action).toHaveBeenCalledWith('restore')
  expect(
    screen.queryByRole('button', { name: /complete|delete|export/i }),
  ).not.toBeInTheDocument()
})

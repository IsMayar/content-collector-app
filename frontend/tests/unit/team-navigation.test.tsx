import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { TeamPage } from '@/features/workspace/pages/TeamPage'
const fake = vi.hoisted(() => ({
  owner: true,
  run: vi.fn(),
  dispatch: vi.fn(),
}))
vi.mock('@/shared/hooks/useWorkspace', () => ({
  useWorkspace: () => ({ id: 'w', owner: fake.owner }),
}))
vi.mock('@/shared/hooks/useAppStore', () => ({
  useAppDispatch: () => fake.dispatch,
}))
vi.mock('@/shared/hooks/useCommand', () => ({
  useCommand: () => ({ run: fake.run, pending: false, error: '' }),
}))
vi.mock('@/services/api/resourceApi', () => ({
  useData: (path: string) => ({
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
    data: path.endsWith('/members')
      ? {
          data: [
            {
              id: 'owner',
              role: 'OWNER',
              state: 'ACTIVE',
              user: { displayName: 'Alex', email: 'alex@example.test' },
            },
            {
              id: 'member',
              role: 'MEMBER',
              state: 'ACTIVE',
              user: { displayName: 'Sam', email: 'sam@example.test' },
            },
          ],
          pendingInvites: [],
        }
      : path.includes('/projects?')
        ? { data: [], page: { totalElements: 0 } }
        : { entitlements: { seats: 5 } },
  }),
}))
beforeEach(() => {
  fake.owner = true
  fake.run.mockReset().mockResolvedValue(undefined)
})
function show() {
  render(
    <MemoryRouter>
      <TeamPage />
    </MemoryRouter>,
  )
}
it('places ownership once below members and retains password and confirmation before mutation', async () => {
  const user = userEvent.setup()
  show()
  expect(
    screen.getAllByRole('heading', { name: 'Workspace ownership' }),
  ).toHaveLength(1)
  expect(screen.getByText('Sam')).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('New owner'), 'member')
  await user.type(
    screen.getByLabelText('Confirm your password'),
    'local-fixture-password',
  )
  await user.click(
    screen.getByRole('button', { name: 'Transfer workspace ownership' }),
  )
  expect(fake.run).not.toHaveBeenCalled()
  const dialog = screen.getByRole('dialog', {
    name: 'Transfer workspace ownership?',
  })
  await user.click(
    within(dialog).getByRole('button', { name: 'Transfer ownership' }),
  )
  expect(fake.run).toHaveBeenCalledWith(
    'workspaces/w/ownership-transfer',
    { targetMemberId: 'member', currentPassword: 'local-fixture-password' },
    'POST',
    { 'Idempotency-Key': expect.any(String) },
  )
})
it('preserves the invitation form and member removal confirmation', async () => {
  const user = userEvent.setup()
  show()
  await user.click(screen.getByRole('button', { name: /Invite member/ }))
  const invite = screen.getByRole('dialog', { name: 'Invite a team member' })
  expect(within(invite).getByLabelText('Teammate email')).toBeInTheDocument()
  await user.click(within(invite).getByRole('button', { name: 'Cancel' }))
  await user.click(screen.getByRole('button', { name: 'Remove access' }))
  expect(
    screen.getByRole('dialog', { name: 'Remove team member?' }),
  ).toBeInTheDocument()
  expect(fake.run).not.toHaveBeenCalled()
})
it('denies member management and ownership controls to non-owners', () => {
  fake.owner = false
  show()
  expect(screen.getByText('Owner access required')).toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: 'Workspace ownership' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /Invite member/ }),
  ).not.toBeInTheDocument()
})

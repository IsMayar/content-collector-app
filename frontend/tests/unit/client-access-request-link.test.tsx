import { createAppStore } from '@/app/store/store'
import { ClientAccessPage } from '@/features/client/pages/ClientAccessPage'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'

const command = vi.hoisted(() => ({
  run: vi.fn(),
  pending: false,
  error: '',
}))

vi.mock('@/shared/hooks/useCommand', () => ({
  useCommand: () => command,
}))

beforeEach(() => {
  command.run.mockReset().mockResolvedValue({
    message:
      'If this address has active access, a new link will be emailed. Please check your inbox.',
  })
})

it('keeps the request confirmation visible until the client returns to the invitation', async () => {
  const projectId = '33333333-3333-4333-8333-333333333333'
  render(
    <Provider store={createAppStore()}>
      <MemoryRouter
        initialEntries={[`/client/access?projectId=${projectId}#token=${'s'.repeat(43)}`]}
      >
        <ClientAccessPage />
      </MemoryRouter>
    </Provider>,
  )

  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: 'Need a new invitation link?' }),
  )
  await user.type(screen.getByLabelText('Email address'), 'client@example.test')
  await user.click(screen.getByRole('button', { name: 'Request invitation' }))
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'If this address has active access',
    ),
  )
  expect(command.run).toHaveBeenCalledWith(
    'client-access/request-link',
    expect.objectContaining({
      email: 'client@example.test',
      projectId,
    }),
  )
  expect(
    screen.queryByRole('button', { name: 'Open my project' }),
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Back to invitation' }))
  expect(
    screen.getByRole('button', { name: 'Open my project' }),
  ).toBeVisible()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

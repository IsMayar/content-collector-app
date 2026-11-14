import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { ContactsPanel } from '@/features/clients/components/ProjectContactsPanel'
const fake = vi.hoisted(() => ({ run: vi.fn(), createContact: vi.fn() }))
vi.mock('@/features/clients/api/clientsApi', () => ({
  useProjectContacts: () => ({
    data: { data: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useClientCommands: () => ({ ...fake, pending: false, error: '' }),
}))
beforeEach(() => {
  fake.run.mockReset().mockResolvedValue({})
  fake.createContact
    .mockReset()
    .mockResolvedValue({ contact: { id: 'contact' } })
})
function mount(unpublished = false) {
  render(
    <MemoryRouter>
      <ContactsPanel
        root="workspaces/w/projects/p"
        clientId="customer"
        unpublished={unpublished}
        canInvite={!unpublished}
      />
    </MemoryRouter>,
  )
}
it('keeps inline fields visible but prevents invitations before publication', async () => {
  mount(true)
  expect(
    screen.getByText('Publish this project before inviting clients.'),
  ).toBeVisible()
  expect(screen.getByLabelText('Contact name')).toBeVisible()
  expect(screen.getByLabelText('Email address')).toBeVisible()
  expect(screen.getByLabelText('Access expires (optional)')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Send invitation' })).toBeDisabled()
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Contact name'), 'Sam')
  await user.type(screen.getByLabelText('Email address'), 'sam@example.test')
  await user.click(screen.getByRole('button', { name: 'Save contact' }))
  expect(fake.createContact).toHaveBeenCalledWith(
    'workspaces/w/projects/p',
    expect.objectContaining({
      clientId: 'customer',
      name: 'Sam',
      email: 'sam@example.test',
      accessExpiresAt: expect.any(String),
    }),
  )
  expect(fake.run).not.toHaveBeenCalled()
})
it('reuses the existing customer and sends only after contact creation succeeds', async () => {
  mount()
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Contact name'), 'Sam')
  await user.type(screen.getByLabelText('Email address'), 'sam@example.test')
  await user.click(screen.getByRole('button', { name: 'Send invitation' }))
  expect(fake.createContact).toHaveBeenCalledOnce()
  expect(fake.run).toHaveBeenCalledWith(
    'workspaces/w/projects/p/contacts/contact/invite',
    {},
    'POST',
    { 'Idempotency-Key': expect.any(String) },
  )
  expect(
    screen.queryByText('Publish this project before inviting clients.'),
  ).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Business name')).not.toBeInTheDocument()
})
it('keeps the created contact for an invitation retry instead of duplicating it', async () => {
  fake.run.mockResolvedValueOnce(undefined).mockResolvedValueOnce({})
  mount()
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Contact name'), 'Sam')
  await user.type(screen.getByLabelText('Email address'), 'sam@example.test')
  await user.click(screen.getByRole('button', { name: 'Send invitation' }))
  expect(
    screen.getByText('Contact created. Retry sending the invitation.'),
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Send invitation' }))
  expect(fake.createContact).toHaveBeenCalledOnce()
  expect(fake.run).toHaveBeenCalledTimes(2)
  expect(fake.run.mock.calls[0][3]).toEqual(fake.run.mock.calls[1][3])
})

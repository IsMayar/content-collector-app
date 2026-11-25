import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import { CreateProjectPage } from '@/features/projects/pages/CreateProjectPage'

const fake = vi.hoisted(() => ({
  clients: [] as Array<{
    id: string
    businessName: string
    contactName: string | null
    email: string | null
  }>,
  run: vi.fn(),
}))

vi.mock('@/config/env', () => ({
  env: { mocksEnabled: false },
}))

vi.mock('@/shared/hooks/useWorkspace', () => ({
  useWorkspace: () => ({
    id: 'w-id',
    base: '/app/w/w-id',
    owner: true,
  }),
}))

vi.mock('@/services/api/resourceApi', () => ({
  useData: (path: string) => {
    if (path === 'workspaces/w-id')
      return { data: { entitlements: { canWrite: true } } }
    if (path === 'workspaces/w-id/clients')
      return { data: { data: fake.clients } }
    if (path === 'workspaces/w-id/templates')
      return {
        data: {
          data: [
            {
              versionId: 'tpl-1',
              title: 'Dentist website',
              projectType: 'WEBSITE',
              industry: 'Dental',
              version: 1,
            },
          ],
        },
      }
    if (path.endsWith('/template-versions/tpl-1'))
      return {
        data: {
          definition: {
            sections: [{ key: 'home', title: 'Home' }],
          },
        },
      }
    return { data: undefined }
  },
}))

vi.mock('@/shared/hooks/useCommand', () => ({
  useCommand: () => ({ run: fake.run, pending: false, error: '' }),
}))

vi.mock('@/features/templates/components/TemplateSymbol', () => ({
  TemplateSymbol: () => null,
}))

beforeEach(() => {
  fake.clients = []
  fake.run.mockReset()
  fake.run.mockImplementation(async (url: string, body?: { clientId?: string }) => {
    if (url === 'workspaces/w-id/clients') {
      return { client: { id: 'new-customer' } }
    }
    if (url === 'workspaces/w-id/projects') {
      return {
        project: { id: 'project-1', clientId: body?.clientId, version: 0 },
      }
    }
    if (url === 'workspaces/w-id/projects/project-1/contacts') {
      return { contact: { id: 'contact-1' } }
    }
    throw new Error(`Unexpected API call: ${url}`)
  })
})

function wizard() {
  render(
    <MemoryRouter
      initialEntries={['/app/w/w-id/projects/new?template=tpl-1']}
    >
      <Routes>
        <Route path="/app/w/w-id/projects/new" element={<CreateProjectPage />} />
        <Route path="/app/w/w-id/projects/:projectId" element={<p>Project opened</p>} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('Project name'), {
    target: { value: 'Dentist site' },
  })
  fireEvent.change(screen.getByLabelText('Due date'), {
    target: { value: '2026-12-15' },
  })
}

it('creates a project contact using new customer details without sending an invitation', async () => {
  wizard()
  fireEvent.click(screen.getByRole('radio', { name: /Add a new customer/i }))
  fireEvent.change(screen.getByLabelText('Business name'), {
    target: { value: 'Sample Dental' },
  })
  fireEvent.change(screen.getByLabelText('Contact name'), {
    target: { value: 'Sam Test' },
  })
  fireEvent.change(screen.getByLabelText('Customer email'), {
    target: { value: 'sam@example.test' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }))
  expect(screen.getByText(/primary customer contact is saved automatically/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Create project', exact: true }))

  await screen.findByText('Project opened')
  expect(fake.run.mock.calls.map((call) => call[0])).toEqual([
    'workspaces/w-id/clients',
    'workspaces/w-id/projects',
    'workspaces/w-id/projects/project-1/contacts',
  ])
  expect(fake.run.mock.calls[2][1]).toEqual({
    clientId: 'new-customer',
    name: 'Sam Test',
    email: 'sam@example.test',
    accessExpiresAt: expect.any(String),
  })
  expect(fake.run.mock.calls.some((call) => /\/publish$|\/invite$/.test(call[0]))).toBe(false)
})

it('reuses an existing customer contact instead of requesting their details twice', async () => {
  fake.clients = [
    { id: 'existing', businessName: 'Original Dental', contactName: 'Jane', email: 'jane@example.test' },
  ]
  wizard()
  fireEvent.change(screen.getByLabelText('Customer', { exact: true }), {
    target: { value: 'existing' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }))

  await screen.findByText('Project opened')
  expect(fake.run.mock.calls.map((call) => call[0])).toEqual([
    'workspaces/w-id/projects',
    'workspaces/w-id/projects/project-1/contacts',
  ])
  expect(fake.run.mock.calls[1][1]).toEqual({
    clientId: 'existing',
    name: 'Jane',
    email: 'jane@example.test',
    accessExpiresAt: expect.any(String),
  })
})

it('permits a draft without customer email and does not manufacture a project contact', async () => {
  fake.clients = [
    { id: 'existing', businessName: 'Original Dental', contactName: 'Jane', email: null },
  ]
  wizard()
  fireEvent.change(screen.getByLabelText('Customer', { exact: true }), {
    target: { value: 'existing' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }))
  expect(screen.getByText(/Add a contact with an email in Client access before publishing/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }))

  await screen.findByText('Project opened')
  expect(fake.run).toHaveBeenCalledTimes(1)
})

it('keeps project-access recovery available if the initial contact cannot be saved', async () => {
  fake.clients = [
    { id: 'existing', businessName: 'Original Dental', contactName: 'Jane', email: 'jane@example.test' },
  ]
  fake.run.mockImplementation(async (url: string, body?: { clientId?: string }) => {
    if (url.endsWith('/contacts')) return undefined
    if (url.endsWith('/projects')) {
      return { project: { id: 'project-1', clientId: body?.clientId, version: 0 } }
    }
    throw new Error(`Unexpected API call: ${url}`)
  })
  wizard()
  fireEvent.change(screen.getByLabelText('Customer', { exact: true }), {
    target: { value: 'existing' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }))
  fireEvent.click(screen.getByRole('button', { name: 'Create project', exact: true }))

  await waitFor(() => expect(screen.getByText('Your project was created')).toBeInTheDocument())
  expect(screen.getByRole('link', { name: 'Open project access' })).toHaveAttribute(
    'href',
    '/app/w/w-id/projects/project-1?tab=access',
  )
  expect(fake.run).toHaveBeenCalledTimes(2)
})

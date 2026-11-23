import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { ProjectsPage } from '@/features/projects/pages/ProjectsPage'
import { CreateProjectPage } from '@/features/projects/pages/CreateProjectPage'

const fake = vi.hoisted(() => ({
  owner: true,
  access: {
    data: { entitlements: { canWrite: false } },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  run: vi.fn(),
}))

vi.mock('@/shared/hooks/useWorkspace', () => ({
  useWorkspace: () => ({
    id: 'workspace',
    base: '/app/w/workspace',
    owner: fake.owner,
  }),
}))

vi.mock('@/features/projects/api/projectsApi', () => ({
  useProjects: () => ({
    data: { data: [], page: { totalElements: 0, size: 20 } },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

vi.mock('@/services/api/resourceApi', () => ({
  useData: (path: string) =>
    path === 'workspaces/workspace'
      ? fake.access
      : {
          data: undefined,
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        },
}))

vi.mock('@/shared/hooks/useCommand', () => ({
  useCommand: () => ({ run: fake.run, pending: false, error: '' }),
}))

beforeEach(() => {
  fake.owner = true
  fake.access.data.entitlements.canWrite = false
  fake.access.isLoading = false
  fake.access.isError = false
  fake.access.refetch.mockReset()
  fake.run.mockReset()
})

it('disables both project creation actions and explains the read-only restriction', () => {
  render(
    <MemoryRouter>
      <ProjectsPage />
    </MemoryRouter>,
  )

  expect(screen.getByRole('button', { name: /Create project/i })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'New project' })).toBeDisabled()
  expect(
    screen.queryByRole('link', { name: /Create project|New project/i }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: /Create project/i }),
  ).toHaveAttribute(
    'title',
    'Project creation is paused while the workspace is read-only.',
  )
  expect(
    screen.queryByText(/This workspace is read-only/),
  ).not.toBeInTheDocument()
  expect(screen.getByText('No projects found')).toBeInTheDocument()
  expect(
    screen.getByText(/Project creation is paused until editing access is restored/),
  ).toBeInTheDocument()
})

it('keeps creation links available when workspace writing is allowed', () => {
  fake.access.data.entitlements.canWrite = true

  render(
    <MemoryRouter>
      <ProjectsPage />
    </MemoryRouter>,
  )

  expect(screen.getByRole('link', { name: /Create project/i })).toHaveAttribute(
    'href',
    '/app/w/workspace/projects/new',
  )
  expect(screen.getByRole('link', { name: 'New project' })).toHaveAttribute(
    'href',
    '/app/w/workspace/projects/new',
  )
  expect(
    screen.queryByText(/Project creation is paused/),
  ).not.toBeInTheDocument()
})

it('blocks direct navigation to the creation wizard while read-only', () => {
  render(
    <MemoryRouter>
      <CreateProjectPage />
    </MemoryRouter>,
  )

  expect(screen.getByText('Project creation paused')).toBeInTheDocument()
  expect(
    screen.getByText(/Creating projects and saving new drafts are paused/),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Save as draft' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Create project' }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'View projects' })).toHaveAttribute(
    'href',
    '/app/w/workspace/projects',
  )
  expect(screen.getByRole('link', { name: 'Manage billing' })).toHaveAttribute(
    'href',
    '/app/w/workspace/settings?view=billing',
  )
  expect(fake.run).not.toHaveBeenCalled()
})

it('keeps wizard access for writable workspaces', () => {
  fake.access.data.entitlements.canWrite = true
  render(
    <MemoryRouter>
      <CreateProjectPage />
    </MemoryRouter>,
  )
  expect(
    screen.getByRole('heading', { name: 'Choose a template to get started.' }),
  ).toBeInTheDocument()
  expect(screen.queryByText('Project creation paused')).not.toBeInTheDocument()
})

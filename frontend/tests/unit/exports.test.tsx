import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { ExportPanel } from '@/features/exports/components/ExportPanel'
import {
  exportCreatedSchema,
  exportSummarySchema,
} from '@/features/exports/schemas/exportSchema'
import type { Project } from '@/features/projects/types/project.types'
const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  state: 'QUEUED',
  detailState: '',
  error: '',
}))
const id = '77777777-7777-4777-8777-777777777777'
const job = () => ({
  id,
  state: mocks.state,
  format: 'APPROVED_JSON',
  projectVersion: 4,
  partial: true,
  createdAt: '2026-11-02T00:00:00Z',
  expiresAt: '2026-11-03T00:00:00Z',
  olderThanCurrentProject: true,
})
vi.mock('@/shared/hooks/useCommand', () => ({
  useCommand: () => ({ run: mocks.run, pending: false, error: mocks.error }),
}))
vi.mock('@/services/api/resourceApi', () => ({
  useData: (path: string) => ({
    data: path.endsWith('/exports')
      ? { data: [job()] }
      : path.includes('/exports/')
        ? { export: { ...job(), state: mocks.detailState || mocks.state } }
        : { structure: [{ id, title: 'Home', items: [] }] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))
const project = {
  title: 'Test project',
  version: 4,
  progress: { approvedRequired: 1, optionalApproved: 0, requiredTotal: 2 },
} as Project
beforeEach(() => {
  mocks.run.mockReset()
  mocks.state = 'QUEUED'
  mocks.detailState = ''
  mocks.error = ''
})
async function submit() {
  await userEvent.click(screen.getByRole('button', { name: /New export/ }))
  await userEvent.selectOptions(
    screen.getByLabelText('Export format'),
    'APPROVED_JSON',
  )
  await userEvent.click(screen.getByLabelText(/I understand/))
  await userEvent.click(screen.getByRole('button', { name: /^Continue$/ }))
  await userEvent.click(
    screen.getByRole('button', { name: 'Create approved export' }),
  )
}
it('waits for a valid queue acknowledgment and sends version, selection and stable retry key', async () => {
  let finish!: (v: unknown) => void
  mocks.run.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  render(<ExportPanel root="workspaces/test/projects/test" project={project} />)
  await submit()
  expect(screen.queryByText(/Export queued/)).not.toBeInTheDocument()
  expect(mocks.run.mock.calls[0][1]).toMatchObject({
    format: 'APPROVED_JSON',
    sectionIds: [id],
    expectedProjectVersion: 4,
    acknowledgePartial: true,
  })
  const key = mocks.run.mock.calls[0][3]['Idempotency-Key']
  finish(undefined)
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Create approved export' }),
    ).toBeEnabled(),
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Create approved export' }),
  )
  expect(mocks.run.mock.calls[1][3]['Idempotency-Key']).toBe(key)
  finish({ jobId: id, state: 'QUEUED' })
  await waitFor(() => expect(screen.getByText(/Export queued/)).toBeVisible())
})
it('rejects incompatible server acknowledgments without claiming success', async () => {
  mocks.run.mockResolvedValue({ export: { id } })
  render(<ExportPanel root="workspaces/test/projects/test" project={project} />)
  await submit()
  expect(screen.queryByText(/Export queued/)).not.toBeInTheDocument()
  expect(screen.getByText(/incompatible export response/)).toBeVisible()
})
it.each(['EXPIRED', 'FAILED'])('shows %s with no download action', (state) => {
  mocks.state = state
  render(<ExportPanel root="workspaces/test/projects/test" project={project} />)
  expect(
    screen.queryByRole('button', { name: 'Download' }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByText(
      state === 'EXPIRED' ? /This download expired/ : /Generation failed/,
    ),
  ).toBeVisible()
  expect(screen.getByText(/Older than current project/)).toBeVisible()
})
it('uses the terminal list result when the detail poll is still running', async () => {
  mocks.run.mockResolvedValue({ jobId: id, state: 'QUEUED' })
  const panel = (
    <ExportPanel root="workspaces/test/projects/test" project={project} />
  )
  const { rerender } = render(panel)
  await submit()
  await waitFor(() => expect(screen.getByText(/Export queued/)).toBeVisible())
  mocks.state = 'READY'
  mocks.detailState = 'RUNNING'
  rerender(
    <ExportPanel root="workspaces/test/projects/test" project={project} />,
  )
  expect(screen.getByRole('button', { name: 'Download' })).toBeVisible()
})
it('validates states and exact queue contract', () => {
  expect(
    exportCreatedSchema.safeParse({ jobId: id, state: 'READY' }).success,
  ).toBe(false)
  expect(
    exportSummarySchema.safeParse({ ...job(), state: 'DONE' }).success,
  ).toBe(false)
  expect(exportSummarySchema.safeParse(job()).success).toBe(true)
})

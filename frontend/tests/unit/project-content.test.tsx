import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import {
  ProjectContent,
  sectionSubmissionProgress,
} from '@/features/projects/components/ProjectContent'
import type { ProjectDetail } from '@/features/projects/types/project.types'
import type {
  Item,
  Section,
} from '@/features/structure-editor/types/structure.types'

const mocked = vi.hoisted(() => ({ detail: vi.fn() }))
vi.mock('@/services/api/resourceApi', () => ({
  useData: (path: string, options?: { skip?: boolean }) => ({
    data: !path || options?.skip ? undefined : mocked.detail(path),
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))
vi.mock('@/shared/hooks/useCommand', () => ({
  useCommand: () => ({ run: vi.fn(), pending: false }),
}))

const item = (
  id: string,
  state: Item['state'],
  overrides: Partial<Item> = {},
): Item => ({
  id,
  sectionId: 'section',
  key: id,
  label: id,
  type: 'LONG_TEXT',
  instructions: '',
  example: '',
  validation: {},
  state,
  visible: true,
  required: true,
  enabled: true,
  version: 2,
  sortOrder: 0,
  currentRevisionId: ['SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED'].includes(
    state,
  )
    ? 'rev-' + id
    : null,
  ...overrides,
})
const section = (items: Item[]): Section => ({
  id: 'section',
  key: 'section',
  title: 'Product summary',
  enabled: true,
  sortOrder: 0,
  items,
})
const data = (items: Item[]) =>
  ({
    structure: [section(items)],
    project: {
      state: 'ACTIVE',
      permissions: { canReview: false, canManageAccess: false },
    },
  }) as ProjectDetail
const props = {
  root: 'workspaces/workspace/projects/project',
  sectionId: null,
  itemId: null,
  revisionId: null,
  onSelectSection: vi.fn(),
  onSelectItem: vi.fn(),
}
const answer =
  '  First paragraph\n\n' + 'Long answer '.repeat(40) + '\n  Last line  '
const submitted = item('Headline', 'SUBMITTED')

function revision(current = submitted.currentRevisionId) {
  return {
    revision: {
      revisionId: current,
      itemId: submitted.id,
      schemaSnapshot: submitted,
      valueSnapshot: { text: answer },
      assets: [],
      revisionNo: 1,
      submittedAt: '2026-11-10T06:00:00Z',
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  mocked.detail.mockReset()
})

it('counts only visible enabled required questions and updates from 0 to 3 and back', () => {
  const fixed = [
    item('optional', 'APPROVED', { required: false }),
    item('hidden', 'SUBMITTED', { visible: false }),
    item('disabled', 'APPROVED', { enabled: false }),
  ]
  const states: Item['state'][][] = [
    ['DRAFT', 'NOT_STARTED', 'CHANGES_REQUESTED'],
    ['SUBMITTED', 'NOT_STARTED', 'DRAFT'],
    ['APPROVED', 'SUBMITTED', 'DRAFT'],
    ['APPROVED', 'SUBMITTED', 'APPROVED'],
    ['APPROVED', 'CHANGES_REQUESTED', 'DRAFT'],
  ]
  const { rerender } = render(<ProjectContent {...props} data={data([])} />)
  for (const [index, status] of states.entries()) {
    const items = status
      .map((state, index) => item('Question ' + index, state))
      .concat(fixed)
    const count = index === 4 ? 1 : index
    expect(sectionSubmissionProgress(section(items))).toEqual({
      total: 3,
      submitted: count,
    })
    rerender(<ProjectContent {...props} data={data(items)} />)
    const progress = within(
      screen.getByRole('region', { name: 'Product summary' }),
    ).getByText(count + ' of 3 submitted')
    if (count === 3) expect(progress).toHaveClass('complete')
    else expect(progress).not.toHaveClass('complete')
    expect(
      screen.queryByRole('article', { name: /hidden|disabled/ }),
    ).not.toBeInTheDocument()
  }
})

it('copies the complete immutable answer without expanding and reports clipboard failures', async () => {
  const user = userEvent.setup()
  const copy = vi
    .spyOn(navigator.clipboard, 'writeText')
    .mockResolvedValueOnce()
    .mockRejectedValueOnce(new Error())
  mocked.detail.mockImplementation((path: string) =>
    path.endsWith('/rev-Headline') ? revision() : undefined,
  )
  render(
    <ProjectContent
      {...props}
      data={data([submitted, item('Draft', 'DRAFT')])}
    />,
  )
  const row = within(screen.getByRole('article', { name: 'Headline' }))
  expect(row.getByRole('button', { name: 'View answer' })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await user.click(row.getByRole('button', { name: 'Copy answer' }))
  expect(copy).toHaveBeenCalledWith(answer)
  expect(row.getByRole('status')).toHaveTextContent('Copied')
  await user.click(row.getByRole('button', { name: 'Copy answer' }))
  expect(row.getByRole('status')).toHaveTextContent('Could not copy')
  expect(
    mocked.detail.mock.calls.every(([path]) => !path.includes('/Draft/')),
  ).toBe(true)
})

it('does not display or copy stale revision data and does not offer reviewer decisions to a reader', () => {
  mocked.detail.mockImplementation((path: string) =>
    path.endsWith('/revisions') || path.endsWith('/comments')
      ? { data: [] }
      : revision('stale'),
  )
  const { rerender } = render(
    <ProjectContent {...props} data={data([submitted])} />,
  )
  expect(
    screen.queryByRole('button', { name: 'Copy answer' }),
  ).not.toBeInTheDocument()
  mocked.detail.mockImplementation((path: string) =>
    path.endsWith('/revisions') || path.endsWith('/comments')
      ? { data: [] }
      : revision(),
  )
  rerender(
    <ProjectContent
      {...props}
      itemId={submitted.id}
      data={data([submitted])}
    />,
  )
  expect(
    screen.getByRole('heading', { name: 'Submitted revision 1' }),
  ).toBeVisible()
  expect(screen.getByRole('button', { name: 'Copy answer' })).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Approve revision' }),
  ).not.toBeInTheDocument()
})

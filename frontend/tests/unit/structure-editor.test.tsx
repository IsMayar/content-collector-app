import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ItemEditor } from '@/features/structure-editor/components/ItemEditor'
import type {
  Item,
  Section,
} from '@/features/structure-editor/types/structure.types'
const fixture = vi.hoisted(() => ({ data: undefined as unknown }))
vi.mock('@/services/api/resourceApi', () => ({
  useData: () => ({ data: fixture.data, refetch: vi.fn() }),
}))
vi.mock('@/shared/hooks/useCommand', () => ({
  useCommand: () => ({ run: vi.fn(), pending: false, error: '' }),
}))
it('uses current section data for newly created conditional controls while the editor stays mounted', () => {
  const id = '77777777-7777-4777-8777-777777777777'
  const common = {
    id,
    sectionId: id,
    label: 'Dependent',
    key: 'dependent',
    type: 'MULTI_SELECT' as const,
    sortOrder: 1,
    state: 'NOT_STARTED' as const,
    version: 1,
    currentRevisionId: null,
    visible: true,
    required: false,
    enabled: true,
    instructions: '',
    example: '',
    validation: { options: [{ key: 'yes', label: 'Yes' }] },
  }
  const item: Item = common
  const old: Section = {
    id,
    key: 'home',
    title: 'Home',
    sortOrder: 0,
    enabled: true,
    items: [item],
  }
  const control: Item = {
    ...item,
    id: '88888888-8888-4888-8888-888888888888',
    key: 'new_control',
    label: 'Newly created control',
    type: 'SINGLE_SELECT',
    sortOrder: 0,
  }
  fixture.data = { structure: [{ ...old, items: [control, item] }] }
  render(
    <ItemEditor
      root="workspaces/test/projects/test"
      section={old}
      item={item}
      structureVersion={3}
      onClose={() => {}}
    />,
  )
  expect(
    screen.getByRole('option', { name: 'Newly created control' }),
  ).toHaveValue('new_control')
})

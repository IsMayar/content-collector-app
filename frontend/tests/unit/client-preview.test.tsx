import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PreviewPanel } from '@/features/projects/components/PreviewPanel'
import type { PreviewChecklist } from '@/features/projects/types/preview.types'
import type { FieldType } from '@/features/structure-editor/types/structure.types'
import {
  customerCreateSchema,
  customerRenameSchema,
  contactCreateSchema,
} from '@/features/clients/schemas/clientSchema'
import { previewSchema } from '@/features/projects/schemas/previewSchema'
const types: FieldType[] = [
  'SHORT_TEXT',
  'LONG_TEXT',
  'URL',
  'SINGLE_SELECT',
  'MULTI_SELECT',
  'IMAGE',
  'FILE',
  'REPEATER',
]
const uuid = (n: number) =>
  `77777777-7777-4777-8777-${String(n).padStart(12, '0')}`
const fixture: PreviewChecklist = {
  project: {
    id: uuid(1),
    title: 'Synthetic project',
    projectType: 'WEBSITE',
    state: 'DRAFT',
    dueDate: '2026-12-01',
    structureVersion: 1,
    agencyDisplayName: 'Synthetic studio',
    aiEnabled: false,
  },
  progress: {
    requiredTotal: 8,
    submittedRequired: 0,
    approvedRequired: 0,
    clientActionRequired: 8,
    optionalApproved: 0,
  },
  sections: [
    {
      id: uuid(2),
      key: 'section',
      title: 'Visible section',
      items: types.map((type, index) => ({
        id: uuid(index + 3),
        key: `item.${index}`,
        type,
        label: `${type} request`,
        instructions: 'Client instructions',
        example: 'Example only',
        required: true,
        validation: {
          options: [{ key: 'yes', label: 'Yes' }],
          allowedExtensions: ['png'],
          maxFiles: 2,
          maxRows: 2,
          columns: [
            {
              key: 'person',
              label: 'Team member',
              type: 'SHORT_TEXT',
              required: true,
            },
          ],
        },
        state: 'NOT_STARTED',
        version: 1,
        visible: true,
        answer: null,
        assets: [],
        comments: [],
        canEdit: false,
      })),
    },
    { id: uuid(20), key: 'second', title: 'Second section', items: [] },
  ],
}
vi.mock('@/features/projects/api/previewApi', () => ({
  useClientPreview: () => ({
    data: { preview: fixture },
    isLoading: false,
    error: undefined,
    isError: false,
  }),
}))
afterEach(cleanup)
describe('read-only owner preview', () => {
  it.each(types)(
    'renders %s with the shared client renderer and no enabled form actions',
    (type) => {
      render(<PreviewPanel root="workspaces/synthetic/projects/synthetic" />)
      expect(
        screen.getByRole('heading', { name: `${type} request Required` }),
      ).toBeVisible()
      for (const control of screen.queryAllByRole('textbox'))
        expect(control).toBeDisabled()
      for (const control of screen.queryAllByRole('combobox'))
        expect(control).toBeDisabled()
      for (const control of screen.queryAllByRole('checkbox'))
        expect(control).toBeDisabled()
      expect(
        screen.queryByRole('button', {
          name: /Submit for review|Generate draft|Choose files/,
        }),
      ).not.toBeInTheDocument()
    },
  )
  it('switches preview sections locally and communicates the non-persistent boundary', async () => {
    render(<PreviewPanel root="workspaces/synthetic/projects/synthetic" />)
    expect(
      screen.getByText(/does not create or impersonate a client session/),
    ).toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: 'Second section' }),
    )
    expect(
      screen.getByText('No visible requests in this section.'),
    ).toBeVisible()
    expect(screen.queryByText('Client instructions')).not.toBeInTheDocument()
  })
  it('validates the explicit preview envelope and rejects writable or live answer data', () => {
    expect(previewSchema.safeParse({ preview: fixture }).success).toBe(true)
    const live = structuredClone(fixture)
    Object.assign(live.sections[0].items[0], {
      canEdit: true,
      answer: { value: { text: 'Private' }, version: 1 },
    })
    expect(previewSchema.safeParse({ preview: live }).success).toBe(false)
    expect(previewSchema.safeParse(fixture).success).toBe(false)
  })
})
describe('customer/contact form validation', () => {
  it('supports optional customer contact metadata without inventing uniqueness', () => {
    expect(
      customerCreateSchema.safeParse({
        businessName: '  Business  ',
        contactName: '',
        email: '',
      }).success,
    ).toBe(true)
    expect(
      customerCreateSchema.parse({
        businessName: '  Business  ',
        contactName: '',
        email: '',
      }).businessName,
    ).toBe('Business')
  })
  it('rejects blank names and malformed contact addresses', () => {
    expect(customerRenameSchema.safeParse({ businessName: '  ' }).success).toBe(
      false,
    )
    expect(
      contactCreateSchema.safeParse({
        name: 'Contact',
        email: 'invalid',
        expiry: '2026-12-01',
      }).success,
    ).toBe(false)
  })
})

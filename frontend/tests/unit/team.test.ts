import { assignmentSchema } from '@/features/projects/schemas/assignmentSchema'
import { describe, expect, it } from 'vitest'
import {
  teamInvitationSchema,
  teamSchema,
} from '@/features/workspace/schemas/teamSchema'

describe('T13 collaboration contracts', () => {
  it('normalizes invitation email without staging permissions or extra fields', () => {
    expect(
      teamInvitationSchema.parse({
        email: ' Teammate@EXAMPLE.TEST ',
        assignments: ['untrusted'],
      }),
    ).toEqual({ email: 'teammate@example.test' })
  })
  it.each(['', 'invalid', 'x'.repeat(255) + '@example.test'])(
    'rejects invalid invitation email %s',
    (email) => {
      expect(teamInvitationSchema.safeParse({ email }).success).toBe(false)
    },
  )
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])('keeps review and export independent (%s, %s)', (canReview, canExport) => {
    expect(assignmentSchema.parse({ canReview, canExport })).toEqual({
      canReview,
      canExport,
    })
  })
  it('rejects the obsolete invitations read shape', () => {
    expect(teamSchema.safeParse({ data: [], invitations: [] }).success).toBe(
      false,
    )
    expect(teamSchema.parse({ data: [], pendingInvites: [] })).toEqual({
      data: [],
      pendingInvites: [],
    })
  })
})

import { z } from 'zod'

export const assignmentSchema = z.object({
  canReview: z.boolean(),
  canExport: z.boolean(),
})

export const assignmentsSchema = z.object({
  data: z.array(assignmentSchema.extend({ memberId: z.string().uuid() })),
})

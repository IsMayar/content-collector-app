import { z } from 'zod'
export const reviewDecisionSchema = z.object({
  id: z.uuid(),
  revisionId: z.uuid(),
  decision: z.enum(['APPROVE', 'REQUEST_CHANGES']),
  reason: z.string().nullable(),
  reviewedAt: z.string(),
  reviewerDisplayName: z.string(),
})
export const clientCommentSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  authorDisplayName: z.string(),
  createdAt: z.string(),
  revisionId: z.uuid().nullable(),
})
export const commentSchema = clientCommentSchema.extend({
  visibility: z.enum(['CLIENT', 'INTERNAL']),
})
export const decisionResultSchema = z.object({
  item: z.looseObject({
    id: z.uuid(),
    state: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
    version: z.number().int().positive(),
  }),
  decision: reviewDecisionSchema,
})

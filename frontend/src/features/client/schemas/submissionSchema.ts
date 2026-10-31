import { z } from 'zod'
export const submissionSummarySchema = z.looseObject({
  revisionId: z.uuid(),
  itemId: z.uuid(),
  itemKey: z.string(),
  revisionNo: z.number().int().positive(),
  submittedAt: z.string(),
})
export const submissionRevisionSchema = submissionSummarySchema.extend({
  structureVersion: z.number().int().positive(),
  submittedByContactId: z.uuid(),
  schemaSnapshot: z.looseObject({ label: z.string(), type: z.string() }),
  valueSnapshot: z.record(z.string(), z.unknown()),
  assets: z.array(
    z.object({
      id: z.uuid(),
      originalName: z.string(),
      availableVariants: z.array(z.string()),
    }),
  ),
})

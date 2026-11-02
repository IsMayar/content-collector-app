import { z } from 'zod'
export const exportCreatedSchema = z.object({
  jobId: z.uuid(),
  state: z.literal('QUEUED'),
})
export const exportSummarySchema = z.object({
  id: z.uuid(),
  state: z.enum([
    'QUEUED',
    'RUNNING',
    'READY',
    'FAILED',
    'EXPIRED',
    'CANCELLED',
  ]),
  format: z.enum(['APPROVED_ZIP', 'APPROVED_JSON', 'APPROVED_MARKDOWN']),
  projectVersion: z.number().int().positive(),
  partial: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  olderThanCurrentProject: z.boolean(),
  failureCode: z.string().optional(),
})

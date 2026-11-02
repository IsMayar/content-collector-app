import { z } from 'zod'
import { savedDraftAnswer } from '@/features/client/schemas/draftAnswerSchema'
export const aiCommandSchema = z.object({
  facts: z
    .array(z.string().trim().min(1).max(1000))
    .min(1)
    .max(10)
    .refine(
      (f) => f.reduce((n, s) => n + s.length, 0) <= 5000,
      'Use at most 5000 characters of facts.',
    ),
  tone: z.enum(['Clear and friendly', 'Professional', 'Concise']),
  targetWords: z.number().int().min(30).max(500),
  baseAnswerVersion: z.number().int().nonnegative(),
  consent: z.literal(true),
})
export const aiCreatedSchema = z.object({
  jobId: z.uuid(),
  state: z.literal('QUEUED'),
})
export const aiJobSchema = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  state: z.enum([
    'QUEUED',
    'RUNNING',
    'SUCCEEDED',
    'REFUSED',
    'FAILED',
    'ACCEPTED',
    'EXPIRED',
  ]),
  baseAnswerVersion: z.number().int().nonnegative(),
  result: z
    .object({
      draft: z.string().min(1).max(12000),
      factsUsed: z.array(z.string()),
      missingFacts: z.array(z.string()),
      warnings: z.array(z.string()),
    })
    .nullable(),
  failureCode: z.string().nullable(),
})
export const aiAcceptedSchema = z.object({
  answer: savedDraftAnswer.extend({
    value: z.object({ text: z.string() }).strict(),
  }),
})

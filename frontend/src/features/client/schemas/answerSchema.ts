import { object } from '@/shared/types/jsonSchema'
import { z } from 'zod'
export const answer = z.object({
  itemId: z.string(),
  value: object,
  version: z.number().int().positive(),
  savedAt: z.string(),
})

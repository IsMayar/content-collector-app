import { object } from '@/shared/types/jsonSchema'
import { z } from 'zod'
export const definition = z.looseObject({
  key: z.string(),
  label: z.string(),
  type: z.enum([
    'SHORT_TEXT',
    'LONG_TEXT',
    'URL',
    'SINGLE_SELECT',
    'MULTI_SELECT',
    'IMAGE',
    'FILE',
    'REPEATER',
  ]),
  instructions: z.string(),
  example: z.string(),
  required: z.boolean(),
  validation: object,
})
export const item = definition.extend({
  id: z.string(),
  state: z.enum([
    'NOT_STARTED',
    'DRAFT',
    'SUBMITTED',
    'CHANGES_REQUESTED',
    'APPROVED',
  ]),
  version: z.number().int().positive(),
})
export const section = z.looseObject({
  id: z.string(),
  key: z.string(),
  title: z.string(),
  items: z.array(item),
})

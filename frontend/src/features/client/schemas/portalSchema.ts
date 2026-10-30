import { z } from 'zod'
import { previewSchema } from '@/features/projects/schemas/previewSchema'
const option = z.object({ key: z.string(), label: z.string() })
const validation = z.looseObject({
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().nonnegative().optional(),
  format: z.literal('email').optional(),
  minFiles: z.number().int().nonnegative().optional(),
  maxFiles: z.number().int().nonnegative().optional(),
  allowedExtensions: z.array(z.string()).optional(),
  minOptions: z.number().int().nonnegative().optional(),
  maxOptions: z.number().int().nonnegative().optional(),
  options: z.array(option).optional(),
  allowedSchemes: z.array(z.enum(['https', 'http'])).optional(),
  maxRows: z.number().int().min(1).max(20).optional(),
  columns: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        type: z.enum([
          'SHORT_TEXT',
          'LONG_TEXT',
          'URL',
          'NUMBER',
          'SINGLE_SELECT',
          'IMAGE',
        ]),
        required: z.boolean(),
        options: z.array(option).optional(),
      }),
    )
    .max(8)
    .optional(),
})
const base = previewSchema.shape.preview
const section = base.shape.sections.element
export const portalFoundationSchema = base.extend({
  sections: z.array(
    section.extend({
      items: z.array(section.shape.items.element.extend({ validation })),
    }),
  ),
  capabilities: z.object({ canRespond: z.literal(false) }),
})
export type PortalFoundation = z.infer<typeof portalFoundationSchema>

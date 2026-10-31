import { z } from 'zod'
import { portalFoundationSchema } from './portalSchema'
import { savedDraftAnswer } from './draftAnswerSchema'
const base = portalFoundationSchema
const section = base.shape.sections.element
export const collectionSchema = base.extend({
  collection: z.literal(true),
  capabilities: z.object({
    canRespond: z.boolean(),
    canUpload: z.boolean().optional().default(false),
  }),
  sections: z.array(
    section.extend({
      items: z.array(
        section.shape.items.element.extend({
          state: z.enum([
            'NOT_STARTED',
            'DRAFT',
            'CHANGES_REQUESTED',
            'SUBMITTED',
            'APPROVED',
          ]),
          canEdit: z.boolean(),
          assets: z.array(
            z.object({
              id: z.string(),
              itemId: z.string(),
              originalName: z.string(),
              contentType: z.string().nullable(),
              state: z.enum([
                'RESERVED',
                'UPLOADED',
                'PROCESSING',
                'READY',
                'REJECTED',
                'FAILED',
                'DELETED',
              ]),
              sourceBytes: z.number().int().nonnegative(),
              retainedBytes: z.number().int().nonnegative(),
              keepOriginal: z.boolean(),
              availableVariants: z.array(
                z.enum(['ORIGINAL', 'WORKING', 'THUMBNAIL']),
              ),
              rejectionCode: z.string().nullable(),
            }),
          ),
          answer: savedDraftAnswer.nullable(),
        }),
      ),
    }),
  ),
})
export type CollectionData = z.infer<typeof collectionSchema>

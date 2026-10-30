import { z } from 'zod'
import { portalFoundationSchema } from './portalSchema'
import { savedDraftAnswer } from './draftAnswerSchema'
const base = portalFoundationSchema
const section = base.shape.sections.element
export const collectionSchema = base.extend({
  collection: z.literal(true),
  capabilities: z.object({ canRespond: z.boolean() }),
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
          answer: savedDraftAnswer.nullable(),
        }),
      ),
    }),
  ),
})
export type CollectionData = z.infer<typeof collectionSchema>

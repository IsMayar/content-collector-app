import { z } from 'zod'
import { definition } from '@/features/structure-editor/schemas/structureSchema'
import { progress } from './projectSchema'
export const previewSchema = z.object({
  preview: z.object({
    project: z.object({
      id: z.uuid(),
      title: z.string(),
      projectType: z.enum(['WEBSITE', 'WEB_APP', 'MOBILE_APP']),
      state: z.string(),
      dueDate: z.string(),
      structureVersion: z.number().int().positive(),
      agencyDisplayName: z.string(),
      aiEnabled: z.literal(false),
    }),
    sections: z.array(
      z.object({
        id: z.uuid(),
        key: z.string(),
        title: z.string(),
        items: z.array(
          definition.extend({
            id: z.uuid(),
            version: z.number().int().positive(),
            state: z.literal('NOT_STARTED'),
            visible: z.literal(true),
            canEdit: z.literal(false),
            answer: z.null(),
            assets: z.array(z.never()),
            comments: z.array(z.never()),
          }),
        ),
      }),
    ),
    progress,
  }),
})

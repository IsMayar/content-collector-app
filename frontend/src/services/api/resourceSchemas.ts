import { portalFoundationSchema } from '@/features/client/schemas/portalSchema'
import { teamSchema } from '@/features/workspace/schemas/teamSchema'
import { assignmentsSchema } from '@/features/projects/schemas/assignmentSchema'
import { previewSchema } from '@/features/projects/schemas/previewSchema'
import {
  customerSchema,
  projectContactSchema,
} from '@/features/clients/schemas/clientSchema'
import { answer } from '@/features/client/schemas/answerSchema'
import { progress, project } from '@/features/projects/schemas/projectSchema'
import {
  definition,
  item,
  section,
} from '@/features/structure-editor/schemas/structureSchema'
import { object } from '@/shared/types/jsonSchema'
import { page } from '@/shared/types/paginationSchema'
import { z } from 'zod'
export function validateProductRead(path: string, data: unknown) {
  const route = path.split('?')[0]
  let schema: z.ZodType = object
  if (/^workspaces\/[^/]+\/members$/.test(route)) schema = teamSchema
  else if (/^workspaces\/[^/]+\/projects\/[^/]+\/assignments$/.test(route))
    schema = assignmentsSchema
  else if (/^workspaces\/[^/]+\/projects$/.test(route))
    schema = z.object({ data: z.array(project), page })
  else if (/^workspaces\/[^/]+\/projects\/[^/]+$/.test(route))
    schema = z.looseObject({
      project: project.extend({
        version: z.number().int().positive(),
        structureVersion: z.number().int().positive(),
        permissions: z.object({
          canEditStructure: z.boolean(),
          canReview: z.boolean(),
          canExport: z.boolean(),
          canManageAccess: z.boolean(),
        }),
      }),
      progress,
      structure: z.array(section),
    })
  else if (
    route.endsWith('/checklist') &&
    typeof data === 'object' &&
    data !== null &&
    'capabilities' in data
  )
    schema = portalFoundationSchema
  else if (route.endsWith('/checklist'))
    schema = z.looseObject({
      project: z.looseObject({
        id: z.string(),
        title: z.string(),
        state: z.string(),
        structureVersion: z.number().int().positive(),
        agencyDisplayName: z.string(),
      }),
      progress,
      sections: z.array(
        section.extend({
          items: z.array(
            item.extend({
              answer,
              assets: z.array(object),
              comments: z.array(object),
              canEdit: z.boolean(),
            }),
          ),
        }),
      ),
    })
  else if (route.endsWith('/templates'))
    schema = z.object({
      data: z.array(
        z.looseObject({
          id: z.string(),
          versionId: z.string(),
          title: z.string(),
          projectType: z.string(),
          isBuiltin: z.boolean(),
          version: z.number().int().positive(),
        }),
      ),
    })
  else if (route.includes('/template-versions/'))
    schema = z.object({
      definition: z.looseObject({
        schemaVersion: z.literal(1),
        title: z.string(),
        sections: z.array(
          z.looseObject({
            key: z.string(),
            title: z.string(),
            items: z.array(definition),
          }),
        ),
      }),
    })
  if (/^workspaces\/[^/]+\/clients(?:\?.*)?$/.test(path))
    schema = z.object({ data: z.array(customerSchema), page })
  if (/^workspaces\/[^/]+\/projects\/[^/]+\/contacts$/.test(route))
    schema = z.object({ data: z.array(projectContactSchema) })
  if (route.endsWith('/client-preview')) schema = previewSchema
  return schema.safeParse(data)
}

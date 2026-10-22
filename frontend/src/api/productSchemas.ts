import { z } from 'zod'
const object = z.looseObject({})
const progress = z.object({
  requiredTotal: z.number().int().nonnegative(),
  submittedRequired: z.number().int().nonnegative(),
  approvedRequired: z.number().int().nonnegative(),
  clientActionRequired: z.number().int().nonnegative(),
  optionalApproved: z.number().int().nonnegative(),
})
const definition = z.looseObject({
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
const item = definition.extend({
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
const section = z.looseObject({
  id: z.string(),
  key: z.string(),
  title: z.string(),
  items: z.array(item),
})
const project = z.looseObject({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  projectType: z.enum(['WEBSITE', 'WEB_APP', 'MOBILE_APP']),
  state: z.enum([
    'DRAFT',
    'ACTIVE',
    'PAUSED',
    'COMPLETED',
    'ARCHIVED',
    'DELETION_PENDING',
  ]),
  dueDate: z.string(),
  timezone: z.string(),
  progress,
})
const page = z.object({
  page: z.number().int().nonnegative(),
  size: z.number().int().positive(),
  totalElements: z.number().int().nonnegative(),
})
const answer = z.object({
  itemId: z.string(),
  value: object,
  version: z.number().int().positive(),
  savedAt: z.string(),
})
/** Validate response boundaries before components consume a backend response. Unknown extension fields remain compatible. */
export function validateProductRead(path: string, data: unknown) {
  const route = path.split('?')[0]
  let schema: z.ZodType = object
  if (/^workspaces\/[^/]+\/projects$/.test(route))
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
  return schema.safeParse(data)
}

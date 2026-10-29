import { z } from 'zod'
export const progress = z.object({
  requiredTotal: z.number().int().nonnegative(),
  submittedRequired: z.number().int().nonnegative(),
  approvedRequired: z.number().int().nonnegative(),
  clientActionRequired: z.number().int().nonnegative(),
  optionalApproved: z.number().int().nonnegative(),
})
export const project = z.looseObject({
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

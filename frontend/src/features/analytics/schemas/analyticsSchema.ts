import { z } from 'zod'
import { progress } from '@/features/projects/schemas/projectSchema'
export const frictionMetric = z
  .object({
    itemKey: z.string(),
    templateVersionId: z.string(),
    eligibleStarts: z.number().int().nonnegative(),
    completedObservationWindows: z.number().int().nonnegative(),
    startsWithoutSubmission: z.number().int().nonnegative(),
    rate: z.number().min(0).max(1).nullable(),
    insufficientData: z.boolean(),
    medianFirstSubmissionSeconds: z.number().nonnegative().nullable(),
    completedSubmissions: z.number().int().nonnegative(),
  })
  .superRefine((m, ctx) => {
    const insufficient =
      m.eligibleStarts < 10 || m.completedObservationWindows < 10
    if (
      m.completedObservationWindows > m.eligibleStarts ||
      m.startsWithoutSubmission > m.completedObservationWindows ||
      m.completedSubmissions > m.eligibleStarts ||
      m.insufficientData !== insufficient ||
      (insufficient
        ? m.rate !== null
        : m.rate === null ||
          Math.abs(
            m.rate - m.startsWithoutSubmission / m.completedObservationWindows,
          ) > 1e-9) ||
      (m.completedSubmissions === 0) !==
        (m.medianFirstSubmissionSeconds === null)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Inconsistent observation counts or sample safeguards.',
      })
  })
export const projectAnalytics = z.object({
  progress,
  friction: z.array(frictionMetric),
  generatedAt: z.string(),
  sections: z
    .array(z.object({ id: z.string(), title: z.string(), progress }))
    .optional(),
})
export const templateMetric = frictionMetric.and(
  z.object({
    projectType: z.enum(['WEBSITE', 'WEB_APP', 'MOBILE_APP']),
    templateTitle: z.string(),
  }),
)

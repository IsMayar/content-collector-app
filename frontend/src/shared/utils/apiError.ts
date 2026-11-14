import type { Problem } from '@/shared/types/common.types'
import { z } from 'zod'

const problemSchema = z.object({
  type: z.string().optional(),
  title: z.string().optional(),
  status: z.number().int().min(400).max(599).optional(),
  code: z.string().optional(),
  detail: z.string().optional(),
  traceId: z.string().optional(),
  currentVersion: z.number().int().nonnegative().optional(),
  errors: z
    .array(z.object({ fieldPath: z.string(), message: z.string() }))
    .optional(),
})
export function apiProblem(error: unknown): Partial<Problem> {
  if (typeof error !== 'object' || !error) return {}
  const status =
    'status' in error && typeof error.status === 'number'
      ? error.status
      : undefined
  const parsed = problemSchema.safeParse(
    'data' in error ? error.data : undefined,
  )
  // HTTP status is authoritative; never pass unchecked server fields to forms.
  return {
    ...(parsed.success ? parsed.data : {}),
    ...(status ? { status } : {}),
  }
}
export function errorMessage(error: unknown): string {
  const problem = apiProblem(error)
  if (problem.code === 'CLIENT_ACCESS_UNAVAILABLE')
    return 'Your project link or session has expired, or access was revoked. Request a fresh link from your agency.'
  if (problem.code === 'INVALID_CREDENTIALS')
    return 'Email or password is incorrect. Please try again.'
  if (problem.code === 'EMAIL_NOT_VERIFIED')
    return 'Open the verification link from your email before signing in.'
  if (problem.code === 'INVITATION_EMAIL_MISMATCH')
    return 'This invitation belongs to another email address. Sign out from your workspace, then sign in with the invited address.'
  if (
    problem.code === 'EXPORT_UNAVAILABLE' ||
    problem.code === 'EXPORT_ASSET_UNAVAILABLE'
  )
    return 'Export storage or processing is unavailable. Try again when the export worker and approved files are ready.'
  if (problem.code === 'STORAGE_UNAVAILABLE')
    return 'Private file storage is unavailable. Try again after storage is configured and the scanner is ready.'
  if (problem.status === 401) return 'Your session has ended. Sign in again.'
  if (problem.status === 404)
    return 'This resource is unavailable or you no longer have access.'
  if (problem.status === 429)
    return 'Too many attempts. Please wait before trying again.'
  if (problem.status === 403) return 'You do not have permission to do that.'
  if (problem.code === 'PROJECT_VERSION_CONFLICT')
    return 'This project changed. Refresh its current state before retrying.'
  if (problem.code === 'PUBLICATION_VALIDATION_FAILED')
    return 'Add enabled content requests, an active client contact and a due date before publishing.'
  if (problem.code === 'PROJECT_INCOMPLETE')
    return 'Approve every visible required item before completing the project.'
  if (problem.code === 'DRAFT_REVALIDATION_FAILED')
    return 'Saved answers do not fit these field settings. Keep the answers and choose compatible settings or correct the draft first.'
  if (
    problem.code === 'INVALID_PROJECT_TRANSITION' ||
    problem.code === 'READ_ONLY'
  )
    return 'This action is unavailable in the current project state. Refresh the project before continuing.'
  if (problem.code === 'ITEM_VERSION_CONFLICT')
    return 'This submission changed or was already reviewed. Refresh the current revision before deciding.'
  if (problem.code === 'REVIEW_FORBIDDEN')
    return 'Review permission is unavailable. Contact your workspace owner.'
  if (problem.code === 'STRUCTURE_CONFLICT')
    return 'The project structure changed. Refresh the latest version, review your changes, and retry.'
  if (problem.code === 'REOPEN_REQUIRED')
    return 'This item contains collected work. Reopen it through the review workflow before changing its structure.'
  if (problem.status === 422 && problem.code === 'VALIDATION_FAILED')
    return 'This structure change is invalid. Check the field configuration and visibility dependencies.'
  if (problem.status === 409)
    return 'The current state changed. Refresh and review your changes before retrying.'
  if (problem.status === 400 || problem.status === 422)
    return 'Check the information you entered and try again.'
  if (problem.status && problem.status >= 500)
    return 'The service is temporarily unavailable. Try again later.'
  return 'We could not complete that request. Check your connection and try again.'
}

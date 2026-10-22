import type { Problem } from '@/api/types'
export function apiProblem(error: unknown): Partial<Problem> {
  if (typeof error === 'object' && error && 'data' in error && typeof error.data === 'object' && error.data) return error.data as Partial<Problem>
  return {}
}
export function errorMessage(error: unknown): string {
  const problem = apiProblem(error)
  if (problem.code === 'INVALID_CREDENTIALS') return 'Email or password is incorrect. Please try again.'
  if (problem.code === 'EMAIL_NOT_VERIFIED') return 'Verify your email before signing in. You can request a new link below.'
  if (problem.code === 'INVITATION_EMAIL_MISMATCH') return 'This invitation belongs to another email address. Sign out from your workspace, then sign in with the invited address.'
  if (problem.status === 429) return 'Too many attempts. Please wait before trying again.'
  if (problem.status === 403) return 'You do not have permission to do that.'
  if (problem.status === 409) return 'Your session changed. Please try again.'
  return 'We could not complete that request. Check your connection and try again.'
}

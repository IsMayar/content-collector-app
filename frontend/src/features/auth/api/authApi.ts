import {
  loginSchema,
  meSchema,
} from '@/features/auth/schemas/authResponseSchemas'
import type {
  LoginCommand,
  Me,
  MembershipSummary,
} from '@/features/auth/types/auth.types'
import { agencyApi } from '@/services/api/baseApi'
import { refreshSession } from '@/services/api/baseQuery'
import type { Message } from '@/shared/types/common.types'

export const authApi = agencyApi.injectEndpoints({
  endpoints: (build) => ({
    bootstrap: build.query<Me, void>({
      async queryFn(_arg, api, _options, baseQuery) {
        if (!(await refreshSession(api)))
          return {
            error: {
              status: 'CUSTOM_ERROR',
              error: 'Session could not be restored',
            },
          }
        const result = await baseQuery('me')
        if (result.error) return { error: result.error }
        const parsed = meSchema.safeParse(result.data)
        return parsed.success
          ? { data: parsed.data }
          : {
              error: {
                status: 'CUSTOM_ERROR',
                error: 'Invalid account response',
              },
            }
      },
    }),
    login: build.mutation<ReturnType<typeof loginSchema.parse>, LoginCommand>({
      query: (body) => ({ url: 'auth/login', method: 'POST', body }),
      transformResponse: (data) => loginSchema.parse(data),
    }),
    me: build.query<Me, void>({
      query: () => 'me',
      transformResponse: (data) => meSchema.parse(data),
    }),
    register: build.mutation<Message, LoginCommand & { displayName: string }>({
      query: (body) => ({ url: 'auth/register', method: 'POST', body }),
    }),
    verifyEmail: build.mutation<{ verified: boolean }, { token: string }>({
      query: (body) => ({ url: 'auth/verify-email', method: 'POST', body }),
    }),
    resendVerification: build.mutation<Message, { email: string }>({
      query: (body) => ({
        url: 'auth/resend-verification',
        method: 'POST',
        body,
      }),
    }),
    forgotPassword: build.mutation<Message, { email: string }>({
      query: (body) => ({ url: 'auth/forgot-password', method: 'POST', body }),
    }),
    resetPassword: build.mutation<Message, { token: string; password: string }>(
      {
        query: (body) => ({ url: 'auth/reset-password', method: 'POST', body }),
      },
    ),
    acceptInvitation: build.mutation<
      { membership: MembershipSummary },
      { token: string; idempotencyKey: string }
    >({
      query: ({ token, idempotencyKey }) => ({
        url: 'team-invitations/accept',
        method: 'POST',
        body: { token },
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    }),
    logout: build.mutation<void, void>({
      query: () => ({ url: 'auth/logout', method: 'POST', body: {} }),
    }),
  }),
})

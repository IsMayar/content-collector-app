import { env } from '@/config/env'
import { tokenSchema } from '@/features/auth/schemas/authResponseSchemas'
import { signedOut, tokenReceived } from '@/features/auth/store/authSlice'
import type { AuthState } from '@/features/auth/types/auth.types'
import type {
  BaseQueryApi,
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
  FetchBaseQueryMeta,
} from '@reduxjs/toolkit/query/react'
import { fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export const apiBaseUrl = env.apiBaseUrl
const normalizedBaseUrl = new URL(
  apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`,
  window.location.origin,
).href
const raw = fetchBaseQuery({
  baseUrl: normalizedBaseUrl,
  credentials: 'include',
  timeout: 15000,
  prepareHeaders: (headers) => {
    if (!headers.has('Accept'))
      headers.set('Accept', 'application/json, application/problem+json')
    return headers
  },
})
const auth = (api: BaseQueryApi) => (api.getState() as { auth: AuthState }).auth
let refreshInFlight: Promise<boolean> | null = null
async function csrf(api: BaseQueryApi) {
  const result = await raw('auth/csrf', api, {})
  if (result.error) return result
  const token = (result.data as { token?: unknown })?.token
  return typeof token === 'string'
    ? { token }
    : {
        error: {
          status: 'CUSTOM_ERROR' as const,
          error: 'Invalid CSRF response',
        },
      }
}
export function refreshSession(api: BaseQueryApi): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight
  const generation = auth(api).generation
  const refresh = async () => {
    const protection = await csrf(api)
    if ('error' in protection) return false
    const response = await raw(
      {
        url: 'auth/refresh',
        method: 'POST',
        body: {},
        headers: { 'X-XSRF-TOKEN': protection.token },
      },
      api,
      {},
    )
    if (auth(api).generation !== generation) return false
    if (response.error) {
      if (response.error.status === 401) api.dispatch(signedOut())
      return false
    }
    const token = tokenSchema.safeParse(response.data)
    if (!token.success) return false
    api.dispatch(tokenReceived(token.data))
    return true
  }
  // Web Locks coordinate cookie rotation between tabs without sharing bearer tokens.
  const task = (async () =>
    typeof navigator !== 'undefined' && navigator.locks
      ? await navigator.locks.request('collector-refresh', refresh)
      : await refresh())().finally(() => {
    refreshInFlight = null
  })
  refreshInFlight = task
  return task
}
export const createBaseQuery =
  (
    agency = false,
  ): BaseQueryFn<
    string | FetchArgs,
    unknown,
    FetchBaseQueryError,
    Parameters<typeof raw>[2],
    FetchBaseQueryMeta
  > =>
  async (args, api, options) => {
    const request: FetchArgs =
      typeof args === 'string' ? { url: args } : { ...args }
    request.method = (request.method || 'GET').toUpperCase()
    const headers = new Headers(request.headers as HeadersInit | undefined)
    if (agency && auth(api).accessToken)
      headers.set('Authorization', `Bearer ${auth(api).accessToken}`)
    if (
      request.method &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
    ) {
      const protection = await csrf(api)
      if ('error' in protection) return { error: protection.error! }
      headers.set('X-XSRF-TOKEN', protection.token)
    }
    request.headers = headers
    let result = await raw(request, api, options)
    const sessionOperation = request.url.startsWith('auth/')
    if (
      agency &&
      result.error?.status === 401 &&
      !sessionOperation &&
      auth(api).status === 'authenticated'
    ) {
      if (await refreshSession(api)) {
        headers.set('Authorization', `Bearer ${auth(api).accessToken}`)
        // Refresh rotates server CSRF state. Never replay a write with the old nonce.
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method || 'GET')) {
          const protection = await csrf(api)
          if ('error' in protection) return { error: protection.error! }
          headers.set('X-XSRF-TOKEN', protection.token)
        }
        result = await raw(request, api, options)
      }
    }
    return result
  }

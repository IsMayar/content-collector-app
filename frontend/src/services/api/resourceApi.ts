import { useAppSelector } from '@/shared/hooks/useAppStore'
import { agencyApi } from '@/services/api/baseApi'
import { clientApi } from '@/services/api/clientApi'
import { validateProductRead } from '@/services/api/resourceSchemas'
import type { FetchArgs } from '@reduxjs/toolkit/query'

function commandHeaders(args: FetchArgs) {
  const headers = new Headers()
  if (args.headers instanceof Headers)
    args.headers.forEach((value, key) => headers.set(key, value))
  else
    for (const [key, value] of Array.isArray(args.headers)
      ? args.headers
      : Object.entries(args.headers || {}))
      if (key && value !== undefined) headers.set(key, value)
  if (!headers.has('Idempotency-Key'))
    headers.set('Idempotency-Key', crypto.randomUUID())
  return headers
}
const agency = agencyApi.enhanceEndpoints({ addTagTypes: ['Product'] })
const client = clientApi.enhanceEndpoints({ addTagTypes: ['ClientProduct'] })
export const workspaceApi = agency.injectEndpoints({
  endpoints: (build) => ({
    read: build.query<unknown, string>({
      async queryFn(path, _api, _extra, baseQuery) {
        const result = await baseQuery(path)
        if (result.error) return { error: result.error }
        const parsed = validateProductRead(path, result.data)
        return parsed.success
          ? { data: parsed.data }
          : {
              error: {
                status: 'CUSTOM_ERROR',
                error:
                  'The service returned an incompatible response. Try again or contact your agency.',
              },
            }
      },
      providesTags: ['Product'],
    }),
    command: build.mutation<unknown, FetchArgs>({
      query: (args) => ({
        ...args,
        headers: commandHeaders(args),
      }),
      invalidatesTags: ['Product'],
    }),
  }),
})
export const portalApi = client.injectEndpoints({
  endpoints: (build) => ({
    portalRead: build.query<unknown, string>({
      async queryFn(path, _api, _extra, baseQuery) {
        const result = await baseQuery(path)
        if (result.error) return { error: result.error }
        const parsed = validateProductRead(path, result.data)
        return parsed.success
          ? { data: parsed.data }
          : {
              error: {
                status: 'CUSTOM_ERROR',
                error:
                  'The service returned an incompatible response. Try again or contact your agency.',
              },
            }
      },
      providesTags: ['ClientProduct'],
    }),
    portalCommand: build.mutation<unknown, FetchArgs>({
      query: (args) => ({
        ...args,
        headers: commandHeaders(args),
      }),
      invalidatesTags: ['ClientProduct'],
    }),
  }),
})
export function useData<T>(
  path: string,
  options: { skip?: boolean; pollingInterval?: number } = {},
) {
  const query = workspaceApi.useReadQuery(path, {
    refetchOnMountOrArgChange: true,
    skip: !path || options.skip,
    pollingInterval: options.pollingInterval,
  })
  return { ...query, data: query.data as T | undefined }
}
export function usePortalData<T>(
  path: string,
  options: { skip?: boolean; pollingInterval?: number } = {},
) {
  const blocked = useAppSelector((s) => s.clientAccess.blocked)
  const query = portalApi.usePortalReadQuery(path, {
    refetchOnMountOrArgChange: true,
    skip: !path || options.skip || (blocked && path.startsWith('client/')),
    pollingInterval: options.pollingInterval,
  })
  return { ...query, data: query.currentData as T | undefined }
}

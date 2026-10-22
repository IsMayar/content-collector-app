import type { FetchArgs } from '@reduxjs/toolkit/query'
import { agencyApi } from './agencyApi'
import { clientApi } from './clientApi'

const agency = agencyApi.enhanceEndpoints({ addTagTypes: ['Product'] })
const client = clientApi.enhanceEndpoints({ addTagTypes: ['ClientProduct'] })
export const workspaceApi = agency.injectEndpoints({
  endpoints: (build) => ({
    read: build.query<unknown, string>({
      query: (path) => path,
      providesTags: ['Product'],
    }),
    command: build.mutation<unknown, FetchArgs>({
      query: (args) => ({
        ...args,
        headers: { 'Idempotency-Key': crypto.randomUUID(), ...args.headers },
      }),
      invalidatesTags: ['Product'],
    }),
  }),
})
export const portalApi = client.injectEndpoints({
  endpoints: (build) => ({
    portalRead: build.query<unknown, string>({
      query: (path) => path,
      providesTags: ['ClientProduct'],
    }),
    portalCommand: build.mutation<unknown, FetchArgs>({
      query: (args) => ({
        ...args,
        headers: { 'Idempotency-Key': crypto.randomUUID(), ...args.headers },
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
    skip: !path || options.skip,
    pollingInterval: options.pollingInterval,
  })
  return { ...query, data: query.data as T | undefined }
}
export function usePortalData<T>(
  path: string,
  options: { skip?: boolean; pollingInterval?: number } = {},
) {
  const query = portalApi.usePortalReadQuery(path, {
    skip: !path || options.skip,
    pollingInterval: options.pollingInterval,
  })
  return { ...query, data: query.data as T | undefined }
}

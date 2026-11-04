import { createApi } from '@reduxjs/toolkit/query/react'
import { createBaseQuery } from '@/services/api/baseQuery'
import { z } from 'zod'
export const statusCounts = z.strictObject({
  alias: z.string(),
  approved: z.number().int().nonnegative(),
  submitted: z.number().int().nonnegative(),
  requiredTotal: z.number().int().nonnegative(),
  updatedAt: z.string(),
})
export const statusApi = createApi({
  reducerPath: 'statusApi',
  baseQuery: createBaseQuery(false, true),
  keepUnusedDataFor: 0,
  endpoints: (build) => ({
    exchangeStatus: build.mutation<
      { readToken: string },
      { shareId: string; token: string }
    >({
      query: (body) => ({
        url: 'status-shares/exchange',
        method: 'POST',
        body,
      }),
      transformResponse: (data: unknown) =>
        z.object({ readToken: z.string() }).parse(data),
    }),
    statusCounts: build.query<
      z.infer<typeof statusCounts>,
      { shareId: string; readToken: string }
    >({
      query: ({ shareId, readToken }) => ({
        url: `status-shares/${shareId}/counts`,
        headers: { 'X-Status-Token': readToken },
        cache: 'no-store',
      }),
      transformResponse: (data: unknown) => statusCounts.parse(data),
    }),
  }),
})
export const { useExchangeStatusMutation, useLazyStatusCountsQuery } = statusApi

import { createBaseQuery } from '@/services/api/baseQuery'
import { createApi } from '@reduxjs/toolkit/query/react'

export const clientApi = createApi({
  reducerPath: 'clientApi',
  refetchOnFocus: true,
  refetchOnReconnect: true,
  baseQuery: createBaseQuery(),
  endpoints: () => ({}),
})

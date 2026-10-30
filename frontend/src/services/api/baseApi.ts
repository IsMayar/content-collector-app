import { createBaseQuery } from '@/services/api/baseQuery'
import { createApi } from '@reduxjs/toolkit/query/react'

export const baseApi = createApi({
  reducerPath: 'agencyApi',
  refetchOnFocus: true,
  refetchOnReconnect: true,
  baseQuery: createBaseQuery(true),
  endpoints: () => ({}),
})
export { baseApi as agencyApi }

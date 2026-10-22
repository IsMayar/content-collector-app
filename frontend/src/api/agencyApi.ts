import { createApi } from '@reduxjs/toolkit/query/react'
import { createBaseQuery } from '@/api/baseQuery'

export const agencyApi = createApi({
  reducerPath: 'agencyApi',
  baseQuery: createBaseQuery(true),
  endpoints: () => ({}),
})

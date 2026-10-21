import { createApi } from '@reduxjs/toolkit/query/react'
import { createBaseQuery } from '@/api/baseQuery'

export const clientApi = createApi({
  reducerPath: 'clientApi',
  baseQuery: createBaseQuery(),
  endpoints: () => ({}),
})

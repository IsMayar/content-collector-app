import { fetchBaseQuery } from '@reduxjs/toolkit/query/react'

// Transport only. Authentication, CSRF and refresh behavior belong to T04/T06/T14.
// Each API creates its own transport so identity-specific behavior can evolve separately.
export const createBaseQuery = () => fetchBaseQuery({
  baseUrl: '/api/v1/',
  credentials: 'same-origin',
  timeout: 15_000,
})

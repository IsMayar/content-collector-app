export type UUID = string
export type Instant = string
export type LocalDate = string
export type Timezone = string
export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json }
export interface Problem {
  type: string
  title: string
  status: number
  code: string
  detail: string
  traceId: string
  currentVersion?: number
  errors: { fieldPath: string; message: string }[]
}
export interface Page {
  page: number
  size: number
  totalElements: number
}
export interface Paged<T> {
  data: T[]
  page: Page
}

export type Message = { message: string }

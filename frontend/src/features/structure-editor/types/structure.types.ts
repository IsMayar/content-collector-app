import type { UUID } from '@/shared/types/common.types'
export type ItemState =
  'NOT_STARTED' | 'DRAFT' | 'SUBMITTED' | 'CHANGES_REQUESTED' | 'APPROVED'
export type FieldType =
  | 'SHORT_TEXT'
  | 'LONG_TEXT'
  | 'URL'
  | 'SINGLE_SELECT'
  | 'MULTI_SELECT'
  | 'IMAGE'
  | 'FILE'
  | 'REPEATER'
export interface SelectOption {
  key: string
  label: string
}
export interface VisibilityCondition {
  dependsOnItemKey: string
  operator: 'EQUALS'
  optionKey: string
}
export interface RepeaterColumn {
  key: string
  label: string
  type:
    'SHORT_TEXT' | 'LONG_TEXT' | 'URL' | 'NUMBER' | 'SINGLE_SELECT' | 'IMAGE'
  required: boolean
  options?: SelectOption[]
}
export interface FieldValidation {
  minLength?: number
  maxLength?: number
  format?: 'email'
  minFiles?: number
  maxFiles?: number
  allowedExtensions?: string[]
  minOptions?: number
  maxOptions?: number
  options?: SelectOption[]
  allowedSchemes?: ('https' | 'http')[]
  maxRows?: number
  columns?: RepeaterColumn[]
}
export interface ItemDefinition {
  key: string
  label: string
  type: FieldType
  instructions: string
  example: string
  required: boolean
  validation: FieldValidation
  enabled?: boolean
  ai?: { enabled: boolean; targetWords: number }
  visibleWhen?: VisibilityCondition
}
export interface Section {
  id: UUID
  key: string
  title: string
  enabled: boolean
  sortOrder: number
  items: Item[]
}
export interface Item extends ItemDefinition {
  id: UUID
  sectionId: UUID
  sortOrder: number
  state: ItemState
  version: number
  currentRevisionId: UUID | null
  visible: boolean
}

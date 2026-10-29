import type { Section } from '@/features/structure-editor/types/structure.types'
import type {
  Instant,
  LocalDate,
  Timezone,
  UUID,
} from '@/shared/types/common.types'
export type ProjectType = 'WEBSITE' | 'WEB_APP' | 'MOBILE_APP'
export type ProjectState =
  'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED' | 'DELETION_PENDING'
export interface Assignment {
  memberId: UUID
  canReview: boolean
  canExport: boolean
}
export interface Client {
  id: UUID
  businessName: string
  contactName: string | null
  email: string | null
  version: number
}
export interface ProjectContact {
  id: UUID
  name: string
  email: string
  state: 'ACTIVE' | 'REVOKED'
  timezone: Timezone | null
  accessExpiresAt: Instant
  emailRemindersEnabled: boolean
}
export interface Progress {
  requiredTotal: number
  submittedRequired: number
  approvedRequired: number
  clientActionRequired: number
  optionalApproved: number
}
export interface ProjectSummary {
  id: UUID
  workspaceId: UUID
  title: string
  clientBusinessName: string
  projectType: ProjectType
  state: ProjectState
  dueDate: LocalDate
  timezone: Timezone
  progress: Progress
  updatedAt: Instant
}
export interface Project extends ProjectSummary {
  clientId: UUID
  version: number
  structureVersion: number
  aiEnabled: boolean
  permissions: {
    canEditStructure: boolean
    canReview: boolean
    canExport: boolean
    canManageAccess: boolean
  }
}

export interface ProjectDetail {
  project: Project
  progress: Project['progress']
  structure: Section[]
}

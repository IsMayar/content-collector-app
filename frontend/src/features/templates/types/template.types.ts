import type {
  Project,
  ProjectType,
} from '@/features/projects/types/project.types'
import type { ItemDefinition } from '@/features/structure-editor/types/structure.types'
import type { Instant, UUID } from '@/shared/types/common.types'
export interface TemplateSection {
  key: string
  title: string
  items: ItemDefinition[]
}
export interface TemplateDefinition {
  schemaVersion: 1
  version?: number
  key: string
  projectType: ProjectType
  industry: string
  title: string
  sections: TemplateSection[]
}
export interface TemplateSummary {
  id: UUID
  title: string
  projectType: ProjectType
  industry: string
  isBuiltin: boolean
  version: number
}
export interface TemplateVersion {
  id: UUID
  templateId: UUID
  versionNo: number
  definition: TemplateDefinition
  publishedAt: Instant
}

export interface TemplateCardData {
  id: string
  title: string
  projectType: Project['projectType']
  industry: string
  isBuiltin: boolean
  version: number
  versionId: string
}

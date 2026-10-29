import type { AssetSummary } from '@/features/projects/types/file.types'
import type {
  Progress,
  ProjectState,
  ProjectType,
} from '@/features/projects/types/project.types'
import type { ClientVisibleComment } from '@/features/review/types/review.types'
import type {
  ItemDefinition,
  ItemState,
} from '@/features/structure-editor/types/structure.types'
import type { Instant, LocalDate, UUID } from '@/shared/types/common.types'
export type RepeaterCell = string | number | UUID[]
export type AnswerValue =
  | { text: string }
  | { url: string }
  | { optionKey: string }
  | { optionKeys: string[] }
  | { assetIds: UUID[] }
  | { rows: { rowId: UUID; values: Record<string, RepeaterCell> }[] }
export interface Answer {
  itemId: UUID
  value: AnswerValue | Record<string, never>
  version: number
  savedAt: Instant
}
export interface SaveAnswerCommand {
  value: AnswerValue
  expectedVersion: number
  expectedStructureVersion: number
  saveOperationId: UUID
}
export interface SubmitCommand {
  expectedAnswerVersion: number
  expectedStructureVersion: number
}
export interface ClientProject {
  id: UUID
  title: string
  projectType: ProjectType
  state: ProjectState
  dueDate: LocalDate
  structureVersion: number
  agencyDisplayName: string
  aiEnabled: boolean
}
export interface ClientItem extends ItemDefinition {
  id: UUID
  state: ItemState
  version: number
  visible: boolean
  answer: Answer
  assets: AssetSummary[]
  comments: ClientVisibleComment[]
  canEdit: boolean
}
export interface ClientSection {
  id: UUID
  key: string
  title: string
  items: ClientItem[]
}
export interface ClientChecklist {
  project: ClientProject
  sections: ClientSection[]
  progress: Progress
}

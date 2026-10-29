import type {
  Progress,
  ProjectType,
} from '@/features/projects/types/project.types'
import type { Instant, UUID } from '@/shared/types/common.types'

export interface ClientInteractionEvent {
  clientEventId: UUID
  type: 'project_opened' | 'item_started'
  itemId?: UUID
  occurredAt?: Instant
}
export interface FrictionMetric {
  itemKey: string
  templateVersionId: UUID
  eligibleStarts: number
  completedObservationWindows: number
  startsWithoutSubmission: number
  rate: number | null
  insufficientData: boolean
  medianFirstSubmissionSeconds: number | null
  completedSubmissions: number
}
export interface ProjectAnalytics {
  sections?: { id: string; title: string; progress: Progress }[]
  progress: Progress
  friction: FrictionMetric[]
  generatedAt: Instant
}
export interface TemplateMetric extends FrictionMetric {
  projectType: ProjectType
  templateTitle: string
}

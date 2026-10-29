import type {
  Subscription,
  UsageSummary,
} from '@/features/billing/types/billing.types'
import type { Answer } from '@/features/client/types/client.types'
import type { AssetSummary } from '@/features/projects/types/file.types'
import type {
  Assignment,
  Client,
  Project,
} from '@/features/projects/types/project.types'
import type { ReminderPolicy } from '@/features/reminders/types/reminder.types'
import type {
  Comment,
  ExportSummary,
  SafeAuditEvent,
  SubmissionRevision,
} from '@/features/review/types/review.types'
import type { Section } from '@/features/structure-editor/types/structure.types'
import type {
  TemplateCardData,
  TemplateDefinition,
} from '@/features/templates/types/template.types'
import type {
  InviteSummary,
  Member,
  WorkspaceDetail,
} from '@/features/workspace/types/workspace.types'
export interface TemplateRecord extends TemplateCardData {
  definition: TemplateDefinition
  draft?: TemplateDefinition
  publishedVersions?: Record<string, TemplateDefinition>
}
export interface ProjectRecord {
  project: Project
  structure: Section[]
  answers: Record<string, Answer>
  revisions: Record<string, SubmissionRevision[]>
  comments: Record<string, Comment[]>
  assignments: Assignment[]
  contacts: import('@/features/projects/types/project.types').ProjectContact[]
  invitations: Record<string, InviteSummary & { token: string }>
  policy: ReminderPolicy
  activity: SafeAuditEvent[]
  assets: Record<
    string,
    AssetSummary & {
      uploadId: string
      expiresAt: number
      transferred: boolean
      polls: number
      content?: Blob
    }
  >
  exports: Record<
    string,
    ExportSummary & {
      polls: number
      content: string
      manifest: unknown
      fail?: boolean
    }
  >
  deliveries?: import('@/features/reminders/types/reminder.types').DeliverySummary[]
}
export interface WorkspaceRecord extends WorkspaceDetail {
  members: Member[]
  pendingInvites: (InviteSummary & {
    assignments?: {
      projectId: string
      canReview: boolean
      canExport: boolean
    }[]
  })[]
  clients: Client[]
  templates: TemplateRecord[]
  subscription: Subscription
  usage: UsageSummary
  digestEnabled: boolean
  logo: string
}

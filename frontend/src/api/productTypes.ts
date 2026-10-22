import type {
  Answer,
  AssetSummary,
  Assignment,
  Client,
  Comment,
  Entitlements,
  ExportSummary,
  InviteSummary,
  Member,
  Project,
  ReminderPolicy,
  SafeAuditEvent,
  Section,
  SubmissionRevision,
  Subscription,
  TemplateDefinition,
  UsageSummary,
  Workspace,
} from './contracts'
export * from './contracts'
export interface ProjectDetail {
  project: Project
  progress: Project['progress']
  structure: Section[]
}
export interface WorkspaceDetail {
  workspace: Workspace
  entitlements: Entitlements
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
  contacts: import('./contracts').ProjectContact[]
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
  deliveries?: import('./contracts').DeliverySummary[]
}
export interface WorkspaceRecord extends WorkspaceDetail {
  members: Member[]
  pendingInvites: InviteSummary[]
  clients: Client[]
  templates: TemplateRecord[]
  subscription: Subscription
  usage: UsageSummary
  digestEnabled: boolean
  logo: string
}

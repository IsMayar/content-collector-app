/**
 * Shared MVP contract types. These are specifications for HTTP DTOs,
 * not frontend components, runtime validation or authorization code.
 * Validate unknown JSON with Zod on the frontend and Bean Validation plus
 * domain validators on the backend. Never serialize JPA entities directly.
 */
export type UUID = string
export type Instant = string
export type LocalDate = string
export type Timezone = string
export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json }
export type ProjectType = 'WEBSITE' | 'WEB_APP' | 'MOBILE_APP'
export type ProjectState =
  'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED' | 'DELETION_PENDING'
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
export type WorkspaceRole = 'OWNER' | 'MEMBER'
export type PlanKey = 'SOLO' | 'AGENCY'
export type AssetState =
  | 'RESERVED'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'READY'
  | 'REJECTED'
  | 'FAILED'
  | 'DELETED'

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
export interface UserSummary {
  id: UUID
  email: string
  displayName: string
  verified: boolean
}
export interface SessionSummary {
  id: UUID
  createdAt: Instant
  lastSeenAt: Instant
  expiresAt: Instant
  current: boolean
  label: string
}
export interface Workspace {
  id: UUID
  name: string
  timezone: Timezone
  state: 'ACTIVE' | 'READ_ONLY' | 'SUSPENDED' | 'DELETION_PENDING'
  version: number
}
export interface MembershipSummary {
  memberId: UUID
  workspaceId: UUID
  workspaceName: string
  role: WorkspaceRole
}
export interface Member {
  id: UUID
  user: UserSummary
  role: WorkspaceRole
  state: 'ACTIVE' | 'DISABLED'
}
export interface InviteSummary {
  id: UUID
  email: string
  expiresAt: Instant
  state: 'PENDING' | 'CONSUMED' | 'REVOKED' | 'EXPIRED'
}
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
export interface Entitlements {
  planKey: PlanKey
  seats: number
  storageLimitBytes: number
  unlimitedActiveProjects: boolean
  aiDraftAllowance: number
  smsSegmentAllowance: number
  canWrite: boolean
  aiEnabled: boolean
  smsEnabled: boolean
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
export interface SubmissionSummary {
  revisionId: UUID
  itemId: UUID
  itemKey: string
  revisionNo: number
  submittedAt: Instant
}
export interface RevisionSummary extends SubmissionSummary {
  state: ItemState
}
export interface SubmissionRevision extends SubmissionSummary {
  structureVersion: number
  schemaSnapshot: ItemDefinition
  valueSnapshot: AnswerValue
  assets: AssetSummary[]
  submittedByContactId: UUID
}
export interface ReviewCommand {
  revisionId: UUID
  expectedItemVersion: number
  decision: 'APPROVE' | 'REQUEST_CHANGES'
  reason?: string
}
export interface ReviewDecision {
  id: UUID
  revisionId: UUID
  decision: 'APPROVE' | 'REQUEST_CHANGES'
  reason: string | null
  reviewedAt: Instant
  reviewerDisplayName: string
}
export interface ClientVisibleComment {
  id: UUID
  body: string
  authorDisplayName: string
  createdAt: Instant
  revisionId: UUID | null
}
export interface Comment extends ClientVisibleComment {
  visibility: 'CLIENT' | 'INTERNAL'
}
/** Deliberately separate DTO: no workspace settings, contact list or internal notes. */
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
export interface AssetSummary {
  id: UUID
  itemId: UUID
  originalName: string
  contentType: string | null
  state: AssetState
  sourceBytes: number
  retainedBytes: number
  keepOriginal: boolean
  availableVariants: ('ORIGINAL' | 'WORKING' | 'THUMBNAIL')[]
  rejectionCode: string | null
}
export interface UploadReservationCommand {
  itemId: UUID
  originalName: string
  contentType: string
  bytes: number
  keepOriginal: boolean
}
export interface UploadReservation {
  assetId: UUID
  uploadId: UUID
  putUrl: string
  requiredHeaders: Record<string, string>
  expiresAt: Instant
}
export interface AiDraftCommand {
  facts: string[]
  tone: string
  targetWords: number
  baseAnswerVersion: number
  consent: true
}
export interface AiDraftResult {
  draft: string
  factsUsed: string[]
  missingFacts: string[]
  warnings: string[]
}
export interface AiDraftJob {
  id: UUID
  itemId: UUID
  state:
    | 'QUEUED'
    | 'RUNNING'
    | 'SUCCEEDED'
    | 'REFUSED'
    | 'FAILED'
    | 'ACCEPTED'
    | 'EXPIRED'
  baseAnswerVersion: number
  result: AiDraftResult | null
  failureCode: string | null
}
export interface ReminderRule {
  id: UUID
  channel: 'EMAIL' | 'SMS'
  daysRelativeToDueDate: number
  localTime: string
  weekdaysOnly: boolean
}
export interface ReminderPolicy {
  version: number
  enabled: boolean
  paused: boolean
  timezone: Timezone
  rules: ReminderRule[]
}
export interface ReminderPreview {
  channel: 'EMAIL' | 'SMS'
  subject: string | null
  body: string
  eligible: boolean
  reasons: string[]
  estimatedSegments: number | null
}
export interface DeliverySummary {
  id: UUID
  channel: 'EMAIL' | 'SMS'
  dueAt: Instant
  state:
    | 'QUEUED'
    | 'SENDING'
    | 'ACCEPTED'
    | 'DELIVERED'
    | 'BOUNCED'
    | 'SUPPRESSED'
    | 'FAILED'
    | 'UNKNOWN'
    | 'CANCELLED'
  failureCode: string | null
}
export interface NotificationPreferences {
  emailEnabled: boolean
  timezone: Timezone | null
  smsStatus:
    | 'NOT_CONFIGURED'
    | 'UNVERIFIED'
    | 'VERIFIED_OPTED_IN'
    | 'OPTED_OUT'
    | 'UNAVAILABLE'
}
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
  progress: Progress
  friction: FrictionMetric[]
  generatedAt: Instant
}
export interface TemplateMetric extends FrictionMetric {
  projectType: ProjectType
  templateTitle: string
}
export interface SafeAuditEvent {
  id: UUID
  action: string
  resourceKind: string
  resourceId: UUID | null
  actorDisplayName: string
  occurredAt: Instant
}
export interface ExportCommand {
  format: 'APPROVED_ZIP' | 'APPROVED_JSON' | 'APPROVED_MARKDOWN'
  expectedProjectVersion: number
  includeOriginals: boolean
  acknowledgePartial: boolean
}
export interface ExportSummary {
  id: UUID
  state: 'QUEUED' | 'RUNNING' | 'READY' | 'FAILED' | 'EXPIRED' | 'CANCELLED'
  format: ExportCommand['format']
  projectVersion: number
  partial: boolean
  createdAt: Instant
  expiresAt: Instant
  olderThanCurrentProject: boolean
}
export interface Subscription {
  planKey: PlanKey
  state: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'READ_ONLY' | 'SUSPENDED'
  currentPeriodStart: Instant
  currentPeriodEnd: Instant
  cancelAtPeriodEnd: boolean
  graceEndsAt: Instant | null
  readOnlyEndsAt: Instant | null
}
export interface UsageSummary {
  periodStart: Instant
  periodEnd: Instant
  storageUsedBytes: number
  storageReservedBytes: number
  storageLimitBytes: number
  aiDraftsUsed: number
  aiDraftAllowance: number
  smsSegmentsUsed: number
  smsSegmentAllowance: number
  seatsUsed: number
  seatsReserved: number
  seatsLimit: number
}

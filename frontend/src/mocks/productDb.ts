import type { Project } from '@/features/projects/types/project.types'
import type {
  Item,
  Section,
} from '@/features/structure-editor/types/structure.types'
import type { TemplateDefinition } from '@/features/templates/types/template.types'
import catalog from '@/mocks/data/starterTemplates.json'
import { accountFixtures, agencyId, soloId } from '@/mocks/fixtures'
import type {
  ProjectRecord,
  TemplateRecord,
  WorkspaceRecord,
} from '@/mocks/types/fixtures.types'
import { initialValue, progressFor } from '@/shared/utils/domain'

export const demoProjectId = '33333333-3333-4333-8333-333333333333'
export const clone = <T>(value: T): T => structuredClone(value)
export const now = () => new Date().toISOString()
export const uid = () => crypto.randomUUID()
export const templates: TemplateRecord[] = (
  catalog.templates as unknown as TemplateDefinition[]
).map((definition, index) => ({
  id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, '0')}`,
  versionId: `55555555-5555-4555-8555-${String(index + 1).padStart(12, '0')}`,
  title: definition.title,
  projectType: definition.projectType,
  industry: definition.industry,
  version: 1,
  isBuiltin: true,
  definition,
}))
export const productDb = {
  workspaces: {} as Record<string, WorkspaceRecord>,
  projects: {} as Record<string, ProjectRecord>,
  client: null as null | {
    projectId: string
    contactId: string
    expiresAt: number
  },
  scenario: 'normal',
  usedInvitations: new Set<string>(),
  preferences: {} as Record<
    string,
    import('@/features/workspace/types/workspace.types').NotificationPreferences
  >,
  revokedSessions: new Set<string>(),
}
export function snapshotStructure(definition: TemplateDefinition): Section[] {
  return definition.sections.map((section, sortOrder) => {
    const id = uid()
    return {
      id,
      key: section.key,
      title: section.title,
      enabled: true,
      sortOrder,
      items: section.items.map(
        (item, order) =>
          ({
            ...clone(item),
            id: uid(),
            sectionId: id,
            sortOrder: order,
            state: 'NOT_STARTED',
            version: 1,
            currentRevisionId: null,
            visible: true,
          }) as Item,
      ),
    }
  })
}
export function createProject(
  workspaceId: string,
  values: {
    clientId: string
    title: string
    projectType: Project['projectType']
    dueDate: string
    timezone: string
    templateVersionId?: string
  },
  id = uid(),
): ProjectRecord {
  const workspace = productDb.workspaces[workspaceId]
  const template =
    [...templates, ...workspace.templates].find(
      (t) =>
        t.versionId === values.templateVersionId ||
        t.publishedVersions?.[values.templateVersionId || ''],
    ) || templates.find((t) => t.projectType === values.projectType)!
  const structure = snapshotStructure(
    template.publishedVersions?.[values.templateVersionId || ''] ||
      template.definition,
  )
  const project: Project = {
    id,
    workspaceId,
    title: values.title,
    projectType: values.projectType,
    dueDate: values.dueDate,
    timezone: values.timezone,
    clientId: values.clientId,
    clientBusinessName:
      workspace.clients.find((client) => client.id === values.clientId)
        ?.businessName || 'New customer',
    state: 'DRAFT',
    progress: progressFor(structure, {}),
    version: 1,
    structureVersion: 1,
    aiEnabled: true,
    updatedAt: now(),
    permissions: {
      canEditStructure: true,
      canReview: true,
      canExport: true,
      canManageAccess: true,
    },
  }
  const record: ProjectRecord = {
    project,
    structure,
    answers: {},
    revisions: {},
    comments: {},
    assignments: [],
    contacts: [],
    invitations: {},
    assets: {},
    exports: {},
    activity: [],
    policy: {
      version: 1,
      enabled: true,
      paused: false,
      timezone: values.timezone,
      rules: [-3, 0, 3].map((days) => ({
        id: uid(),
        channel: 'EMAIL',
        daysRelativeToDueDate: days,
        localTime: '10:00',
        weekdaysOnly: true,
      })),
    },
  }
  for (const item of structure.flatMap((s) => s.items))
    record.answers[item.id] = {
      itemId: item.id,
      value: initialValue(item.type),
      version: 1,
      savedAt: now(),
    }
  productDb.projects[id] = record
  return record
}
export function touch(
  record: ProjectRecord,
  action: string,
  actor = 'Alex Morgan',
) {
  record.project.version++
  record.project.updatedAt = now()
  record.project.progress = progressFor(record.structure, record.answers)
  record.activity.unshift({
    id: uid(),
    action,
    resourceKind: 'PROJECT',
    resourceId: record.project.id,
    actorDisplayName: actor,
    occurredAt: now(),
  })
}
export function resetProductDb() {
  productDb.projects = {}
  productDb.workspaces = {}
  productDb.client = null
  productDb.scenario = 'normal'
  productDb.usedInvitations = new Set()
  productDb.preferences = {}
  productDb.revokedSessions = new Set()
  const accounts = accountFixtures()
  for (const [id, name, plan] of [
    [agencyId, 'Northstar Studio', 'AGENCY'],
    [soloId, 'Juniper Creative', 'SOLO'],
  ] as const) {
    const members = Object.values(accounts)
      .filter((a) => a.memberships.some((m) => m.workspaceId === id))
      .map((a) => ({
        id: a.memberships.find((m) => m.workspaceId === id)!.memberId,
        user: a.user,
        role: a.memberships.find((m) => m.workspaceId === id)!.role,
        state: 'ACTIVE' as const,
      }))
    productDb.workspaces[id] = {
      workspace: {
        id,
        name,
        timezone: 'America/New_York',
        state: 'ACTIVE',
        version: 1,
      },
      entitlements: {
        planKey: plan,
        seats: plan === 'SOLO' ? 1 : 5,
        storageLimitBytes: 50e9,
        unlimitedActiveProjects: true,
        aiDraftAllowance: plan === 'SOLO' ? 100 : 300,
        smsSegmentAllowance: plan === 'SOLO' ? 25 : 100,
        canWrite: true,
        aiEnabled: true,
        smsEnabled: false,
      },
      members,
      pendingInvites: [],
      clients: [
        {
          id: uid(),
          businessName: id === agencyId ? 'Lamar Dental' : 'Juniper Kitchen',
          contactName: 'Morgan Lee',
          email: 'client@example.test',
          version: 1,
        },
      ],
      templates: [],
      logo: '',
      digestEnabled: true,
      subscription: {
        planKey: plan,
        state: 'TRIALING',
        currentPeriodStart: now(),
        currentPeriodEnd: new Date(Date.now() + 14 * 864e5).toISOString(),
        cancelAtPeriodEnd: false,
        graceEndsAt: null,
        readOnlyEndsAt: null,
      },
      usage: {
        periodStart: now(),
        periodEnd: new Date(Date.now() + 30 * 864e5).toISOString(),
        storageUsedBytes: 0,
        storageReservedBytes: 0,
        storageLimitBytes: 50e9,
        aiDraftsUsed: 0,
        aiDraftAllowance: plan === 'SOLO' ? 100 : 300,
        smsSegmentsUsed: 0,
        smsSegmentAllowance: plan === 'SOLO' ? 25 : 100,
        seatsUsed: members.length,
        seatsReserved: 0,
        seatsLimit: plan === 'SOLO' ? 1 : 5,
      },
    }
  }
  const first = createProject(
    agencyId,
    {
      clientId: productDb.workspaces[agencyId].clients[0].id,
      title: 'Lamar Dental website',
      projectType: 'WEBSITE',
      dueDate: '2026-11-15',
      timezone: 'America/New_York',
      templateVersionId: templates[2].versionId,
    },
    demoProjectId,
  )
  first.project.state = 'ACTIVE'
  first.assignments.push({
    memberId: accounts['member@studio.example'].memberships.find(
      (m) => m.workspaceId === agencyId,
    )!.memberId,
    canReview: true,
    canExport: false,
  })
  first.contacts.push({
    id: uid(),
    name: 'Morgan Lee',
    email: 'client@example.test',
    state: 'ACTIVE',
    timezone: 'America/New_York',
    accessExpiresAt: new Date(Date.now() + 90 * 864e5).toISOString(),
    emailRemindersEnabled: true,
  })
  first.invitations[first.contacts[0].id] = {
    id: uid(),
    email: 'client@example.test',
    expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
    state: 'PENDING',
    token: 'client-demo',
  }
  touch(first, 'Project created from Dentist website template')
  createProject(agencyId, {
    clientId: productDb.workspaces[agencyId].clients[0].id,
    title: 'Northstar client portal',
    projectType: 'WEB_APP',
    dueDate: '2026-12-01',
    timezone: 'America/New_York',
  })
  createProject(soloId, {
    clientId: productDb.workspaces[soloId].clients[0].id,
    title: 'Juniper recipe app',
    projectType: 'MOBILE_APP',
    dueDate: '2026-12-15',
    timezone: 'America/New_York',
  })
}
resetProductDb()

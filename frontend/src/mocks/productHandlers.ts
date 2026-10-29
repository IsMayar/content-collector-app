import type { TemplateDefinition } from '@/features/templates/types/template.types'
import { mockState } from '@/mocks/handlers'
import {
  clone,
  createProject,
  productDb,
  templates,
  touch,
  uid,
} from '@/mocks/productDb'
import type { ProjectRecord } from '@/mocks/types/fixtures.types'
import { apiBaseUrl } from '@/services/api/baseQuery'
import { progressFor } from '@/shared/utils/domain'
import { delay, http, HttpResponse } from 'msw'

export const apiRoot = new URL(
  apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`,
  window.location.origin,
).href
export class MockProblem extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public currentVersion?: number,
  ) {
    super(message)
  }
}
export function requireRule(
  condition: unknown,
  status: number,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new MockProblem(status, code, message)
}
export const response = (value: unknown, status = 200) =>
  HttpResponse.json(value as Record<string, unknown>, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
export function failure(error: unknown) {
  const e =
    error instanceof MockProblem
      ? error
      : new MockProblem(
          500,
          'MOCK_FAILURE',
          'The simulated service could not complete this request.',
        )
  return response(
    {
      type: 'about:blank',
      title: 'Request could not be completed',
      status: e.status,
      code: e.code,
      detail: e.message,
      traceId: 'synthetic-product-trace',
      currentVersion: e.currentVersion,
      errors: [],
    },
    e.status,
  )
}
export function agencyActor(
  request: Request,
  workspaceId: string,
  owner = false,
  write = false,
) {
  const user = mockState.activeEmail
    ? mockState.accounts[mockState.activeEmail]
    : undefined
  requireRule(
    user &&
      request.headers.get('Authorization') === `Bearer ${mockState.token}`,
    401,
    'SESSION_EXPIRED',
    'Sign in again.',
  )
  const workspace = productDb.workspaces[workspaceId]
  const membership = user.memberships.find((m) => m.workspaceId === workspaceId)
  requireRule(
    workspace &&
      membership &&
      workspace.members.some(
        (m) => m.user.id === user.user.id && m.state === 'ACTIVE',
      ),
    404,
    'NOT_FOUND',
    'This workspace is not available.',
  )
  requireRule(
    !owner || membership.role === 'OWNER',
    403,
    'FORBIDDEN',
    'Only the workspace owner can do that.',
  )
  requireRule(
    !write ||
      (workspace.entitlements.canWrite &&
        workspace.workspace.state === 'ACTIVE'),
    403,
    'READ_ONLY',
    'This workspace is read-only. You can still read and export permitted content.',
  )
  return { user, workspace, membership }
}
export function agencyProject(
  request: Request,
  workspaceId: string,
  projectId: string,
  action: 'read' | 'owner' | 'review' | 'export' = 'read',
  write = false,
) {
  const actor = agencyActor(request, workspaceId, action === 'owner', write)
  const record = productDb.projects[projectId]
  requireRule(
    record &&
      record.project.workspaceId === workspaceId &&
      record.project.state !== 'DELETION_PENDING',
    404,
    'NOT_FOUND',
    'Project not available.',
  )
  const assignment = record.assignments.find(
    (a) => a.memberId === actor.membership.memberId,
  )
  requireRule(
    actor.membership.role === 'OWNER' || assignment,
    404,
    'NOT_FOUND',
    'Project not available.',
  )
  requireRule(
    action !== 'review' ||
      actor.membership.role === 'OWNER' ||
      assignment?.canReview,
    403,
    'FORBIDDEN',
    'Reviewer permission is required.',
  )
  requireRule(
    action !== 'export' ||
      actor.membership.role === 'OWNER' ||
      assignment?.canExport,
    403,
    'FORBIDDEN',
    'Export permission is required.',
  )
  record.project.progress = progressFor(record.structure, record.answers)
  const project = clone(record.project)
  project.permissions = {
    canEditStructure: actor.membership.role === 'OWNER',
    canReview: actor.membership.role === 'OWNER' || !!assignment?.canReview,
    canExport: actor.membership.role === 'OWNER' || !!assignment?.canExport,
    canManageAccess: actor.membership.role === 'OWNER',
  }
  return { ...actor, record, project }
}
export function checkVersion(
  actual: number,
  expected: unknown,
  kind = 'VERSION_CONFLICT',
) {
  if (actual !== expected)
    throw new MockProblem(
      409,
      kind,
      'This content changed since you opened it. Reload the latest version; your local input is retained.',
      actual,
    )
}
export function paged<T>(values: T[], search: URLSearchParams) {
  const size = Math.max(1, Math.min(100, Number(search.get('size') || 12)))
  const page = Math.max(0, Number(search.get('page') || 0))
  return {
    data: values.slice(page * size, (page + 1) * size),
    page: { page, size, totalElements: values.length },
  }
}
export type ProductResolver = (
  request: Request,
  path: string[],
  search: URLSearchParams,
  body: Record<string, unknown>,
) => Promise<Response | null> | Response | null
const resolvers: ProductResolver[] = []
export function registerProductResolver(resolver: ProductResolver) {
  resolvers.push(resolver)
}
export function projectList(request: Request, workspaceId: string) {
  const actor = agencyActor(request, workspaceId)
  return Object.values(productDb.projects)
    .filter(
      (r) =>
        r.project.workspaceId === workspaceId &&
        r.project.state !== 'DELETION_PENDING' &&
        (actor.membership.role === 'OWNER' ||
          r.assignments.some((a) => a.memberId === actor.membership.memberId)),
    )
    .map((r) => agencyProject(request, workspaceId, r.project.id).project)
}
function foundation(
  request: Request,
  path: string[],
  search: URLSearchParams,
  body: Record<string, unknown>,
): Response | null {
  const method = request.method
  const [, workspaceId, resource, resourceId] = path
  if (path[0] !== 'workspaces') return null
  if (path.length === 1 && method === 'POST') {
    const user = mockState.activeEmail
      ? mockState.accounts[mockState.activeEmail]
      : undefined
    requireRule(
      user &&
        request.headers.get('Authorization') === `Bearer ${mockState.token}`,
      401,
      'SESSION_EXPIRED',
      'Sign in again.',
    )
    requireRule(
      !user.memberships.some((m) => m.role === 'OWNER'),
      409,
      'OWNER_LIMIT',
      'You may own one workspace. Switch to your existing workspace.',
    )
    requireRule(
      typeof body.name === 'string' && body.name.trim().length >= 2,
      422,
      'VALIDATION',
      'Enter a workspace name.',
    )
    const base = clone(
      Object.values(productDb.workspaces)[body.planKey === 'AGENCY' ? 0 : 1],
    )
    const id = uid()
    base.workspace = {
      ...base.workspace,
      id,
      name: body.name.trim(),
      timezone: typeof body.timezone === 'string' ? body.timezone : 'UTC',
      state: 'ACTIVE',
      version: 1,
    }
    base.members = [
      { id: user.user.id, user: user.user, role: 'OWNER', state: 'ACTIVE' },
    ]
    base.clients = []
    base.templates = []
    base.pendingInvites = []
    base.usage.seatsUsed = 1
    base.usage.seatsReserved = 0
    base.usage.storageUsedBytes = 0
    base.usage.storageReservedBytes = 0
    base.usage.aiDraftsUsed = 0
    base.usage.smsSegmentsUsed = 0
    base.logo = ''
    base.digestEnabled = true
    base.entitlements.canWrite = true
    base.subscription = {
      ...base.subscription,
      state: 'TRIALING',
      cancelAtPeriodEnd: false,
      graceEndsAt: null,
      readOnlyEndsAt: null,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 14 * 864e5).toISOString(),
    }
    productDb.workspaces[id] = base
    user.memberships.push({
      memberId: user.user.id,
      workspaceId: id,
      workspaceName: base.workspace.name,
      role: 'OWNER',
    })
    return response({ workspace: base.workspace }, 201)
  }
  if (!workspaceId) return null
  const actor = agencyActor(request, workspaceId)
  if (path.length === 2 && method === 'GET')
    return response({
      workspace: actor.workspace.workspace,
      entitlements: actor.workspace.entitlements,
    })
  if (resource === 'clients' && !resourceId) {
    if (method === 'GET')
      return response(paged(actor.workspace.clients, search))
    if (method === 'POST') {
      agencyActor(request, workspaceId, true, true)
      requireRule(
        body.businessName && body.email,
        422,
        'VALIDATION',
        'Customer name and contact email are required.',
      )
      const client = {
        id: uid(),
        businessName: String(body.businessName),
        contactName: String(body.contactName || ''),
        email: String(body.email),
        version: 1,
      }
      actor.workspace.clients.push(client)
      return response({ client }, 201)
    }
  }
  if (resource === 'templates' && !resourceId) {
    if (method === 'GET')
      return response({
        data: [...templates, ...actor.workspace.templates].map((t) => ({
          id: t.id,
          versionId: t.versionId,
          title: t.title,
          projectType: t.projectType,
          industry: t.industry,
          isBuiltin: t.isBuiltin,
          version: t.version,
        })),
      })
    if (method === 'POST') {
      agencyActor(request, workspaceId, true, true)
      const definition = body.definition as unknown as TemplateDefinition
      requireRule(
        definition?.sections?.length && definition.title,
        422,
        'VALIDATION',
        'A titled template with sections is required.',
      )
      const template = {
        id: uid(),
        versionId: uid(),
        title: definition.title,
        projectType: definition.projectType,
        industry: definition.industry || 'CUSTOM',
        isBuiltin: false,
        version: 1,
        definition: clone(definition),
      }
      actor.workspace.templates.push(template)
      return response({ template }, 201)
    }
  }
  if (resource === 'template-versions' && method === 'GET') {
    const template = [...templates, ...actor.workspace.templates].find(
      (t) => t.versionId === resourceId || t.publishedVersions?.[resourceId],
    )
    requireRule(template, 404, 'NOT_FOUND', 'Template not available.')
    return response({
      definition:
        template.publishedVersions?.[resourceId] || template.definition,
    })
  }
  if (resource === 'projects' && !resourceId) {
    if (method === 'GET') {
      requireRule(
        productDb.scenario !== 'list-failure',
        503,
        'TEMPORARY_FAILURE',
        'The project list is temporarily unavailable. Try again.',
      )
      let projects = projectList(request, workspaceId)
      if (productDb.scenario === 'empty') projects = []
      const query = (search.get('search') || '').toLowerCase()
      const type = search.get('projectType')
      const state = search.get('state')
      projects = projects.filter(
        (p) =>
          (!query ||
            `${p.title} ${p.clientBusinessName}`
              .toLowerCase()
              .includes(query)) &&
          (!type || p.projectType === type) &&
          (!state || p.state === state),
      )
      projects.sort((a, b) =>
        search.get('sort') === 'title'
          ? a.title.localeCompare(b.title)
          : search.get('sort') === 'dueDate'
            ? a.dueDate.localeCompare(b.dueDate)
            : b.updatedAt.localeCompare(a.updatedAt),
      )
      return response(paged(projects, search))
    }
    if (method === 'POST') {
      agencyActor(request, workspaceId, true, true)
      requireRule(
        ['WEBSITE', 'WEB_APP', 'MOBILE_APP'].includes(
          String(body.projectType),
        ) &&
          body.title &&
          /^\d{4}-\d{2}-\d{2}$/.test(String(body.dueDate)) &&
          actor.workspace.clients.some((c) => c.id === body.clientId),
        422,
        'VALIDATION',
        'Choose a customer, project type, title and due date.',
      )
      if (body.templateVersionId) {
        const template = [...templates, ...actor.workspace.templates].find(
          (t) =>
            t.versionId === body.templateVersionId ||
            t.publishedVersions?.[String(body.templateVersionId)],
        )
        requireRule(
          template && template.projectType === body.projectType,
          422,
          'TEMPLATE_TYPE',
          'Choose an available template for this project type.',
        )
      }
      const record = createProject(
        workspaceId,
        body as unknown as Parameters<typeof createProject>[1],
      )
      touch(record, 'Project created from independent template snapshot')
      return response({ project: record.project }, 201)
    }
  }
  if (resource === 'projects' && resourceId && path.length === 4) {
    const { record, project } = agencyProject(
      request,
      workspaceId,
      resourceId,
      method === 'GET' ? 'read' : 'owner',
      method !== 'GET',
    )
    if (method === 'GET')
      return response({
        project,
        progress: project.progress,
        structure: record.structure,
      })
    if (method === 'PATCH') {
      checkVersion(record.project.version, body.expectedVersion)
      for (const key of ['title', 'dueDate', 'timezone'] as const)
        if (typeof body[key] === 'string')
          record.project[key] = body[key] as string
      touch(record, 'Project details updated')
      return response({ project: record.project })
    }
  }
  return null
}
export const productHandlers = [
  http.all(`${apiRoot}*`, async ({ request }) => {
    try {
      const target = new URL(request.url)
      const path = target.pathname
        .slice(new URL(apiRoot).pathname.length)
        .split('/')
        .filter(Boolean)
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method))
        requireRule(
          request.headers.get('X-XSRF-TOKEN') === mockState.csrf,
          403,
          'CSRF_INVALID',
          'Refresh the page to renew your request protection.',
        )
      const body =
        request.method === 'GET' || request.method === 'DELETE'
          ? {}
          : ((await request.json().catch(() => ({}))) as Record<
              string,
              unknown
            >)
      await delay(100)
      for (const resolver of [foundation, ...resolvers]) {
        const result = await resolver(request, path, target.searchParams, body)
        if (result) return result
      }
      return response(
        {
          detail: 'This operation is not available in this mock.',
          code: 'MOCK_NOT_IMPLEMENTED',
        },
        501,
      )
    } catch (error) {
      return failure(error)
    }
  }),
]
export function itemIn(record: ProjectRecord, id: string) {
  const item = record.structure.flatMap((s) => s.items).find((i) => i.id === id)
  requireRule(item, 404, 'NOT_FOUND', 'Item not available.')
  return item
}

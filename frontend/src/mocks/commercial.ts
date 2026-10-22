import {
  agencyActor,
  agencyProject,
  checkVersion,
  itemIn,
  registerProductResolver,
  requireRule,
  response,
} from './productHandlers'
import { clientProject } from './collection'
import { now, productDb, touch, uid } from './productDb'
import { progressFor } from '@/lib/domain'
import { mockState } from './handlers'
import type { AiDraftJob } from '@/api/contracts'
const jobs = new Map<
  string,
  AiDraftJob & { projectId: string; polls: number }
>()
const shares = new Map<
  string,
  {
    projectId: string
    token: string
    readToken: string
    expiresAt: number
    revoked: boolean
    origins: string[]
    alias: string
  }
>()
registerProductResolver((request, path, _search, body) => {
  const [domain, wid, resource, pid, area, id] = path
  const method = request.method
  if (domain === 'demo' && wid === 'scenario') {
    requireRule(
      import.meta.env.DEV || import.meta.env.MODE === 'test',
      404,
      'NOT_FOUND',
      'Unavailable.',
    )
    const scenario = String(body.scenario)
    requireRule(
      [
        'normal',
        'empty',
        'list-failure',
        'quota',
        'read-only',
        'ai-failure',
        'export-failure',
        'conflict',
        'expired-client',
      ].includes(scenario),
      422,
      'VALIDATION',
      'Unknown scenario.',
    )
    productDb.scenario = scenario
    for (const w of Object.values(productDb.workspaces)) {
      w.entitlements.canWrite = scenario !== 'read-only'
      w.workspace.state = scenario === 'read-only' ? 'READ_ONLY' : 'ACTIVE'
    }
    if (scenario === 'expired-client' && productDb.client)
      productDb.client.expiresAt = 0
    if (scenario === 'conflict')
      for (const r of Object.values(productDb.projects))
        for (const a of Object.values(r.answers)) a.version++
    return response({ scenario })
  }
  if (domain === 'me' && wid === 'sessions') {
    const account =
      mockState.activeEmail && mockState.accounts[mockState.activeEmail]
    requireRule(
      account &&
        request.headers.get('Authorization') === `Bearer ${mockState.token}`,
      401,
      'SESSION_EXPIRED',
      'Sign in again.',
    )
    if (method === 'GET')
      return response({
        data: [
          {
            id: 'current',
            label: 'This browser',
            current: true,
            createdAt: now(),
            lastSeenAt: now(),
            expiresAt: new Date(Date.now() + 8 * 36e5).toISOString(),
          },
          {
            id: 'other',
            label: 'Demo other device',
            current: false,
            createdAt: now(),
            lastSeenAt: now(),
            expiresAt: new Date(Date.now() + 36e5).toISOString(),
          },
        ],
      })
    requireRule(
      resource !== 'current',
      409,
      'CURRENT_SESSION',
      'Use Sign out for your current session.',
    )
    return response({ revoked: true })
  }
  if (domain === 'status-shares') {
    const share = shares.get(wid)
    requireRule(
      share && !share.revoked && share.expiresAt > Date.now(),
      410,
      'SHARE_UNAVAILABLE',
      'This status share has expired or was revoked.',
    )
    if (resource === 'exchange') {
      requireRule(
        body.token === share.token,
        403,
        'INVALID_TOKEN',
        'Invalid share token.',
      )
      return response({ readToken: share.readToken, alias: share.alias })
    }
    requireRule(
      request.headers.get('X-Status-Token') === share.readToken,
      403,
      'INVALID_TOKEN',
      'Status access required.',
    )
    const origin = request.headers.get('Origin')
    requireRule(
      !origin || share.origins.length === 0 || share.origins.includes(origin),
      403,
      'ORIGIN_DENIED',
      'This embed origin is not allowed.',
    )
    const r = productDb.projects[share.projectId]
    return response({
      alias: share.alias,
      projectType: r.project.projectType,
      state: r.project.state,
      progress: progressFor(r.structure, r.answers),
      updatedAt: r.project.updatedAt,
    })
  }
  if (domain === 'client' && wid === 'projects') {
    if (resource && area === 'ai-drafts') {
      return null
    }
    const projectId = resource
    const { record: r } = clientProject(projectId, method !== 'GET')
    const w = productDb.workspaces[r.project.workspaceId]
    if (pid === 'items' && area && id === 'ai-drafts') {
      const item = itemIn(r, area)
      requireRule(
        item.type === 'LONG_TEXT' && item.ai?.enabled && r.project.aiEnabled,
        403,
        'AI_DISABLED',
        'Assistance is not enabled for this item.',
      )
      checkVersion(r.answers[item.id].version, body.baseAnswerVersion)
      requireRule(
        body.consent === true &&
          Array.isArray(body.facts) &&
          body.facts.length > 0 &&
          (body.facts as unknown[]).every(
            (f) => typeof f === 'string' && f.trim().length > 0,
          ),
        422,
        'FACTS_REQUIRED',
        'Add facts and explicitly consent before generating.',
      )
      requireRule(
        w.usage.aiDraftsUsed < w.usage.aiDraftAllowance,
        409,
        'AI_ALLOWANCE',
        'No AI drafts remain this period. You can keep writing normally.',
      )
      w.usage.aiDraftsUsed++
      const facts = (body.facts as string[]).map((f) => f.trim()).slice(0, 20)
      const j = {
        id: uid(),
        itemId: item.id,
        projectId,
        state: 'QUEUED' as const,
        baseAnswerVersion: r.answers[item.id].version,
        result: {
          draft: facts.join(' '),
          factsUsed: facts,
          missingFacts: [
            'Review and add any missing details before submitting.',
          ],
          warnings: [
            'Synthetic draft assembled only from your facts. Verify all statements.',
          ],
        },
        failureCode: null,
        polls: 0,
      }
      jobs.set(j.id, j)
      return response({ job: j }, 202)
    }
    if (pid === 'ai-drafts' && area) {
      const j = jobs.get(area)
      requireRule(
        j && j.projectId === projectId,
        404,
        'NOT_FOUND',
        'Suggestion unavailable.',
      )
      if (id === 'accept') {
        const item = itemIn(r, j.itemId)
        requireRule(
          !['APPROVED', 'SUBMITTED'].includes(item.state) &&
            j.state === 'SUCCEEDED',
          409,
          'ITEM_LOCKED',
          'This suggestion cannot be accepted now.',
        )
        checkVersion(r.answers[item.id].version, body.expectedAnswerVersion)
        checkVersion(
          r.answers[item.id].version,
          j.baseAnswerVersion,
          'STALE_SUGGESTION',
        )
        r.answers[item.id] = {
          itemId: item.id,
          value: { text: j.result!.draft },
          version: r.answers[item.id].version + 1,
          savedAt: now(),
        }
        item.state = 'DRAFT'
        item.version++
        j.state = 'ACCEPTED'
        touch(r, 'AI suggestion explicitly accepted')
        return response({ answer: r.answers[item.id] })
      }
      if (['QUEUED', 'RUNNING'].includes(j.state))
        j.state =
          ++j.polls >= 2
            ? productDb.scenario === 'ai-failure'
              ? 'FAILED'
              : 'SUCCEEDED'
            : 'RUNNING'
      if (j.state === 'FAILED') j.failureCode = 'PROVIDER_UNAVAILABLE'
      return response({ job: j })
    }
    return null
  }
  if (domain !== 'workspaces') return null
  if (
    resource === 'projects' &&
    pid &&
    ['analytics', 'status-shares'].includes(area)
  ) {
    const { record: r } = agencyProject(
      request,
      wid,
      pid,
      'owner',
      method !== 'GET',
    )
    if (area === 'analytics')
      return response({
        progress: progressFor(r.structure, r.answers),
        generatedAt: now(),
        friction: r.structure
          .flatMap((s) => s.items)
          .slice(0, 5)
          .map((i, index) => ({
            itemKey: i.key,
            templateVersionId: 'synthetic',
            eligibleStarts: index === 0 ? 18 : 4,
            completedObservationWindows: index === 0 ? 12 : 3,
            startsWithoutSubmission: index === 0 ? 3 : 1,
            rate: index === 0 ? 0.25 : null,
            insufficientData: index !== 0,
            medianFirstSubmissionSeconds: index === 0 ? 3600 : null,
            completedSubmissions: index === 0 ? 9 : 2,
          })),
      })
    if (!id && method === 'POST') {
      requireRule(
        body.alias && Date.parse(String(body.expiresAt)) > Date.now(),
        422,
        'VALIDATION',
        'Enter a public alias and future expiry.',
      )
      const shareId = uid()
      const token = uid()
      shares.set(shareId, {
        projectId: pid,
        token,
        readToken: uid(),
        expiresAt: Date.parse(String(body.expiresAt)),
        revoked: false,
        origins: Array.isArray(body.allowedOrigins)
          ? (body.allowedOrigins as string[])
          : [],
        alias: String(body.alias),
      })
      return response(
        {
          shareId,
          fragmentToken: token,
          url: `/status/${shareId}#token=${token}`,
        },
        201,
      )
    }
    if (id && method === 'DELETE') {
      const share = shares.get(id)
      requireRule(
        share?.projectId === pid,
        404,
        'NOT_FOUND',
        'Share unavailable.',
      )
      share.revoked = true
      return response({ revoked: true })
    }
  }
  const actor = agencyActor(request, wid, true, method !== 'GET')
  const w = actor.workspace
  if (path.length === 2 && method === 'PATCH') {
    checkVersion(w.workspace.version, body.expectedVersion)
    requireRule(
      body.name && body.timezone,
      422,
      'VALIDATION',
      'Name and timezone are required.',
    )
    w.workspace.name = String(body.name)
    w.workspace.timezone = String(body.timezone)
    w.workspace.version++
    w.digestEnabled = body.digestEnabled === true
    if (typeof body.logo === 'string') w.logo = body.logo
    return response({
      workspace: w.workspace,
      logo: w.logo,
      digestEnabled: w.digestEnabled,
    })
  }
  if (resource === 'settings' && method === 'GET')
    return response({
      workspace: w.workspace,
      logo: w.logo,
      digestEnabled: w.digestEnabled,
    })
  if (resource === 'subscription') return response(w.subscription)
  if (resource === 'usage') return response(w.usage)
  if (resource === 'billing' && ['checkout', 'portal'].includes(pid)) {
    requireRule(
      pid !== 'checkout' || ['SOLO', 'AGENCY'].includes(String(body.planKey)),
      422,
      'VALIDATION',
      'Choose a plan.',
    )
    return response({
      url: `/app/w/${wid}/billing?hosted=demo&plan=${body.planKey || w.subscription.planKey}`,
    })
  }
  if (resource === 'deletion-request') {
    requireRule(
      body.currentPassword === 'ContentDemo!2026' &&
        body.confirmation === w.workspace.name,
      422,
      'CONFIRMATION_REQUIRED',
      'Enter your password and exact workspace name.',
    )
    w.workspace.state = 'DELETION_PENDING'
    w.entitlements.canWrite = false
    return response({
      deleteAfter: new Date(Date.now() + 30 * 864e5).toISOString(),
    })
  }
  return null
})

import type {
  AnswerValue,
  ClientChecklist,
  ClientItem,
} from '@/features/client/types/client.types'
import type { SubmissionRevision } from '@/features/review/types/review.types'
import type { NotificationPreferences } from '@/features/workspace/types/workspace.types'
import { clone, now, productDb, touch, uid } from '@/mocks/productDb'
import {
  apiRoot,
  checkVersion,
  failure,
  itemIn,
  productHandlers,
  registerProductResolver,
  requireRule,
  response,
} from '@/mocks/productHandlers'
import {
  progressFor,
  validateAnswer,
  visibleItems,
} from '@/shared/utils/domain'
import { http, HttpResponse } from 'msw'

export function clientProject(projectId: string, write = false) {
  const session = productDb.client
  requireRule(
    session &&
      session.expiresAt > Date.now() &&
      session.projectId === projectId,
    401,
    'CLIENT_SESSION_EXPIRED',
    'Your private session has expired. Request a fresh link.',
  )
  const r = productDb.projects[projectId]
  const c = r?.contacts.find((c) => c.id === session.contactId)
  requireRule(
    r &&
      c &&
      c.state === 'ACTIVE' &&
      Date.parse(c.accessExpiresAt) > Date.now() &&
      !['ARCHIVED', 'DELETION_PENDING'].includes(r.project.state),
    403,
    'ACCESS_REVOKED',
    'This project link is no longer available. Contact the agency.',
  )
  requireRule(
    !write ||
      (r.project.state === 'ACTIVE' &&
        productDb.workspaces[r.project.workspaceId].entitlements.canWrite),
    409,
    'PROJECT_READ_ONLY',
    'Your project is currently read-only. Your saved draft is retained.',
  )
  return { record: r, contact: c }
}
export function checklist(
  r: import('@/mocks/types/fixtures.types').ProjectRecord,
  editable: boolean,
): ClientChecklist {
  const visible = visibleItems(r.structure, r.answers)
  return {
    project: {
      id: r.project.id,
      title: r.project.title,
      projectType: r.project.projectType,
      state: r.project.state,
      dueDate: r.project.dueDate,
      structureVersion: r.project.structureVersion,
      agencyDisplayName:
        productDb.workspaces[r.project.workspaceId].workspace.name,
      aiEnabled: r.project.aiEnabled,
    },
    progress: progressFor(r.structure, r.answers),
    sections: r.structure
      .filter((s) => s.enabled)
      .map((s) => ({
        id: s.id,
        key: s.key,
        title: s.title,
        items: s.items
          .filter((i) => visible.some((v) => v.id === i.id))
          .map(
            (i) =>
              ({
                key: i.key,
                id: i.id,
                label: i.label,
                type: i.type,
                instructions: i.instructions,
                example: i.example,
                required: i.required,
                validation: clone(i.validation),
                ai: i.ai,
                state: i.state,
                version: i.version,
                visible: true,
                answer: clone(r.answers[i.id]),
                assets: Object.values(r.assets)
                  .filter((a) => a.itemId === i.id && a.state !== 'DELETED')
                  .map((a) => ({
                    id: a.id,
                    itemId: a.itemId,
                    originalName: a.originalName,
                    contentType: a.contentType,
                    state: a.state,
                    sourceBytes: a.sourceBytes,
                    retainedBytes: a.retainedBytes,
                    keepOriginal: a.keepOriginal,
                    availableVariants: a.availableVariants,
                    rejectionCode: a.rejectionCode,
                  })),
                comments: (r.comments[i.id] || [])
                  .filter((c) => c.visibility === 'CLIENT')
                  .map(
                    ({
                      id,
                      body,
                      authorDisplayName,
                      createdAt,
                      revisionId,
                    }) => ({
                      id,
                      body,
                      authorDisplayName,
                      createdAt,
                      revisionId,
                    }),
                  ),
                canEdit:
                  editable &&
                  r.project.state === 'ACTIVE' &&
                  !['APPROVED', 'SUBMITTED'].includes(i.state),
              }) as ClientItem,
          ),
      })),
  }
}
const smsCodes = new Map<string, string>()
registerProductResolver((request, path, _search, body) => {
  const [domain, pid, resource, id, action] = path
  const method = request.method
  if (domain === 'client-access') {
    if (pid === 'exchange' && method === 'POST') {
      const token = String(body.token || '')
      const pair = Object.values(productDb.projects)
        .flatMap((record) =>
          Object.entries(record.invitations).map(([contactId, invitation]) => ({
            record,
            contactId,
            invitation,
          })),
        )
        .find((p) => p.invitation.token === token)
      requireRule(
        pair &&
          !productDb.usedInvitations.has(token) &&
          pair.invitation.state === 'PENDING' &&
          Date.parse(pair.invitation.expiresAt) > Date.now(),
        410,
        'LINK_UNAVAILABLE',
        'This link has expired or has already been used. Request a fresh link.',
      )
      const c = pair.record.contacts.find((c) => c.id === pair.contactId)
      requireRule(
        c?.state === 'ACTIVE' &&
          Date.parse(c.accessExpiresAt) > Date.now() &&
          pair.record.project.state === 'ACTIVE',
        403,
        'ACCESS_REVOKED',
        'This invitation is no longer active.',
      )
      productDb.usedInvitations.add(token)
      pair.invitation.state = 'CONSUMED'
      productDb.client = {
        projectId: pair.record.project.id,
        contactId: pair.contactId,
        expiresAt: Date.now() + 8 * 36e5,
      }
      return response({
        projectId: pair.record.project.id,
        expiresAt: new Date(productDb.client.expiresAt).toISOString(),
      })
    }
    if (pid === 'request-link' && method === 'POST') {
      const r = productDb.projects[String(body.projectId)]
      const c = r?.contacts.find(
        (c) =>
          c.email.toLowerCase() === String(body.email).toLowerCase() &&
          c.state === 'ACTIVE',
      )
      let demoUrl: string | undefined
      if (r && c) {
        const token = uid()
        r.invitations[c.id] = {
          id: uid(),
          email: c.email,
          expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
          state: 'PENDING',
          token,
        }
        demoUrl = `/client/access#token=${token}`
      }
      return response({
        message:
          'If this contact has active access, a fresh link will be sent.',
        ...(demoUrl ? { demoUrl } : {}),
      })
    }
    if (pid === 'logout') {
      productDb.client = null
      return response({ signedOut: true })
    }
    return null
  }
  if (domain !== 'client' || pid !== 'projects' || !resource) return null
  const projectId = resource
  const area = id
  const itemId = action
  const sub = path[5]
  const { record: r, contact } = clientProject(
    projectId,
    method !== 'GET' &&
      area !== 'events' &&
      area !== 'notification-preferences' &&
      area !== 'sms',
  )
  if (area === 'checklist' && method === 'GET')
    return response(checklist(r, true))
  if (area === 'events') return response({ accepted: true }, 202)
  if (area === 'notification-preferences') {
    const prefs = productDb.preferences[contact.id] || {
      emailEnabled: true,
      timezone: contact.timezone,
      smsStatus: 'NOT_CONFIGURED',
    }
    if (method === 'PUT') {
      requireRule(
        !body.timezone ||
          Intl.supportedValuesOf('timeZone').includes(String(body.timezone)) ||
          body.timezone === 'UTC',
        422,
        'INVALID_TIMEZONE',
        'Choose an IANA timezone.',
      )
      prefs.emailEnabled = body.emailEnabled === true
      prefs.timezone = String(body.timezone || 'UTC')
      productDb.preferences[contact.id] = prefs
      contact.emailRemindersEnabled = prefs.emailEnabled
      contact.timezone = prefs.timezone
    }
    const result = {
      ...prefs,
      smsAvailable: true,
      smsConsentTextVersion: '2026-11-03',
      smsUsage: {
        usedSegments: 0,
        reservedSegments: 0,
        allowance: 25,
        spendingLimitMicrousd: 1000000,
      },
    }
    return response(method === 'PUT' ? { preferences: result } : result)
  }
  if (area === 'sms') {
    const prefs = productDb.preferences[contact.id] || {
      emailEnabled: true,
      timezone: 'America/New_York',
      smsStatus: 'NOT_CONFIGURED' as NotificationPreferences['smsStatus'],
    }
    if (itemId === 'verification' && sub !== 'confirm') {
      requireRule(
        body.consent === true && /^\+1\d{10}$/.test(String(body.phoneE164)),
        422,
        'CONSENT_REQUIRED',
        'Enter a US +1 number and explicitly consent.',
      )
      const verificationId = uid()
      smsCodes.set(verificationId, contact.id)
      prefs.smsStatus = 'UNVERIFIED'
      productDb.preferences[contact.id] = prefs
      return response({ verificationId }, 202)
    }
    if (itemId === 'verification' && sub === 'confirm') {
      requireRule(
        smsCodes.get(String(body.verificationId)) === contact.id &&
          body.code === '123456',
        422,
        'INVALID_CODE',
        'Use the synthetic code 123456.',
      )
      prefs.smsStatus = 'VERIFIED_OPTED_IN'
      productDb.workspaces[r.project.workspaceId].entitlements.smsEnabled = true
    }
    if (itemId === 'consent' && method === 'DELETE')
      prefs.smsStatus = 'OPTED_OUT'
    productDb.preferences[contact.id] = prefs
    return response(prefs)
  }
  if (area === 'items' && itemId) {
    const item = itemIn(r, itemId)
    requireRule(
      visibleItems(r.structure, r.answers).some((i) => i.id === itemId),
      404,
      'NOT_FOUND',
      'Item unavailable.',
    )
    if (!sub && method === 'GET')
      return response({
        item: checklist(r, true)
          .sections.flatMap((s) => s.items)
          .find((i) => i.id === itemId),
        answer: r.answers[itemId],
        clientComments: (r.comments[itemId] || []).filter(
          (c) => c.visibility === 'CLIENT',
        ),
      })
    if (sub === 'answer' && method === 'PUT') {
      requireRule(
        !['APPROVED', 'SUBMITTED'].includes(item.state),
        409,
        'ITEM_LOCKED',
        'Withdraw this submission before editing.',
      )
      checkVersion(
        r.project.structureVersion,
        body.expectedStructureVersion,
        'STRUCTURE_CONFLICT',
      )
      checkVersion(r.answers[itemId].version, body.expectedVersion)
      const value = body.value as AnswerValue
      requireRule(
        value && typeof value === 'object',
        422,
        'VALIDATION',
        'An answer value is required.',
      )
      r.answers[itemId] = {
        itemId,
        value: clone(value),
        version: r.answers[itemId].version + 1,
        savedAt: now(),
      }
      item.state = 'DRAFT'
      item.version++
      touch(r, 'Draft saved', contact.name)
      return response({ answer: r.answers[itemId], itemVersion: item.version })
    }
    if (sub === 'submit') {
      checkVersion(
        r.project.structureVersion,
        body.expectedStructureVersion,
        'STRUCTURE_CONFLICT',
      )
      checkVersion(r.answers[itemId].version, body.expectedAnswerVersion)
      requireRule(
        !['APPROVED', 'SUBMITTED'].includes(item.state),
        409,
        'ITEM_LOCKED',
        'This item is already submitted.',
      )
      const errors = validateAnswer(
        item,
        r.answers[itemId].value,
        Object.values(r.assets),
      )
      requireRule(!errors.length, 422, 'VALIDATION', errors.join(' '))
      const revisionId = uid()
      const revision: SubmissionRevision = {
        revisionId,
        itemId,
        itemKey: item.key,
        revisionNo: (r.revisions[itemId]?.length || 0) + 1,
        submittedAt: now(),
        structureVersion: r.project.structureVersion,
        schemaSnapshot: clone(item),
        valueSnapshot: clone(r.answers[itemId].value) as AnswerValue,
        assets: clone(
          Object.values(r.assets).filter(
            (a) => a.itemId === itemId && a.state === 'READY',
          ),
        ),
        submittedByContactId: contact.id,
      }
      ;(r.revisions[itemId] ||= []).unshift(revision)
      item.currentRevisionId = revisionId
      item.state = 'SUBMITTED'
      item.version++
      touch(r, 'Item submitted', contact.name)
      return response({ submission: revision, item }, 201)
    }
    if (sub === 'withdraw') {
      checkVersion(item.version, body.expectedItemVersion)
      requireRule(
        item.state === 'SUBMITTED',
        409,
        'ITEM_LOCKED',
        'Only a pending submission can be withdrawn.',
      )
      item.state = 'DRAFT'
      item.version++
      touch(r, 'Submission withdrawn', contact.name)
      return response({ item })
    }
    if (sub === 'comments') {
      if (method === 'GET')
        return response({
          data: (r.comments[itemId] || [])
            .filter((c) => c.visibility === 'CLIENT')
            .map(({ id, body, authorDisplayName, createdAt, revisionId }) => ({
              id,
              body,
              authorDisplayName,
              createdAt,
              revisionId,
            })),
        })
      requireRule(
        typeof body.body === 'string' &&
          body.body.trim().length > 0 &&
          body.body.length <= 4000,
        422,
        'VALIDATION',
        'Write a comment up to 4,000 characters.',
      )
      const c = {
        id: uid(),
        body: body.body.trim(),
        authorDisplayName: contact.name,
        createdAt: now(),
        revisionId: item.currentRevisionId,
        visibility: 'CLIENT' as const,
      }
      ;(r.comments[itemId] ||= []).push(c)
      return response({ comment: c }, 201)
    }
    return null
  }
  return fileOperation(r, projectId, area, itemId, sub, method, body)
})
export function fileOperation(
  r: import('@/mocks/types/fixtures.types').ProjectRecord,
  projectId: string,
  area: string,
  itemId: string,
  sub: string,
  method: string,
  body: Record<string, unknown>,
) {
  if (area === 'uploads') {
    if (!itemId && method === 'POST') {
      const item = itemIn(r, String(body.itemId))
      requireRule(
        visibleItems(r.structure, r.answers).some((i) => i.id === item.id) &&
          !['APPROVED', 'SUBMITTED'].includes(item.state),
        409,
        'ITEM_LOCKED',
        'Files cannot be added to this item.',
      )
      const name = String(body.originalName)
      const extension = name.split('.').pop()?.toLowerCase()
      const image = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']
      requireRule(
        (item.type === 'IMAGE'
          ? image
          : [...image, 'pdf', 'docx', 'txt', 'svg']
        ).includes(extension || ''),
        422,
        'FILE_TYPE',
        'This file type is not allowed.',
      )
      const bytes = Number(body.bytes)
      requireRule(
        bytes > 0 && bytes <= (item.type === 'IMAGE' ? 50 : 100) * 1024 * 1024,
        413,
        'FILE_SIZE',
        'File exceeds the allowed size.',
      )
      const w = productDb.workspaces[r.project.workspaceId]
      requireRule(
        productDb.scenario !== 'quota' &&
          w.usage.storageUsedBytes +
            w.usage.storageReservedBytes +
            bytes * (body.keepOriginal ? 2 : 1) <=
            w.usage.storageLimitBytes,
        409,
        'STORAGE_LIMIT',
        'Storage is full. Your draft remains safe.',
      )
      const id = uid()
      const uploadId = uid()
      r.assets[id] = {
        id,
        itemId: item.id,
        originalName: name,
        contentType: String(body.contentType),
        state: 'RESERVED',
        sourceBytes: bytes,
        retainedBytes: bytes * (body.keepOriginal ? 2 : 1),
        keepOriginal: body.keepOriginal === true,
        availableVariants: [],
        rejectionCode: null,
        uploadId,
        expiresAt: Date.now() + 15 * 6e4,
        transferred: false,
        polls: 0,
      }
      w.usage.storageReservedBytes += r.assets[id].retainedBytes
      return response(
        {
          assetId: id,
          uploadId,
          putUrl: `${apiRoot}mock-transfer/${id}`,
          requiredHeaders: { 'Content-Type': String(body.contentType) },
          expiresAt: new Date(r.assets[id].expiresAt).toISOString(),
        },
        201,
      )
    }
    const asset = Object.values(r.assets).find((a) => a.uploadId === itemId)
    requireRule(asset, 404, 'NOT_FOUND', 'Upload unavailable.')
    if (method === 'DELETE') {
      if (asset.state === 'RESERVED' || asset.state === 'PROCESSING')
        productDb.workspaces[
          r.project.workspaceId
        ].usage.storageReservedBytes -= asset.retainedBytes
      asset.state = 'DELETED'
      asset.content = undefined
      return response({ cancelled: true })
    }
    if (sub === 'finalize') {
      requireRule(
        asset.transferred,
        409,
        'TRANSFER_INCOMPLETE',
        'Finish transferring before finalizing.',
      )
      asset.state = 'PROCESSING'
      return response({ state: 'PROCESSING' }, 202)
    }
  }
  if (area === 'assets' && itemId) {
    const asset = r.assets[itemId]
    requireRule(asset, 404, 'NOT_FOUND', 'File unavailable.')
    if (method === 'GET') {
      if (asset.state === 'PROCESSING' && ++asset.polls >= 2) {
        const rejected = /reject|virus|password/i.test(asset.originalName)
        const failed = /failed/i.test(asset.originalName)
        asset.state = rejected ? 'REJECTED' : failed ? 'FAILED' : 'READY'
        asset.rejectionCode = rejected
          ? 'UNSAFE_FILE'
          : failed
            ? 'PROCESSING_FAILED'
            : null
        const w = productDb.workspaces[r.project.workspaceId]
        w.usage.storageReservedBytes -= asset.retainedBytes
        if (asset.state === 'READY') {
          w.usage.storageUsedBytes += asset.retainedBytes
          asset.availableVariants = asset.keepOriginal
            ? ['ORIGINAL', 'WORKING']
            : ['WORKING']
        }
      }
      return response({ asset })
    }
    if (method === 'DELETE') {
      requireRule(
        !Object.values(r.revisions)
          .flat()
          .some((rev) => JSON.stringify(rev.valueSnapshot).includes(asset.id)),
        409,
        'ASSET_REFERENCED',
        'Submitted files are retained for historical revisions.',
      )
      const w = productDb.workspaces[r.project.workspaceId]
      if (asset.state === 'READY')
        w.usage.storageUsedBytes -= asset.retainedBytes
      else if (['PROCESSING', 'RESERVED'].includes(asset.state))
        w.usage.storageReservedBytes -= asset.retainedBytes
      asset.state = 'DELETED'
      asset.content = undefined
      return response({ deleted: true })
    }
    if (sub === 'download') {
      requireRule(
        asset.state === 'READY',
        409,
        'FILE_NOT_READY',
        'This file is not ready.',
      )
      asset.expiresAt = Date.now() + 6e4
      return response({
        url: `${apiRoot}mock-download/${projectId}/${itemId}?expires=${asset.expiresAt}`,
        expiresAt: new Date(asset.expiresAt).toISOString(),
      })
    }
  }
  return null
}
productHandlers.unshift(
  http.put(`${apiRoot}mock-transfer/:id`, async ({ request, params }) => {
    try {
      const session = productDb.client
      requireRule(
        session,
        401,
        'CLIENT_SESSION_EXPIRED',
        'Reopen client access.',
      )
      const { record: r } = clientProject(session.projectId, true)
      const a = r.assets[String(params.id)]
      requireRule(
        a && a.expiresAt > Date.now() && a.state === 'RESERVED',
        403,
        'URL_EXPIRED',
        'Upload URL expired. Reserve a new transfer.',
      )
      a.content = await request.blob()
      requireRule(
        a.content.size === a.sourceBytes,
        422,
        'SIZE_MISMATCH',
        'Transferred size does not match reservation.',
      )
      a.transferred = true
      return new HttpResponse(null, { status: 200 })
    } catch (e) {
      return failure(e)
    }
  }),
  http.get(`${apiRoot}mock-download/:pid/:id`, ({ params, request }) => {
    try {
      const { record: r } = clientProject(String(params.pid))
      const a = r.assets[String(params.id)]
      requireRule(
        a?.state === 'READY' &&
          Number(new URL(request.url).searchParams.get('expires')) > Date.now(),
        403,
        'URL_EXPIRED',
        'Request a fresh download link.',
      )
      return new HttpResponse(a.content, {
        headers: {
          'Content-Type': a.contentType || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${a.originalName.replace(/["\r\n]/g, '')}"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch (e) {
      return failure(e)
    }
  }),
)

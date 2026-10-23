import { http, HttpResponse } from 'msw'
import {
  agencyProject,
  apiRoot,
  registerProductResolver,
  requireRule,
  response,
  productHandlers,
  failure,
} from './productHandlers'
import { fileOperation } from './collection'
import { uid } from './productDb'
const grants = new Map<
  string,
  {
    request: Request
    expires: number
    assetId: string
    projectId: string
    workspaceId: string
  }
>()
registerProductResolver(async (request, path, search, body) => {
  if (path[0] === 'mock-agency-download') {
    const grant = grants.get(search.get('ticket') || '')
    requireRule(
      grant && grant.expires > Date.now(),
      403,
      'URL_EXPIRED',
      'Request a fresh download link.',
    )
    const { record } = agencyProject(
      grant.request,
      grant.workspaceId,
      grant.projectId,
      'read',
    )
    const asset = record.assets[grant.assetId]
    requireRule(
      asset?.state === 'READY' && asset.content,
      404,
      'NOT_FOUND',
      'File unavailable.',
    )
    return new HttpResponse(asset.content, {
      headers: {
        'Content-Type': asset.contentType || 'application/octet-stream',
        'Cache-Control': 'no-store',
      },
    })
  }
  if (
    path[0] !== 'workspaces' ||
    path[2] !== 'projects' ||
    !['assets', 'uploads'].includes(path[4])
  )
    return null
  const [, wid, , pid, , aid, action] = path
  const { record: r, workspace: w } = agencyProject(
    request,
    wid,
    pid,
    path[4] === 'uploads' || request.method === 'DELETE' ? 'owner' : 'read',
    path[4] === 'uploads' || request.method === 'DELETE',
  )
  if (path[4] === 'uploads') {
    requireRule(
      ['DRAFT', 'ACTIVE'].includes(r.project.state),
      409,
      'PROJECT_LOCKED',
      'Uploads are paused for this project.',
    )
    const result = fileOperation(
      r,
      pid,
      'uploads',
      aid,
      action,
      request.method,
      body,
    )
    if (result && !aid && request.method === 'POST') {
      const data = (await result.json()) as { assetId: string; putUrl: string }
      const ticket = uid()
      grants.set(ticket, {
        request: new Request(request.url, { headers: request.headers }),
        expires: Date.now() + 15 * 60000,
        assetId: data.assetId,
        projectId: pid,
        workspaceId: wid,
      })
      return response(
        { ...data, putUrl: `${apiRoot}mock-agency-transfer/${ticket}` },
        201,
      )
    }
    return result
  }
  if (aid && request.method === 'GET')
    return fileOperation(r, pid, 'assets', aid, action, 'GET', body)
  if (!aid && request.method === 'GET')
    return response({
      data: Object.values(r.assets)
        .filter((a) => a.state !== 'DELETED')
        .map(({ content, uploadId, expiresAt, transferred, polls, ...a }) => {
          void content
          void uploadId
          void expiresAt
          void transferred
          void polls
          let previewUrl: string | undefined
          if (a.state === 'READY' && a.contentType?.startsWith('image/')) {
            const ticket = uid()
            grants.set(ticket, {
              request: new Request(request.url, { headers: request.headers }),
              expires: Date.now() + 60000,
              assetId: a.id,
              projectId: pid,
              workspaceId: wid,
            })
            previewUrl = `${apiRoot}mock-agency-download?ticket=${ticket}`
          }
          return {
            ...a,
            previewUrl,
            itemLabel:
              r.structure.flatMap((s) => s.items).find((i) => i.id === a.itemId)
                ?.label || 'Content item',
          }
        }),
    })
  const a = r.assets[aid]
  requireRule(a && a.state !== 'DELETED', 404, 'NOT_FOUND', 'File unavailable.')
  if (action === 'download' && request.method === 'POST') {
    requireRule(
      a.state === 'READY',
      409,
      'FILE_NOT_READY',
      'This file is not ready.',
    )
    const ticket = uid(),
      expires = Date.now() + 60000
    grants.set(ticket, {
      request: new Request(request.url, { headers: request.headers }),
      expires,
      assetId: aid,
      projectId: pid,
      workspaceId: wid,
    })
    for (const [key, g] of grants)
      if (g.expires < Date.now()) grants.delete(key)
    return response({
      url: `${apiRoot}mock-agency-download?ticket=${ticket}`,
      expiresAt: new Date(expires).toISOString(),
    })
  }
  if (request.method === 'DELETE') {
    requireRule(
      !Object.values(r.revisions)
        .flat()
        .some(
          (rev) =>
            rev.assets.some((asset) => asset.id === aid) ||
            JSON.stringify(rev.valueSnapshot).includes(aid),
        ),
      409,
      'ASSET_REFERENCED',
      'Submitted files are retained for historical revisions.',
    )
    if (a.state === 'READY') w.usage.storageUsedBytes -= a.retainedBytes
    else if (['RESERVED', 'PROCESSING'].includes(a.state))
      w.usage.storageReservedBytes -= a.retainedBytes
    a.state = 'DELETED'
    a.content = undefined
    return response({ deleted: true })
  }
  return null
})

productHandlers.unshift(
  http.put(
    `${apiRoot}mock-agency-transfer/:ticket`,
    async ({ request, params }) => {
      try {
        const grant = grants.get(String(params.ticket))
        requireRule(
          grant && grant.expires > Date.now(),
          403,
          'URL_EXPIRED',
          'Upload reservation expired.',
        )
        const { record } = agencyProject(
          grant.request,
          grant.workspaceId,
          grant.projectId,
          'owner',
          true,
        )
        requireRule(
          ['DRAFT', 'ACTIVE'].includes(record.project.state),
          409,
          'PROJECT_LOCKED',
          'Project uploads are paused.',
        )
        const a = record.assets[grant.assetId]
        requireRule(
          a?.state === 'RESERVED',
          409,
          'UPLOAD_STATE',
          'Reserve a new upload.',
        )
        const content = await request.blob()
        requireRule(
          content.size === a.sourceBytes,
          422,
          'SIZE_MISMATCH',
          'Transferred size does not match reservation.',
        )
        a.content = content
        a.transferred = true
        return new HttpResponse(null, { status: 200 })
      } catch (e) {
        return failure(e)
      }
    },
  ),
)

import { http, HttpResponse } from 'msw'
import { strToU8, zipSync } from 'fflate'
import {
  agencyProject,
  apiRoot,
  checkVersion,
  failure,
  itemIn,
  productHandlers,
  registerProductResolver,
  requireRule,
  response,
} from './productHandlers'
import { clone, now, productDb, touch, uid } from './productDb'
import { progressFor, visibleItems } from '@/lib/domain'
import type { ExportCommand } from '@/api/contracts'

registerProductResolver((request, path, _search, body) => {
  const [, wid, resource, pid, area, id, action, revisionId] = path
  if (
    path[0] !== 'workspaces' ||
    resource !== 'projects' ||
    !pid ||
    !['review-queue', 'items', 'exports'].includes(area)
  )
    return null
  if (
    area === 'items' &&
    !['revisions', 'review-decisions', 'reopen', 'comments'].includes(action)
  )
    return null
  const ctx = agencyProject(
    request,
    wid,
    pid,
    area === 'exports'
      ? 'export'
      : area === 'review-queue'
        ? 'review'
        : request.method === 'GET'
          ? 'read'
          : 'review',
    request.method !== 'GET' && area !== 'exports',
  )
  const { record: r, project: p } = ctx
  const method = request.method
  if (area === 'review-queue')
    return response({
      data: visibleItems(r.structure, r.answers)
        .filter((i) => i.state === 'SUBMITTED')
        .map((i) => ({
          item: i,
          revision: r.revisions[i.id]?.find(
            (rev) => rev.revisionId === i.currentRevisionId,
          ),
        })),
    })
  if (area === 'items') {
    const item = itemIn(r, id)
    if (action === 'revisions') {
      if (revisionId) {
        const revision = r.revisions[id]?.find(
          (r) => r.revisionId === revisionId,
        )
        requireRule(revision, 404, 'NOT_FOUND', 'Revision unavailable.')
        return response({ revision })
      }
      return response({ data: r.revisions[id] || [] })
    }
    if (action === 'comments') {
      if (method === 'GET') return response({ data: r.comments[id] || [] })
      requireRule(
        ['CLIENT', 'INTERNAL'].includes(String(body.visibility)) &&
          typeof body.body === 'string' &&
          body.body.trim().length > 0 &&
          body.body.length <= 4000,
        422,
        'VALIDATION',
        'Choose comment visibility and write a comment.',
      )
      const c = {
        id: uid(),
        body: String(body.body).trim(),
        visibility: body.visibility as 'CLIENT' | 'INTERNAL',
        authorDisplayName: ctx.user.user.displayName,
        createdAt: now(),
        revisionId: item.currentRevisionId,
      }
      ;(r.comments[id] ||= []).push(c)
      touch(
        r,
        body.visibility === 'INTERNAL'
          ? 'Internal comment added'
          : 'Client comment added',
      )
      return response({ comment: c }, 201)
    }
    requireRule(
      !['ARCHIVED', 'COMPLETED'].includes(r.project.state),
      409,
      'PROJECT_READ_ONLY',
      'Reopen the project before reviewing.',
    )
    checkVersion(item.version, body.expectedItemVersion)
    if (action === 'review-decisions') {
      requireRule(
        item.state === 'SUBMITTED' &&
          item.currentRevisionId === body.revisionId,
        409,
        'STALE_REVISION',
        'The submitted revision changed. Reload the queue before deciding.',
      )
      requireRule(
        ['APPROVE', 'REQUEST_CHANGES'].includes(String(body.decision)),
        422,
        'VALIDATION',
        'Choose a review decision.',
      )
      requireRule(
        body.decision !== 'REQUEST_CHANGES' ||
          (typeof body.reason === 'string' && body.reason.trim()),
        422,
        'REASON_REQUIRED',
        'Explain the requested changes.',
      )
      item.state =
        body.decision === 'APPROVE' ? 'APPROVED' : 'CHANGES_REQUESTED'
      if (body.decision === 'REQUEST_CHANGES')
        (r.comments[id] ||= []).push({
          id: uid(),
          body: String(body.reason),
          visibility: 'CLIENT',
          authorDisplayName: ctx.user.user.displayName,
          createdAt: now(),
          revisionId: item.currentRevisionId,
        })
      item.version++
      touch(
        r,
        body.decision === 'APPROVE'
          ? 'Exact revision approved'
          : 'Changes requested',
        ctx.user.user.displayName,
      )
      return response({
        item,
        decision: {
          id: uid(),
          revisionId: body.revisionId,
          decision: body.decision,
          reason: body.reason || null,
          reviewedAt: now(),
          reviewerDisplayName: ctx.user.user.displayName,
        },
      })
    }
    if (action === 'reopen') {
      requireRule(
        item.state === 'APPROVED' && body.reason,
        422,
        'REASON_REQUIRED',
        'A reason is required to reopen approved content.',
      )
      item.state = 'CHANGES_REQUESTED'
      item.version++
      touch(r, 'Approved item reopened')
      return response({ item })
    }
  }
  if (area === 'exports') {
    if (!id && method === 'GET')
      return response({
        data: Object.values(r.exports).map(
          ({
            id,
            state,
            format,
            projectVersion,
            partial,
            createdAt,
            expiresAt,
          }) => ({
            id,
            state,
            format,
            projectVersion,
            partial,
            createdAt,
            expiresAt,
            olderThanCurrentProject: projectVersion !== r.project.version,
          }),
        ),
      })
    if (!id && method === 'POST') {
      checkVersion(r.project.version, body.expectedProjectVersion)
      requireRule(
        ['APPROVED_ZIP', 'APPROVED_JSON', 'APPROVED_MARKDOWN'].includes(
          String(body.format),
        ),
        422,
        'VALIDATION',
        'Choose an export format.',
      )
      const visible = visibleItems(r.structure, r.answers)
      const approved = visible.filter((i) => i.state === 'APPROVED')
      requireRule(
        approved.length,
        409,
        'NO_APPROVED_CONTENT',
        'Approve at least one visible item first.',
      )
      const progress = progressFor(r.structure, r.answers)
      const partial = progress.approvedRequired < progress.requiredTotal
      requireRule(
        !partial || body.acknowledgePartial === true,
        422,
        'PARTIAL_ACK_REQUIRED',
        'Acknowledge that required approvals are incomplete.',
      )
      const snapshot = approved.map((i) => {
        const revision = r.revisions[i.id].find(
          (rev) => rev.revisionId === i.currentRevisionId,
        )!
        return {
          itemId: i.id,
          itemKey: i.key,
          label: i.label,
          revisionId: revision.revisionId,
          revisionNo: revision.revisionNo,
          value: clone(revision.valueSnapshot),
          assets: revision.assets
            .filter((a) => a.state === 'READY')
            .map((a) => ({
              id: a.id,
              name: a.originalName,
              includeOriginal: body.includeOriginals === true && a.keepOriginal,
            })),
        }
      })
      const manifest = {
        schemaVersion: 1,
        projectId: p.id,
        title: p.title,
        projectVersion: p.version,
        structureVersion: p.structureVersion,
        partial,
        createdAt: now(),
        items: snapshot,
      }
      const exportId = uid()
      const job = {
        id: exportId,
        state: 'QUEUED' as const,
        format: body.format as ExportCommand['format'],
        projectVersion: p.version,
        partial,
        createdAt: now(),
        expiresAt: new Date(Date.now() + 864e5).toISOString(),
        olderThanCurrentProject: false,
        polls: 0,
        content: JSON.stringify(manifest, null, 2),
        manifest,
        fail: productDb.scenario === 'export-failure',
      }
      r.exports[exportId] = job
      return response({ export: job }, 202)
    }
    const job = r.exports[id]
    requireRule(job, 404, 'NOT_FOUND', 'Export unavailable.')
    if (!action && method === 'GET') {
      if (Date.parse(job.expiresAt) < Date.now()) job.state = 'EXPIRED'
      else if (['QUEUED', 'RUNNING'].includes(job.state))
        job.state =
          ++job.polls >= 2 ? (job.fail ? 'FAILED' : 'READY') : 'RUNNING'
      job.olderThanCurrentProject = job.projectVersion !== r.project.version
      return response({
        export: {
          id: job.id,
          state: job.state,
          format: job.format,
          projectVersion: job.projectVersion,
          partial: job.partial,
          createdAt: job.createdAt,
          expiresAt: job.expiresAt,
          olderThanCurrentProject: job.olderThanCurrentProject,
        },
      })
    }
    if (action === 'download') {
      requireRule(
        job.state === 'READY' && Date.parse(job.expiresAt) > Date.now(),
        409,
        'EXPORT_NOT_READY',
        'Create a new export if this one expired.',
      )
      const expires = Date.now() + 6e4
      return response({
        url: `${apiRoot}mock-export/${wid}/${pid}/${id}?expires=${expires}`,
        expiresAt: new Date(expires).toISOString(),
      })
    }
  }
  return null
})
productHandlers.unshift(
  http.get(`${apiRoot}mock-export/:wid/:pid/:id`, async ({ params, request }) => {
    try {
      const r = productDb.projects[String(params.pid)]
      const job = r?.exports[String(params.id)]
      requireRule(
        job &&
          r.project.workspaceId === params.wid &&
          job.state === 'READY' &&
          Date.parse(job.expiresAt) > Date.now() &&
          Number(new URL(request.url).searchParams.get('expires')) > Date.now(),
        403,
        'URL_EXPIRED',
        'Request a fresh export download link.',
      )
      const manifest = JSON.parse(job.content) as {
        title: string
        partial: boolean
        items: {
          label: string
          revisionId: string
          value: unknown
          assets: { id: string; name: string }[]
        }[]
      }
      const markdown =
        `# ${manifest.title}\n\n${manifest.partial ? 'PARTIAL APPROVED EXPORT' : 'APPROVED EXPORT'}\n\n` +
        manifest.items
          .map(
            (i) =>
              `## ${i.label}\n\nRevision: ${i.revisionId}\n\n\`\`\`json\n${JSON.stringify(i.value, null, 2)}\n\`\`\`\n`,
          )
          .join('\n')
      let bytes: Uint8Array
      let extension: string
      if (job.format === 'APPROVED_ZIP') {
        const files: Record<string, Uint8Array> = {
          'manifest.json': strToU8(job.content),
          'content.md': strToU8(markdown),
        }
        for (const item of manifest.items)
          for (const a of item.assets) {
            const asset = r.assets[a.id]
            if (asset?.content)
              files[
                `assets/${a.id}-${a.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
              ] = new Uint8Array(await asset.content.arrayBuffer())
          }
        bytes = zipSync(files)
        extension = 'zip'
      } else {
        extension = job.format === 'APPROVED_JSON' ? 'json' : 'md'
        bytes = strToU8(extension === 'json' ? job.content : markdown)
      }
      return new HttpResponse(bytes.buffer as ArrayBuffer, {
        headers: {
          'Content-Type':
            extension === 'zip'
              ? 'application/zip'
              : extension === 'json'
                ? 'application/json'
                : 'text/markdown',
          'Content-Disposition': `attachment; filename="approved-${job.id}.${extension}"`,
          'Cache-Control': 'no-store',
        },
      })
    } catch (e) {
      return failure(e)
    }
  }),
)

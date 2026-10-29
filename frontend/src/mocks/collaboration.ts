import type { ReminderPreview } from '@/features/reminders/types/reminder.types'
import type { ItemDefinition } from '@/features/structure-editor/types/structure.types'
import type { TemplateDefinition } from '@/features/templates/types/template.types'
import { mockState } from '@/mocks/handlers'
import { clone, now, productDb, touch, uid } from '@/mocks/productDb'
import {
  agencyActor,
  agencyProject,
  checkVersion,
  itemIn,
  registerProductResolver,
  requireRule,
  response,
} from '@/mocks/productHandlers'
import { initialValue, progressFor, visibleItems } from '@/shared/utils/domain'

function schemaValid(definition: ItemDefinition) {
  requireRule(
    definition?.key &&
      definition.label &&
      [
        'SHORT_TEXT',
        'LONG_TEXT',
        'URL',
        'SINGLE_SELECT',
        'MULTI_SELECT',
        'IMAGE',
        'FILE',
        'REPEATER',
      ].includes(definition.type),
    422,
    'VALIDATION',
    'Provide a key, label and supported field type.',
  )
  if (['SINGLE_SELECT', 'MULTI_SELECT'].includes(definition.type))
    requireRule(
      definition.validation.options?.length &&
        new Set(definition.validation.options.map((o) => o.key)).size ===
          definition.validation.options.length,
      422,
      'VALIDATION',
      'Select fields need unique options.',
    )
  if (definition.type === 'REPEATER')
    requireRule(
      definition.validation.columns?.length &&
        definition.validation.columns.length <= 8 &&
        (definition.validation.maxRows || 20) <= 20,
      422,
      'VALIDATION',
      'Repeaters need 1–8 columns and at most 20 rows.',
    )
}
registerProductResolver((request, path, _search, body) => {
  if (path[0] !== 'workspaces') return null
  const [, wid, resource, rid, action, aid, subaction] = path
  const method = request.method
  if (resource === 'ownership-transfer' && method === 'POST') {
    const actor = agencyActor(request, wid, true, true)
    requireRule(
      actor.user.password === body.currentPassword,
      403,
      'REAUTH_REQUIRED',
      'Confirm your current password.',
    )
    const target = actor.workspace.members.find(
      (m) =>
        m.id === body.targetMemberId &&
        m.state === 'ACTIVE' &&
        m.role === 'MEMBER',
    )
    requireRule(target, 422, 'INVALID_MEMBER', 'Choose an active team member.')
    const current = actor.workspace.members.find(
      (m) => m.id === actor.membership.memberId,
    )!
    current.role = 'MEMBER'
    target.role = 'OWNER'
    for (const account of Object.values(mockState.accounts))
      account.memberships = account.memberships.map((m) =>
        m.workspaceId !== wid
          ? m
          : m.memberId === current.id
            ? { ...m, role: 'MEMBER' }
            : m.memberId === target.id
              ? { ...m, role: 'OWNER' }
              : m,
      )
    actor.workspace.workspace.version++
    return response({ workspace: actor.workspace.workspace })
  }
  if (resource === 'members') {
    const actor = agencyActor(request, wid, true, method !== 'GET')
    const w = actor.workspace
    if (method === 'GET')
      return response({ data: w.members, invitations: w.pendingInvites })
    if (
      action === 'invite' ||
      (!rid && method === 'POST') ||
      rid === 'invite'
    ) {
      requireRule(
        w.members.filter((m) => m.state === 'ACTIVE').length +
          w.pendingInvites.filter((i) => i.state === 'PENDING').length <
          w.entitlements.seats,
        409,
        'SEAT_LIMIT',
        'No seats available. Revoke an invitation or change plan.',
      )
      requireRule(
        typeof body.email === 'string' && body.email.includes('@'),
        422,
        'VALIDATION',
        'Enter a valid email.',
      )
      requireRule(
        !w.members.some(
          (m) =>
            m.state === 'ACTIVE' &&
            m.user.email.toLowerCase() === String(body.email).toLowerCase(),
        ) &&
          !w.pendingInvites.some(
            (i) =>
              i.state === 'PENDING' &&
              i.email.toLowerCase() === String(body.email).toLowerCase(),
          ),
        409,
        'ALREADY_INVITED',
        'This email already has access or a pending invitation.',
      )
      const assignments = (
        Array.isArray(body.assignments) ? body.assignments : []
      ) as { projectId: string; canReview: boolean; canExport: boolean }[]
      for (const a of assignments)
        agencyProject(request, wid, a.projectId, 'owner', true)
      const invitation = {
        assignments: assignments.map((a) => ({
          projectId: a.projectId,
          canReview: a.canReview === true,
          canExport: a.canExport === true,
        })),
        id: uid(),
        email: String(body.email),
        state: 'PENDING' as const,
        expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
      }
      w.pendingInvites.push(invitation)
      w.usage.seatsReserved++
      return response(
        { invitation, demoUrl: `/team-invite#token=${invitation.id}` },
        201,
      )
    }
    if (method === 'DELETE') {
      const member = w.members.find((m) => m.id === rid)
      if (member) {
        requireRule(
          member.role !== 'OWNER',
          409,
          'OWNER_REQUIRED',
          'Transfer ownership before removing the owner.',
        )
        member.state = 'DISABLED'
        for (const p of Object.values(productDb.projects).filter(
          (p) => p.project.workspaceId === wid,
        ))
          p.assignments = p.assignments.filter((a) => a.memberId !== rid)
        w.usage.seatsUsed--
      } else {
        const invite = w.pendingInvites.find((i) => i.id === rid)
        requireRule(invite, 404, 'NOT_FOUND', 'Invitation unavailable.')
        invite.state = 'REVOKED'
        w.usage.seatsReserved--
      }
      return response({ revoked: true })
    }
  }
  if (resource === 'templates' && rid) {
    const w = agencyActor(request, wid, true, method !== 'GET').workspace
    const t = w.templates.find((t) => t.id === rid)
    requireRule(
      t,
      404,
      'NOT_FOUND',
      'Only your workspace templates can be edited.',
    )
    if (action === 'draft' && method === 'PUT') {
      const d = body.definition as unknown as TemplateDefinition
      requireRule(
        d?.sections?.length,
        422,
        'VALIDATION',
        'Add at least one section.',
      )
      t.draft = clone(d)
      return response({ definition: t.draft })
    }
    if (action === 'versions' && method === 'POST') {
      requireRule(t.draft, 409, 'NO_DRAFT', 'Save a draft first.')
      ;(t.publishedVersions ||= {})[t.versionId] = clone(t.definition)
      t.definition = clone(t.draft)
      t.title = t.definition.title
      t.version++
      t.versionId = uid()
      return response({ template: t })
    }
  }
  if (
    resource !== 'projects' ||
    !rid ||
    !action ||
    ![
      'publish',
      'pause',
      'resume',
      'complete',
      'reopen',
      'archive',
      'restore',
      'delete-request',
      'client-preview',
      'progress',
      'activity',
      'sections',
      'items',
      'structure',
      'contacts',
      'assignments',
      'reminder-policy',
      'reminders',
    ].includes(action)
  )
    return null
  if (action === 'items' && subaction !== 'schema') return null
  const mutation = method !== 'GET'
  const ctx = agencyProject(
    request,
    wid,
    rid,
    ['review-queue', 'activity', 'client-preview', 'progress'].includes(action)
      ? 'read'
      : 'owner',
    mutation,
  )
  const { record: r, project: p } = ctx
  const inactive = ['ARCHIVED', 'DELETION_PENDING', 'COMPLETED'].includes(
    r.project.state,
  )
  if (
    [
      'publish',
      'pause',
      'resume',
      'complete',
      'reopen',
      'archive',
      'restore',
      'delete-request',
    ].includes(action) &&
    method === 'POST'
  ) {
    checkVersion(r.project.version, body.expectedVersion)
    const states: Record<string, string[]> = {
      publish: ['DRAFT'],
      pause: ['ACTIVE'],
      resume: ['PAUSED'],
      complete: ['ACTIVE', 'PAUSED'],
      reopen: ['COMPLETED'],
      archive: ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED'],
      restore: ['ARCHIVED'],
      'delete-request': ['ARCHIVED'],
    }
    requireRule(
      states[action].includes(r.project.state),
      409,
      'INVALID_STATE',
      'This action is not available in the current project state.',
    )
    if (action === 'publish')
      requireRule(
        visibleItems(r.structure, r.answers).some((i) => i.required),
        422,
        'EMPTY_CHECKLIST',
        'Add a visible required item before publishing.',
      )
    if (action === 'complete') {
      const count = progressFor(r.structure, r.answers)
      requireRule(
        count.requiredTotal > 0 &&
          count.approvedRequired === count.requiredTotal,
        409,
        'UNAPPROVED_ITEMS',
        'Approve every visible required item before completing.',
      )
    }
    if (['reopen', 'delete-request'].includes(action))
      requireRule(body.reason, 422, 'REASON_REQUIRED', 'Explain this change.')
    const next = {
      publish: 'ACTIVE',
      pause: 'PAUSED',
      resume: 'ACTIVE',
      complete: 'COMPLETED',
      reopen: 'ACTIVE',
      archive: 'ARCHIVED',
      restore: 'PAUSED',
      'delete-request': 'DELETION_PENDING',
    } as const
    r.project.state = next[action as keyof typeof next]
    touch(r, `Project ${action}`)
    return response({ project: r.project })
  }
  if (action === 'client-preview' && method === 'GET')
    return response({
      project: {
        id: p.id,
        title: p.title,
        projectType: p.projectType,
        state: p.state,
        dueDate: p.dueDate,
        structureVersion: p.structureVersion,
        agencyDisplayName: ctx.workspace.workspace.name,
        aiEnabled: p.aiEnabled,
      },
      sections: r.structure
        .filter((s) => s.enabled)
        .map((s) => ({
          id: s.id,
          key: s.key,
          title: s.title,
          items: visibleItems([s], r.answers).map((i) => ({
            id: i.id,
            label: i.label,
            type: i.type,
            required: i.required,
            instructions: i.instructions,
            example: i.example,
            state: i.state,
            validation: i.validation,
            canEdit: false,
          })),
        })),
      progress: p.progress,
      readOnly: true,
    })
  if (action === 'progress' && method === 'GET')
    return response({ progress: p.progress })
  if (action === 'activity' && method === 'GET')
    return response({ data: r.activity })
  if (action === 'sections' || action === 'items' || action === 'structure') {
    requireRule(
      !inactive,
      409,
      'READ_ONLY',
      'Reopen or restore this project before changing its structure.',
    )
    checkVersion(
      r.project.structureVersion,
      body.expectedStructureVersion,
      'STRUCTURE_CONFLICT',
    )
    if (action === 'sections' && !aid && method === 'POST') {
      requireRule(body.title, 422, 'VALIDATION', 'Enter a section title.')
      r.structure.push({
        id: uid(),
        key: `section_${uid().slice(0, 8)}`,
        title: String(body.title),
        enabled: true,
        sortOrder: r.structure.length,
        items: [],
      })
    } else if (
      action === 'sections' &&
      aid &&
      !subaction &&
      method === 'PATCH'
    ) {
      const s = r.structure.find((s) => s.id === aid)
      requireRule(s, 404, 'NOT_FOUND', 'Section not found.')
      if (typeof body.title === 'string') s.title = body.title
      if (typeof body.enabled === 'boolean') s.enabled = body.enabled
    } else if (
      action === 'sections' &&
      aid &&
      subaction === 'items' &&
      method === 'POST'
    ) {
      const s = r.structure.find((s) => s.id === aid)
      requireRule(s, 404, 'NOT_FOUND', 'Section not found.')
      const d = body.definition as unknown as ItemDefinition
      schemaValid(d)
      requireRule(
        !s.items.some((i) => i.key === d.key),
        422,
        'DUPLICATE_KEY',
        'Use a unique item key.',
      )
      if (d.visibleWhen) {
        const dep = s.items.find(
          (i) => i.key === d.visibleWhen?.dependsOnItemKey,
        )
        requireRule(
          dep?.type === 'SINGLE_SELECT' &&
            dep.validation.options?.some(
              (o) => o.key === d.visibleWhen?.optionKey,
            ),
          422,
          'INVALID_VISIBILITY',
          'Visibility must reference an earlier single select option in this section.',
        )
      }
      const i = {
        ...clone(d),
        id: uid(),
        sectionId: s.id,
        sortOrder: s.items.length,
        state: 'NOT_STARTED' as const,
        version: 1,
        currentRevisionId: null,
        visible: true,
      }
      s.items.push(i)
      r.answers[i.id] = {
        itemId: i.id,
        value: initialValue(i.type),
        version: 1,
        savedAt: now(),
      }
    } else if (
      action === 'items' &&
      aid &&
      subaction === 'schema' &&
      method === 'PATCH'
    ) {
      const i = itemIn(r, aid)
      const d = body.definition as unknown as ItemDefinition
      schemaValid(d)
      requireRule(
        !['SUBMITTED', 'APPROVED'].includes(i.state) ||
          body.reopenAffected === true,
        409,
        'REOPEN_REQUIRED',
        'Explicitly reopen this item before changing its schema.',
      )
      if (d.visibleWhen) {
        const s = r.structure.find((s) => s.id === i.sectionId)!
        const dep = s.items.findIndex(
          (t) => t.key === d.visibleWhen?.dependsOnItemKey,
        )
        requireRule(
          dep >= 0 &&
            dep < s.items.indexOf(i) &&
            s.items[dep].type === 'SINGLE_SELECT' &&
            s.items[dep].validation.options?.some(
              (o) => o.key === d.visibleWhen?.optionKey,
            ),
          422,
          'INVALID_VISIBILITY',
          'Choose an earlier single select in this section.',
        )
      }
      if (i.type !== d.type)
        r.answers[i.id] = {
          itemId: i.id,
          value: initialValue(d.type),
          version: r.answers[i.id].version + 1,
          savedAt: now(),
        }
      Object.assign(i, clone(d))
      i.version++
      if (['SUBMITTED', 'APPROVED'].includes(i.state))
        i.state = 'CHANGES_REQUESTED'
    } else if (action === 'structure' && aid === 'reorder') {
      const ids = body.sectionIds as string[]
      requireRule(
        ids?.length === r.structure.length &&
          new Set(ids).size === ids.length &&
          ids.every((id) => r.structure.some((s) => s.id === id)),
        422,
        'INVALID_ORDER',
        'Include each section exactly once.',
      )
      const orders = body.itemOrderBySection as Record<string, string[]>
      const reordered = ids.map((id, index) => {
        const s = clone(r.structure.find((s) => s.id === id)!)
        const order = orders[s.id]
        requireRule(
          order?.length === s.items.length &&
            new Set(order).size === order.length &&
            order.every((i) => s.items.some((t) => t.id === i)),
          422,
          'INVALID_ORDER',
          'Include each item exactly once.',
        )
        s.items = order.map((id, index) => ({
          ...s.items.find((i) => i.id === id)!,
          sortOrder: index,
        }))
        return { ...s, sortOrder: index }
      })
      for (const s of reordered)
        for (const i of s.items)
          if (i.visibleWhen)
            requireRule(
              s.items.findIndex(
                (t) => t.key === i.visibleWhen?.dependsOnItemKey,
              ) < s.items.indexOf(i),
              422,
              'INVALID_ORDER',
              'Keep a visibility controller before dependent items.',
            )
      r.structure = reordered
    } else return null
    r.project.structureVersion++
    touch(r, 'Project structure updated')
    return response({ structure: r.structure, project: r.project })
  }
  if (action === 'contacts') {
    if (method === 'GET')
      return response({
        data: r.contacts,
        invitations: Object.fromEntries(
          Object.entries(r.invitations).map(([id, i]) => [
            id,
            {
              id: i.id,
              email: i.email,
              state: i.state,
              expiresAt: i.expiresAt,
            },
          ]),
        ),
      })
    requireRule(
      !inactive,
      409,
      'READ_ONLY',
      'Restore this project before changing access.',
    )
    if (!aid && method === 'POST') {
      requireRule(
        body.name &&
          String(body.email).includes('@') &&
          new Date(String(body.accessExpiresAt)).getTime() > Date.now(),
        422,
        'VALIDATION',
        'Name, email and future access expiry are required.',
      )
      const c = {
        id: uid(),
        name: String(body.name),
        email: String(body.email),
        state: 'ACTIVE' as const,
        timezone: null,
        accessExpiresAt: String(body.accessExpiresAt),
        emailRemindersEnabled: true,
      }
      r.contacts.push(c)
      touch(r, 'Client contact added')
      return response({ contact: c }, 201)
    }
    const c = r.contacts.find((c) => c.id === aid)
    requireRule(c, 404, 'NOT_FOUND', 'Contact unavailable.')
    if (subaction === 'invite' && method === 'POST') {
      requireRule(
        c.state === 'ACTIVE',
        409,
        'REVOKED',
        'This contact was revoked.',
      )
      const invitation = {
        id: uid(),
        email: c.email,
        expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
        state: 'PENDING' as const,
        token: uid(),
      }
      r.invitations[c.id] = invitation
      touch(r, 'Client invitation issued')
      return response(
        {
          invitation: {
            id: invitation.id,
            email: c.email,
            expiresAt: invitation.expiresAt,
            state: invitation.state,
          },
          demoUrl: `/client/access#token=${invitation.token}`,
        },
        201,
      )
    }
    if (subaction === 'access' && method === 'DELETE') {
      c.state = 'REVOKED'
      if (r.invitations[c.id]) r.invitations[c.id].state = 'REVOKED'
      touch(r, 'Client access revoked')
      return response({ revoked: true })
    }
  }
  if (action === 'assignments') {
    if (method === 'GET') return response({ data: r.assignments })
    const member = ctx.workspace.members.find(
      (m) => m.id === aid && m.state === 'ACTIVE',
    )
    requireRule(
      member && member.role !== 'OWNER',
      422,
      'INVALID_MEMBER',
      'Choose an active team member.',
    )
    r.assignments = r.assignments.filter((a) => a.memberId !== aid)
    if (method === 'PUT')
      r.assignments.push({
        memberId: aid,
        canReview: body.canReview === true,
        canExport: body.canExport === true,
      })
    touch(r, 'Project assignment updated')
    return response({ data: r.assignments })
  }
  if (action === 'reminder-policy') {
    if (method === 'GET') return response(r.policy)
    checkVersion(r.policy.version, body.expectedVersion)
    requireRule(
      Array.isArray(body.rules) && body.rules.length <= 5 && body.timezone,
      422,
      'VALIDATION',
      'Use at most five rules and a timezone.',
    )
    r.policy = {
      ...r.policy,
      ...body,
      version: r.policy.version + 1,
    } as typeof r.policy
    touch(r, 'Reminder policy updated')
    return response(r.policy)
  }
  if (action === 'reminders') {
    const eligible =
      r.project.state === 'ACTIVE' &&
      !r.policy.paused &&
      r.policy.enabled &&
      p.progress.clientActionRequired > 0 &&
      r.contacts.some(
        (c) =>
          c.id === body.contactId &&
          c.state === 'ACTIVE' &&
          Date.parse(c.accessExpiresAt) > Date.now(),
      ) &&
      (body.channel === 'SMS'
        ? productDb.preferences[String(body.contactId)]?.smsStatus ===
          'VERIFIED_OPTED_IN'
        : r.contacts.some(
            (c) => c.id === body.contactId && c.emailRemindersEnabled,
          )) &&
      !(r.deliveries || []).some(
        (d) =>
          d.channel === body.channel &&
          Date.parse(d.dueAt) > Date.now() - 864e5 &&
          d.state !== 'SUPPRESSED',
      )
    const preview: ReminderPreview = {
      channel: body.channel === 'SMS' ? 'SMS' : 'EMAIL',
      subject: 'A few project details are waiting',
      body: `${p.progress.clientActionRequired} required items still need your attention for ${p.title}.`,
      eligible,
      reasons: eligible
        ? []
        : ['No eligible client action, active grant, or verified SMS consent.'],
      estimatedSegments: body.channel === 'SMS' ? 1 : null,
    }
    if (aid === 'preview') return response(preview)
    if (aid === 'send') {
      requireRule(eligible, 409, 'SUPPRESSED', 'This reminder is not eligible.')
      const delivery = {
        id: uid(),
        channel: body.channel === 'SMS' ? ('SMS' as const) : ('EMAIL' as const),
        dueAt: now(),
        state: 'QUEUED' as const,
        failureCode: null,
      }
      ;(r.deliveries ||= []).unshift(delivery)
      return response(
        {
          delivery,
        },
        202,
      )
    }
    if (aid === 'deliveries') return response({ data: r.deliveries || [] })
  }
  return null
})

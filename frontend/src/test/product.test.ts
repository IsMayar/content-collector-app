import { describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { mockState } from '@/mocks/handlers'
import { demoProjectId, productDb, templates } from '@/mocks/productDb'
import { agencyId, soloId } from '@/mocks/fixtures'
import {
  initialValue,
  progressFor,
  validateAnswer,
  visibleItems,
} from '@/lib/domain'
import type {
  Answer,
  ClientChecklist,
  Item,
  Project,
  SubmissionRevision,
} from '@/api/contracts'
const root = 'http://localhost:5173/api/v1/'
function login(email = 'owner@studio.example') {
  mockState.activeEmail = email
  mockState.token = 'synthetic-product-test'
}
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  agency = true,
) {
  return fetch(root + path, {
    method,
    headers: {
      ...(agency ? { Authorization: `Bearer ${mockState.token}` } : {}),
      'X-XSRF-TOKEN': mockState.csrf,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}
async function json<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  agency = true,
): Promise<T> {
  const response = await request(path, method, body, agency)
  expect(response.status, await response.clone().text()).toBeLessThan(300)
  return response.json()
}
const projectRoot = `workspaces/${agencyId}/projects/${demoProjectId}`
const portal = `client/projects/${demoProjectId}`
async function enterClient() {
  return json('client-access/exchange', 'POST', { token: 'client-demo' }, false)
}
describe('tenant-scoped project foundations', () => {
  it('initializes a new workspace without inheriting another tenant’s usage or logo', async () => {
    login('unverified@studio.example')
    mockState.accounts['unverified@studio.example'].user.verified = true
    const existing = productDb.workspaces[agencyId]
    existing.logo = 'private-other-logo'
    existing.usage.storageUsedBytes = 12345
    const result = await json<{ workspace: { id: string; timezone: string } }>(
      'workspaces',
      'POST',
      { name: 'A fresh studio', planKey: 'AGENCY', timezone: 'UTC' },
    )
    expect(result.workspace.timezone).toBe('UTC')
    const created = productDb.workspaces[result.workspace.id]
    expect(created.logo).toBe('')
    expect(created.usage.storageUsedBytes).toBe(0)
    expect(created.usage.seatsUsed).toBe(1)
    expect(created.clients).toHaveLength(0)
  })
  it('lists independent type-specific snapshots for every project type', async () => {
    login()
    const workspace = productDb.workspaces[agencyId]
    for (const type of ['WEBSITE', 'WEB_APP', 'MOBILE_APP']) {
      const template = templates.find((t) => t.projectType === type)!
      const { project } = await json<{ project: Project }>(
        `workspaces/${agencyId}/projects`,
        'POST',
        {
          clientId: workspace.clients[0].id,
          title: `Test ${type}`,
          projectType: type,
          dueDate: '2026-12-12',
          timezone: 'UTC',
          templateVersionId: template.versionId,
        },
      )
      const record = productDb.projects[project.id]
      expect(record.structure[0].items[0].id).not.toBe(
        template.definition.sections[0].items[0].key,
      )
      record.structure[0].title = 'Independent'
      expect(template.definition.sections[0].title).not.toBe('Independent')
      expect(project.state).toBe('DRAFT')
    }
  })
  it('limits a member to assignments and independent review/export permissions', async () => {
    login('member@studio.example')
    const list = await json<{ data: Project[] }>(
      `workspaces/${agencyId}/projects`,
    )
    expect(list.data.map((p) => p.id)).toEqual([demoProjectId])
    const detail = await json<{ project: Project }>(projectRoot)
    expect(detail.project.permissions).toMatchObject({
      canEditStructure: false,
      canReview: true,
      canExport: false,
      canManageAccess: false,
    })
    expect((await request(`${projectRoot}/exports`)).status).toBe(403)
    expect((await request(`workspaces/${soloId}/projects`)).status).toBe(404)
    expect((await request(`${projectRoot}/contacts`)).status).toBe(403)
  })
  it('rejects foreign project URLs even for an owner of another workspace', async () => {
    login('solo@studio.example')
    expect((await request(projectRoot)).status).toBe(404)
  })
  it('checks structure versions and keeps prior data on conflict', async () => {
    login()
    const record = productDb.projects[demoProjectId]
    const response = await request(`${projectRoot}/sections`, 'POST', {
      title: 'Unsafe overwrite',
      expectedStructureVersion: 0,
    })
    expect(response.status).toBe(409)
    expect(record.structure.some((s) => s.title === 'Unsafe overwrite')).toBe(
      false,
    )
  })
  it('suppresses reminders when remaining items only need agency review', async () => {
    login()
    const r = productDb.projects[demoProjectId]
    for (const i of r.structure.flatMap((s) => s.items)) i.state = 'SUBMITTED'
    const preview = await json<{ eligible: boolean }>(
      `${projectRoot}/reminders/preview`,
      'POST',
      { contactId: r.contacts[0].id, channel: 'EMAIL' },
    )
    expect(preview.eligible).toBe(false)
  })
})
describe('client session, draft and submission boundaries', () => {
  it('does not consume a token on passive GET, requires explicit exchange and rejects reuse', async () => {
    expect(
      (
        await request(
          'client-access/exchange?token=client-demo',
          'GET',
          undefined,
          false,
        )
      ).status,
    ).toBe(501)
    expect(productDb.client).toBeNull()
    await enterClient()
    expect(
      (
        await request(
          'client-access/exchange',
          'POST',
          { token: 'client-demo' },
          false,
        )
      ).status,
    ).toBe(410)
  })
  it('keeps agency authorization out of client requests and rejects wrong-project access', async () => {
    login()
    expect((await request(`${portal}/checklist`)).status).toBe(401)
    await enterClient()
    expect(
      (
        await request(
          'client/projects/foreign/checklist',
          'GET',
          undefined,
          false,
        )
      ).status,
    ).toBe(401)
  })
  it('retains local draft on conflict; snapshots submitted values; strips internal comments', async () => {
    login()
    await enterClient()
    const r = productDb.projects[demoProjectId]
    const item = r.structure
      .flatMap((s) => s.items)
      .find((i) => i.type === 'SHORT_TEXT')!
    r.comments[item.id] = [
      {
        id: 'internal',
        body: 'secret internal note',
        visibility: 'INTERNAL',
        authorDisplayName: 'Alex',
        createdAt: new Date().toISOString(),
        revisionId: null,
      },
    ]
    const { answer } = await json<{ answer: Answer }>(
      `${portal}/items/${item.id}/answer`,
      'PUT',
      {
        value: { text: 'A synthetic client answer' },
        expectedVersion: 1,
        expectedStructureVersion: r.project.structureVersion,
        saveOperationId: crypto.randomUUID(),
      },
      false,
    )
    const conflict = await request(
      `${portal}/items/${item.id}/answer`,
      'PUT',
      {
        value: { text: 'Old answer' },
        expectedVersion: 1,
        expectedStructureVersion: r.project.structureVersion,
      },
      false,
    )
    expect(conflict.status).toBe(409)
    expect(r.answers[item.id].value).toEqual({
      text: 'A synthetic client answer',
    })
    const { submission } = await json<{ submission: SubmissionRevision }>(
      `${portal}/items/${item.id}/submit`,
      'POST',
      {
        expectedAnswerVersion: answer.version,
        expectedStructureVersion: r.project.structureVersion,
      },
      false,
    )
    expect(submission.valueSnapshot).toEqual({
      text: 'A synthetic client answer',
    })
    const checklist = await json<ClientChecklist>(
      `${portal}/checklist`,
      'GET',
      undefined,
      false,
    )
    expect(JSON.stringify(checklist)).not.toContain('secret internal')
    expect(JSON.stringify(checklist)).not.toContain('client@example')
    const withdrawn = await json<{ item: Item }>(
      `${portal}/items/${item.id}/withdraw`,
      'POST',
      { expectedItemVersion: item.version },
      false,
    )
    expect(withdrawn.item.state).toBe('DRAFT')
    r.answers[item.id].value = { text: 'A newer draft' }
    expect(r.revisions[item.id][0].valueSnapshot).toEqual({
      text: 'A synthetic client answer',
    })
  })
  it('revokes existing client sessions immediately and preserves drafts when paused', async () => {
    login()
    await enterClient()
    const r = productDb.projects[demoProjectId]
    const item = r.structure[0].items[0]
    r.project.state = 'PAUSED'
    expect(
      (
        await request(
          `${portal}/items/${item.id}/answer`,
          'PUT',
          {
            value: { text: 'x' },
            expectedVersion: 1,
            expectedStructureVersion: 1,
          },
          false,
        )
      ).status,
    ).toBe(409)
    r.project.state = 'ACTIVE'
    await json(`${projectRoot}/contacts/${r.contacts[0].id}/access`, 'DELETE')
    expect(
      (await request(`${portal}/checklist`, 'GET', undefined, false)).status,
    ).toBe(403)
  })
})
describe('review, exports and AI', () => {
  async function submitted() {
    login()
    await enterClient()
    const r = productDb.projects[demoProjectId]
    const item = r.structure
      .flatMap((s) => s.items)
      .find((i) => i.type === 'SHORT_TEXT')!
    r.answers[item.id].value = { text: 'Approved synthetic text' }
    await json(
      `${portal}/items/${item.id}/submit`,
      'POST',
      { expectedAnswerVersion: 1, expectedStructureVersion: 1 },
      false,
    )
    return { r, item }
  }
  it('requests changes, preserves history, accepts a resubmission and rejects the old revision', async () => {
    const { r, item } = await submitted()
    const previous = item.currentRevisionId
    await json(`${projectRoot}/items/${item.id}/review-decisions`, 'POST', {
      decision: 'REQUEST_CHANGES',
      revisionId: previous,
      expectedItemVersion: item.version,
      reason: 'Please include the location.',
    })
    expect(item.state).toBe('CHANGES_REQUESTED')
    const view = await json<ClientChecklist>(
      `${portal}/checklist`,
      'GET',
      undefined,
      false,
    )
    expect(
      view.sections
        .flatMap((s) => s.items)
        .find((i) => i.id === item.id)
        ?.comments.some((c) => c.body === 'Please include the location.'),
    ).toBe(true)
    const { answer } = await json<{ answer: Answer }>(
      `${portal}/items/${item.id}/answer`,
      'PUT',
      {
        value: { text: 'Lamar Dental in Brooklyn' },
        expectedVersion: r.answers[item.id].version,
        expectedStructureVersion: r.project.structureVersion,
      },
      false,
    )
    await json(
      `${portal}/items/${item.id}/submit`,
      'POST',
      {
        expectedAnswerVersion: answer.version,
        expectedStructureVersion: r.project.structureVersion,
      },
      false,
    )
    expect(r.revisions[item.id]).toHaveLength(2)
    expect(
      (
        await request(
          `${projectRoot}/items/${item.id}/review-decisions`,
          'POST',
          {
            decision: 'APPROVE',
            revisionId: previous,
            expectedItemVersion: item.version,
          },
        )
      ).status,
    ).toBe(409)
    await json(`${projectRoot}/items/${item.id}/review-decisions`, 'POST', {
      decision: 'APPROVE',
      revisionId: item.currentRevisionId,
      expectedItemVersion: item.version,
    })
    expect(item.state).toBe('APPROVED')
    expect(r.revisions[item.id][1].valueSnapshot).toEqual({
      text: 'Approved synthetic text',
    })
  })
  it('requires a reason, rejects stale revisions and approves only the exact current submission', async () => {
    const { r, item } = await submitted()
    expect(
      (
        await request(
          `${projectRoot}/items/${item.id}/review-decisions`,
          'POST',
          {
            decision: 'REQUEST_CHANGES',
            revisionId: item.currentRevisionId,
            expectedItemVersion: item.version,
          },
        )
      ).status,
    ).toBe(422)
    expect(
      (
        await request(
          `${projectRoot}/items/${item.id}/review-decisions`,
          'POST',
          {
            decision: 'APPROVE',
            revisionId: 'stale',
            expectedItemVersion: item.version,
          },
        )
      ).status,
    ).toBe(409)
    await json(`${projectRoot}/items/${item.id}/review-decisions`, 'POST', {
      decision: 'APPROVE',
      revisionId: item.currentRevisionId,
      expectedItemVersion: item.version,
    })
    expect(progressFor(r.structure, r.answers).approvedRequired).toBe(1)
    expect(
      (
        await request(`${projectRoot}/complete`, 'POST', {
          expectedVersion: r.project.version,
        })
      ).status,
    ).toBe(409)
  })
  it('creates valid approved-only immutable ZIP/JSON/Markdown artifacts', async () => {
    const { r, item } = await submitted()
    await json(`${projectRoot}/items/${item.id}/review-decisions`, 'POST', {
      decision: 'APPROVE',
      revisionId: item.currentRevisionId,
      expectedItemVersion: item.version,
    })
    for (const format of [
      'APPROVED_ZIP',
      'APPROVED_JSON',
      'APPROVED_MARKDOWN',
    ]) {
      expect(
        (
          await request(`${projectRoot}/exports`, 'POST', {
            format,
            expectedProjectVersion: r.project.version,
          })
        ).status,
      ).toBe(422)
      const result = await json<{ export: { id: string } }>(
        `${projectRoot}/exports`,
        'POST',
        {
          format,
          expectedProjectVersion: r.project.version,
          acknowledgePartial: true,
        },
      )
      const id = result.export.id
      await json(`${projectRoot}/exports/${id}`)
      await json(`${projectRoot}/exports/${id}`)
      r.answers[item.id].value = { text: 'unapproved mutable draft' }
      const { url } = await json<{ url: string }>(
        `${projectRoot}/exports/${id}/download`,
        'POST',
        {},
      )
      const download = await fetch(url)
      expect(download.status).toBe(200)
      const bytes = new Uint8Array(await download.arrayBuffer())
      const content =
        format === 'APPROVED_ZIP'
          ? strFromU8(unzipSync(bytes)['manifest.json'])
          : strFromU8(bytes)
      expect(content).toContain('Approved synthetic text')
      expect(content).not.toContain('unapproved mutable draft')
      expect(content).not.toContain('INTERNAL')
    }
  })
  it('keeps AI suggestions separate and rejects acceptance after a newer edit', async () => {
    login()
    await enterClient()
    const r = productDb.projects[demoProjectId]
    const item = r.structure
      .flatMap((s) => s.items)
      .find((i) => i.type === 'LONG_TEXT')!
    item.ai = { enabled: true, targetWords: 100 }
    const { job } = await json<{ job: { id: string } }>(
      `${portal}/items/${item.id}/ai-drafts`,
      'POST',
      {
        facts: ['Family-owned since 2019.'],
        tone: 'Friendly',
        targetWords: 100,
        baseAnswerVersion: 1,
        consent: true,
      },
      false,
    )
    expect(r.answers[item.id].value).toEqual(initialValue('LONG_TEXT'))
    await json(`${portal}/ai-drafts/${job.id}`, 'GET', undefined, false)
    await json(`${portal}/ai-drafts/${job.id}`, 'GET', undefined, false)
    r.answers[item.id].version++
    expect(
      (
        await request(
          `${portal}/ai-drafts/${job.id}/accept`,
          'POST',
          { expectedAnswerVersion: 2 },
          false,
        )
      ).status,
    ).toBe(409)
  })
  it('shares counts only, and revocation takes effect immediately', async () => {
    login()
    const share = await json<{ shareId: string; fragmentToken: string }>(
      `${projectRoot}/status-shares`,
      'POST',
      {
        alias: 'Evergreen',
        expiresAt: new Date(Date.now() + 864e5).toISOString(),
        allowedOrigins: [],
      },
    )
    const { readToken } = await json<{ readToken: string }>(
      `status-shares/${share.shareId}/exchange`,
      'POST',
      { token: share.fragmentToken },
      false,
    )
    const response = await fetch(
      root + `status-shares/${share.shareId}/counts`,
      { headers: { 'X-Status-Token': readToken } },
    )
    const text = await response.text()
    expect(text).toContain('Evergreen')
    expect(text).not.toContain('Lamar')
    expect(text).not.toContain('answers')
    await json(`${projectRoot}/status-shares/${share.shareId}`, 'DELETE')
    expect(
      (
        await request(
          `status-shares/${share.shareId}/counts`,
          'GET',
          undefined,
          false,
        )
      ).status,
    ).toBe(410)
  })
})
describe('shared visibility and validation', () => {
  it('uses the same enabled/conditional denominator for progress', () => {
    const r = productDb.projects[demoProjectId]
    const s = r.structure[0]
    const controller = s.items[0]
    controller.type = 'SINGLE_SELECT'
    r.answers[controller.id].value = { optionKey: 'yes' }
    const dependent = s.items[1]
    dependent.required = true
    dependent.visibleWhen = {
      dependsOnItemKey: controller.key,
      operator: 'EQUALS',
      optionKey: 'no',
    }
    expect(
      visibleItems(r.structure, r.answers).some((i) => i.id === dependent.id),
    ).toBe(false)
    dependent.state = 'APPROVED'
    const before = progressFor(r.structure, r.answers)
    r.answers[controller.id].value = { optionKey: 'no' }
    expect(progressFor(r.structure, r.answers).requiredTotal).toBe(
      before.requiredTotal + 1,
    )
  })
  it('rejects unsafe URLs, unavailable options, unready files and invalid repeaters', () => {
    const common = {
      key: 'test',
      label: 'Test',
      instructions: '',
      example: '',
      required: true,
    }
    expect(
      validateAnswer(
        { ...common, type: 'URL', validation: {} },
        { url: 'javascript:alert(1)' },
      ),
    ).not.toHaveLength(0)
    expect(
      validateAnswer(
        {
          ...common,
          type: 'SINGLE_SELECT',
          validation: { options: [{ key: 'yes', label: 'Yes' }] },
        },
        { optionKey: 'bad' },
      ),
    ).not.toHaveLength(0)
    expect(
      validateAnswer(
        { ...common, type: 'IMAGE', validation: {} },
        { assetIds: ['unready'] },
      ),
    ).not.toHaveLength(0)
    expect(
      validateAnswer(
        {
          ...common,
          type: 'REPEATER',
          validation: {
            columns: [
              { key: 'n', label: 'Number', type: 'NUMBER', required: true },
            ],
          },
        },
        { rows: [{ rowId: 'row', values: { n: 'not a number' } }] },
      ),
    ).not.toHaveLength(0)
  })
})

describe('reference workflow permissions', () => {
  it('requires reauthentication and an active member to transfer ownership', async () => {
    login()
    const member = productDb.workspaces[agencyId].members.find(
      (m) => m.role === 'MEMBER',
    )!
    expect(
      (
        await request(`workspaces/${agencyId}/ownership-transfer`, 'POST', {
          targetMemberId: member.id,
          currentPassword: 'wrong',
        })
      ).status,
    ).toBe(403)
    await json(`workspaces/${agencyId}/ownership-transfer`, 'POST', {
      targetMemberId: member.id,
      currentPassword: 'ContentDemo!2026',
    })
    expect(member.role).toBe('OWNER')
    expect((await request(`workspaces/${agencyId}/members`)).status).toBe(403)
  })
  it('rejects cross-tenant file lists and upload reservations by assigned members', async () => {
    login('member@studio.example')
    expect(
      (
        await request(`${projectRoot}/uploads`, 'POST', {
          itemId: 'fake',
          bytes: 2,
        })
      ).status,
    ).toBe(403)
    expect(
      (await request(`workspaces/${soloId}/projects/${demoProjectId}/assets`))
        .status,
    ).toBe(404)
  })
  it('validates project assignments before reserving an invitation seat', async () => {
    login()
    const seats = productDb.workspaces[agencyId].usage.seatsReserved
    expect(
      (
        await request(`workspaces/${agencyId}/members/invite`, 'POST', {
          email: 'new@example.test',
          assignments: [
            { projectId: 'missing', canReview: true, canExport: false },
          ],
        })
      ).status,
    ).toBe(404)
    expect(productDb.workspaces[agencyId].usage.seatsReserved).toBe(seats)
  })
})

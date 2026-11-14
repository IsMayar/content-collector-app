import assert from 'node:assert/strict'
import console from 'node:console'
import process from 'node:process'
import { URL } from 'node:url'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { localEdgeOptions } from './localEdge.mjs'

const origin = 'http://127.0.0.1:5173'
const inbox = new URL('../../backend/.local/auth/inbox/', import.meta.url)
const runId = randomUUID()
const ownerEmail = 'invitation-owner-' + runId + '@example.test'
const contactEmail = 'invitation-client-' + runId + '@example.test'
const password = 'Local!' + randomBytes(24).toString('base64url')
const title = 'Invitation smoke ' + runId.slice(0, 8)
const content = 'Synthetic invitation exchange draft.'
let browser
let phase = 'start browser'

async function inboxLink(purpose, email, path) {
  let match
  await expect
    .poll(
      async () => {
        for (const file of await readdir(inbox)) {
          if (!/^[a-f0-9-]{36}\.txt$/.test(file)) continue
          const [kind, recipient, link] = (
            await readFile(new URL(file, inbox), 'utf8')
          ).split('\n')
          if (kind === purpose && recipient === email && link) {
            match = new URL(link.trim())
            return true
          }
        }
        return false
      },
      { timeout: 30000 },
    )
    .toBe(true)
  assert.equal(match.origin, origin)
  assert.equal(match.pathname, path)
  return match.href
}

async function request(page, args, agency = true) {
  return page.evaluate(
    async ({ args, agency }) => {
      const { store } = await import('/src/app/store/store.ts')
      const { createBaseQuery } = await import('/src/services/api/baseQuery.ts')
      const controller = new globalThis.AbortController()
      const response = await createBaseQuery(agency)(
        args,
        {
          signal: controller.signal,
          abort: () => controller.abort(),
          dispatch: store.dispatch,
          getState: store.getState,
          endpoint: 'local-storage-smoke',
          type: 'query',
        },
        {},
      )
      return {
        status: response.error?.status ?? response.meta?.response?.status,
        data: response.data,
      }
    },
    { args, agency },
  )
}

function post(page, suffix, status, click) {
  return Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        new URL(r.url()).pathname.endsWith(suffix),
    ),
    click(),
  ]).then(([response]) => {
    assert.equal(response.status(), status)
    return response
  })
}

try {
  browser = await chromium.launch(localEdgeOptions())
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const page = await context.newPage()
  const button = (name) => page.getByRole('button', { name, exact: true })
  const link = (name) => page.getByRole('link', { name, exact: true })
  phase = 'register, verify and sign in'
  await page.goto(origin + '/sign-up')
  await expect(page.getByLabel('Development environment')).toHaveCount(0)
  await page.getByLabel('Your name').fill('Storage Smoke')
  await page.getByLabel('Email address').fill(ownerEmail)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password', { exact: true }).fill(password)
  await post(page, '/auth/register', 202, () =>
    button('Create account').click(),
  )
  await page.goto(await inboxLink('VERIFY_EMAIL', ownerEmail, '/verify-email'))
  await post(page, '/auth/verify-email', 200, () =>
    button('Verify email').click(),
  )
  await page.goto(origin + '/sign-in')
  await page.getByLabel('Email address').fill(ownerEmail)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await post(page, '/auth/login', 200, () => button('Sign in').click())
  await page.getByLabel('Workspace name', { exact: true }).fill(title)
  await page.getByLabel('Workspace timezone', { exact: true }).fill('UTC')
  await post(page, '/workspaces', 201, () => button('Create workspace').click())
  const picker = page.getByLabel('Workspace', { exact: true })
  await expect(picker).toHaveValue(/.+/)
  const workspace = await picker.inputValue()
  const base = 'workspaces/' + workspace
  const usageBefore = await request(page, base + '/usage')
  assert.equal(usageBefore.status, 200)
  assert.ok(usageBefore.data.usage.storageLimitBytes > 0)
  console.log('PASS real sign-in and storage usage limit')

  phase = 'create and reopen a synthetic project'
  const catalog = await request(page, base + '/templates')
  const template = catalog.data.data.find(
    (entry) => entry.projectType === 'WEBSITE',
  )
  assert.ok(template)
  const app = origin + '/app/w/' + workspace + '/projects/'
  await page.goto(app + 'new?type=WEBSITE&template=' + template.versionId)
  await page.getByLabel('Project name', { exact: true }).fill(title)
  await page
    .getByLabel('Due date', { exact: true })
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10))
  await page.getByLabel('Timezone', { exact: true }).fill('UTC')
  await page.getByRole('radio', { name: /Add a new customer/ }).check()
  await page
    .getByLabel('Business name', { exact: true })
    .fill('Synthetic Storage Customer')
  await page.getByLabel('Contact name', { exact: true }).fill('Storage Contact')
  await page.getByLabel('Customer email', { exact: true }).fill(contactEmail)
  await button('Continue to review').click()
  const created = await post(page, '/projects', 201, () =>
    button('Save as draft').click(),
  )
  const { project } = await created.json()
  const agency = base + '/projects/' + project.id
  const clientRoot = 'client/projects/' + project.id
  await page.goto(app + project.id)
  await expect(
    page.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible()
  const detail = (await request(page, agency)).data
  const section = await request(page, {
    url: agency + '/sections',
    method: 'POST',
    body: {
      title: 'Smoke attachments',
      expectedStructureVersion: detail.project.structureVersion,
    },
  })
  assert.equal(section.status, 201)
  const current = (await request(page, agency)).data
  const itemResult = await request(page, {
    url: agency + '/sections/' + section.data.section.id + '/items',
    method: 'POST',
    body: {
      expectedStructureVersion: current.project.structureVersion,
      definition: {
        key: 'smoke.private-file',
        label: 'Invitation draft',
        type: 'LONG_TEXT',
        instructions: 'Synthetic files only',
        example: '',
        enabled: true,
        required: false,
        validation: { maxLength: 2000 },
      },
    },
  })
  assert.equal(itemResult.status, 201)

  phase = 'publish and exchange the real client invitation'
  await link('Send to client').click()
  await button('Add project contact').click()
  const dialog = page.getByRole('dialog')
  await dialog
    .getByLabel('Contact name', { exact: true })
    .fill('Storage Contact')
  await dialog.getByLabel('Contact email', { exact: true }).fill(contactEmail)
  await post(page, '/contacts', 201, () =>
    dialog.getByRole('button', { name: 'Save contact', exact: true }).click(),
  )
  await button('Publish project').click()
  await post(page, '/publish', 200, () =>
    dialog
      .getByRole('button', { name: 'Confirm publish', exact: true })
      .click(),
  )
  await button('Send / resend invite').click()
  await post(page, '/invite', 202, () =>
    dialog
      .getByRole('button', { name: 'Send invitation', exact: true })
      .click(),
  )
  const clientContext = await browser.newContext({ serviceWorkers: 'block' })
  const client = await clientContext.newPage()
  await client.goto(
    await inboxLink('CLIENT_INVITE', contactEmail, '/client/access'),
  )
  await post(client, '/client-access/exchange', 200, () =>
    client
      .getByRole('button', { name: 'Open my project', exact: true })
      .click(),
  )

  phase = 'correct project and persistent client draft'
  await expect(client).toHaveURL(origin + '/client/projects/' + project.id)
  const checklist = await request(client, clientRoot + '/checklist', false)
  assert.equal(checklist.status, 200)
  assert.equal(checklist.data.project.id, project.id)
  await client
    .getByRole('navigation', { name: 'Requested sections' })
    .getByRole('button', { name: 'Smoke attachments', exact: true })
    .click()
  const field = client.locator('article').filter({
    has: client.getByRole('heading', {
      name: 'Invitation draft',
      exact: true,
    }),
  })
  await field
    .getByRole('textbox', { name: 'Your response', exact: true })
    .fill(content)
  await expect(
    field.getByRole('status').filter({ hasText: /^Saved/ }),
  ).toBeVisible()
  await client.reload()
  await client
    .getByRole('navigation', { name: 'Requested sections' })
    .getByRole('button', { name: 'Smoke attachments', exact: true })
    .click()
  await expect(
    field.getByRole('textbox', { name: 'Your response', exact: true }),
  ).toHaveValue(content)
  console.log(
    'PASS invitation exchange, correct project, isolated client cookie, and draft persistence',
  )
} catch (error) {
  console.error('Invitation smoke failed at: ' + phase)
  console.error(
    error.name +
      ': ' +
      String(error.message)
        .split('\n')[0]
        .replace(/https?:\/\/[^\s]+/g, '[private URL]')
        .replace(/[A-Za-z0-9_-]{40,}/g, '[redacted]'),
  )
  process.exitCode = 1
} finally {
  await browser?.close()
}

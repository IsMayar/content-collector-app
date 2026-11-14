import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import console from 'node:console'
import process from 'node:process'
import { URL } from 'node:url'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { unzipSync } from 'fflate'
import { localEdgeOptions } from './localEdge.mjs'

const origin = 'http://127.0.0.1:5176'
const inbox = new URL('../../backend/.local/auth/inbox/', import.meta.url)
const runId = randomUUID()
const ownerEmail = 'storage-owner-' + runId + '@example.test'
const contactEmail = 'storage-client-' + runId + '@example.test'
const password = 'Local!' + randomBytes(24).toString('base64url')
const title = 'Local storage smoke ' + runId.slice(0, 8)
const content = 'Synthetic private document for local storage acceptance.'
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
        label: 'Private smoke document',
        type: 'FILE',
        instructions: 'Synthetic files only',
        example: '',
        enabled: true,
        required: false,
        validation: { maxFiles: 2, allowedExtensions: ['txt'] },
      },
    },
  })
  assert.equal(itemResult.status, 201)
  const item = itemResult.data.item.id

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
  await client
    .getByRole('navigation', { name: 'Requested sections' })
    .getByRole('button', { name: 'Smoke attachments', exact: true })
    .click()
  const field = client.locator('article').filter({
    has: client.getByRole('heading', {
      name: 'Private smoke document',
      exact: true,
    }),
  })
  const upload = async (name, payload) => {
    const finalized = client.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        /\/uploads\/[^/]+\/finalize$/.test(new URL(r.url()).pathname),
    )
    await field.getByLabel('Choose project files').setInputFiles({
      name,
      mimeType: 'text/plain',
      buffer: Buffer.from(payload),
    })
    const response = await finalized
    assert.equal(response.status(), 202)
    const asset = await response.json()
    assert.equal(asset.state, 'PROCESSING')
    return asset.assetId
  }
  phase = 'quarantine, scan and save a clean attachment'
  const asset = await upload('safe-smoke.txt', content)
  await expect(field.getByText('READY', { exact: true })).toBeVisible({
    timeout: 60000,
  })
  await expect(
    field.getByRole('status').filter({ hasText: /^Saved/ }),
  ).toBeVisible()
  const itemData = await request(client, clientRoot + '/items/' + item, false)
  assert.deepEqual(itemData.data.answer.value.assetIds, [asset])
  const [saved] = await Promise.all([
    client.waitForEvent('download'),
    field.getByRole('button', { name: 'Download', exact: true }).click(),
  ])
  assert.equal(await readFile(await saved.path(), 'utf8'), content)
  await saved.delete()
  const usageAfter = await request(page, base + '/usage')
  assert.ok(
    usageAfter.data.usage.storageUsedBytes >=
      usageBefore.data.usage.storageUsedBytes + Buffer.byteLength(content),
  )
  console.log(
    'PASS PROCESSING quarantine, READY, authorized bytes and storage usage',
  )
  phase = 'reject a standard antivirus test string'
  const testSignature =
    'X5O!P%@AP[4' +
    String.fromCharCode(92) +
    'PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
  const rejected = await upload('antivirus-smoke.txt', testSignature)
  await expect(field.getByText('REJECTED', { exact: true })).toBeVisible({
    timeout: 60000,
  })
  const rejectedAsset = await request(
    client,
    clientRoot + '/assets/' + rejected,
    false,
  )
  assert.equal(rejectedAsset.data.asset.rejectionCode, 'MALWARE_DETECTED')
  const rejectedDownload = await request(
    client,
    {
      url: clientRoot + '/assets/' + rejected + '/download',
      method: 'POST',
      body: { variant: 'ORIGINAL' },
    },
    false,
  )
  assert.ok([404, 409].includes(rejectedDownload.status))
  console.log('PASS standard antivirus test rejected and denied download')

  phase = 'submit and approve the exact revision'
  await field
    .getByRole('button', { name: 'Review and submit', exact: true })
    .click()
  const submitted = await post(client, '/submit', 201, () =>
    field
      .getByRole('button', { name: 'Submit for review', exact: true })
      .click(),
  )
  const revision = await submitted.json()
  await page.goto(
    app +
      project.id +
      '?tab=responses&itemId=' +
      item +
      '&revisionId=' +
      revision.revisionId,
  )
  await expect(page).toHaveURL(new RegExp('[?]tab=checklist&item=' + item))
  await expect(
    page.getByRole('heading', { name: 'Submitted revision 1', exact: true }),
  ).toBeVisible()
  const exact = (
    await request(
      page,
      agency + '/items/' + item + '/revisions/' + revision.revisionId,
    )
  ).data.revision
  assert.deepEqual(exact.valueSnapshot.assetIds, [asset])
  await button('Approve revision').click()
  await post(page, '/review-decisions', 201, () =>
    dialog.getByRole('button', { name: 'Approve', exact: true }).click(),
  )
  await expect(
    page.getByText('Exact submitted revision approved.', { exact: true }),
  ).toBeVisible()
  console.log('PASS exact revision submission and approval')

  phase = 'authorize agency attachment download'
  const signed = await request(page, {
    url: agency + '/assets/' + asset + '/download',
    method: 'POST',
    body: { variant: 'ORIGINAL' },
  })
  assert.equal(
    signed.status,
    200,
    'Agency authorization status: ' + signed.status,
  )
  const unsigned = new URL(signed.data.url)
  unsigned.search = ''
  const anonymous = await browser.newContext({ serviceWorkers: 'block' })
  assert.ok(
    [401, 403].includes((await anonymous.request.get(unsigned.href)).status()),
  )
  phase = 'deny anonymous attachment download'
  const stranger = await anonymous.newPage()
  await stranger.goto(origin + '/sign-in')
  const denial = (
    await request(stranger, {
      url: agency + '/assets/' + asset + '/download',
      method: 'POST',
      body: { variant: 'ORIGINAL' },
    })
  ).status
  assert.ok([401, 403].includes(denial), 'Anonymous download status: ' + denial)
  phase = 'queue and inspect the approved export'
  await page.goto(app + project.id + '?tab=exports')
  await page.getByRole('button', { name: /New export/ }).click()
  await page.getByLabel(/I understand this is a/).check()
  await button('Continue').click()
  const queued = await post(page, '/exports', 202, () =>
    button('Create approved export').click(),
  )
  const job = await queued.json()
  assert.equal(job.state, 'QUEUED')
  await expect(button('Download')).toBeVisible({ timeout: 60000 })
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    button('Download').click(),
  ])
  const zip = unzipSync(await readFile(await download.path()))
  await download.delete()
  const manifest = JSON.parse(
    Buffer.from(zip['manifest.json']).toString('utf8'),
  )
  const items = manifest.sections.flatMap((entry) => entry.items)
  assert.equal(items.length, 1)
  assert.equal(items[0].revisionId, revision.revisionId)
  assert.deepEqual(items[0].value.assetIds, [asset])
  assert.ok(
    items[0].files.some(
      (file) => Buffer.from(zip[file.path]).toString('utf8') === content,
    ),
  )
  const exportRequest = {
    url: agency + '/exports/' + job.jobId + '/download',
    method: 'POST',
    body: {},
  }
  const exportDenial = await request(stranger, exportRequest)
  assert.ok([401, 403].includes(exportDenial.status))
  const exportLink = await request(page, exportRequest)
  assert.equal(exportLink.status, 200)
  const unsignedExport = new URL(exportLink.data.url)
  unsignedExport.search = ''
  assert.ok(
    [401, 403].includes(
      (await anonymous.request.get(unsignedExport.href)).status(),
    ),
  )
  console.log(
    'PASS exact approved ZIP and anonymous attachment and export denials',
  )
} catch (error) {
  console.error('Local storage smoke failed at: ' + phase)
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

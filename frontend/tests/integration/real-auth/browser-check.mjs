import { unzipSync } from 'fflate'
// Explicit integration runner: real Vite, HTTPS, Edge and HTTP API; no MSW or request mocks.
import { createServer } from 'vite'
import { createServer as createHttpServer } from 'node:http'
import { chromium, expect } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import assert from 'node:assert/strict'

let server,
  browser,
  context,
  page,
  settings,
  origin,
  teammateContext,
  teammatePage
let clientContext, clientPage
let clientBearerAttached = false
let phase = 'start'
let refreshes = 0
let serviceWorkerResponse = false
const http = []
const response = (ok, kind = '') =>
  process.stdout.write(
    JSON.stringify({
      ok,
      phase,
      kind,
      origin,
      http: ok ? [] : http.slice(-12),
    }) + String.fromCharCode(10),
  )
async function waitState(expected, target = page) {
  await expect
    .poll(
      () =>
        target.evaluate(
          async () =>
            (await import('/src/app/store/store.ts')).store.getState().auth
              .status,
        ),
      { timeout: 30000 },
    )
    .toBe(expected)
}
function observe(target) {
  target.on('console', (message) => {
    if (message.type() === 'error' && phase.startsWith('client-attachments'))
      http.push({
        browserError: message
          .text()
          .replace(/https?:\/\/[^\s]+/g, '[private URL]'),
      })
  })

  target.on('requestfailed', (request) => {
    const url = new URL(request.url())
    http.push({
      path: url.pathname.startsWith('/api/') ? url.pathname : 'private-object',
      method: request.method(),
      failure: request.failure()?.errorText,
    })
  })

  target.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/auth/refresh') refreshes++
  })
  target.on('response', (res) => {
    const path = new URL(res.url()).pathname
    if (path.startsWith('/api/')) {
      if (res.fromServiceWorker()) serviceWorkerResponse = true
      http.push({ path, method: res.request().method(), status: res.status() })
    }
  })
}
async function signin(
  target = page,
  password = settings.password,
  expected = 200,
  returnTo = null,
) {
  phase = 'signin-open'
  await target.goto(
    origin +
      '/sign-in' +
      (returnTo ? '?returnTo=' + encodeURIComponent(returnTo) : ''),
  )
  await target.getByLabel('Email address', { exact: true }).fill(settings.email)
  await target.getByLabel('Password', { exact: true }).fill(password)
  phase = 'signin-submit'
  const result = target.waitForResponse(
    (res) => new URL(res.url()).pathname === '/api/v1/auth/login',
  )
  await target.getByRole('button', { name: 'Sign in', exact: true }).click()
  assert.ok(
    (await result).status() === expected,
    'Sign-in HTTP status mismatch',
  )
  if (expected === 200) await waitState('authenticated', target)
  else await waitState('anonymous', target)
}
async function run(args, target = page, agency = true) {
  return target.evaluate(
    async ({ args, agency }) => {
      const { store } = await import('/src/app/store/store.ts')
      const { createBaseQuery } = await import('/src/services/api/baseQuery.ts')
      const control = new AbortController()
      const result = await createBaseQuery(agency)(
        args,
        {
          signal: control.signal,
          abort: () => control.abort(),
          dispatch: store.dispatch,
          getState: store.getState,
          extra: undefined,
          endpoint: 'real-auth-check',
          type: 'query',
        },
        {},
      )
      return {
        status: result.error?.status || result.meta?.response?.status,
        code: result.error?.data?.code,
        data: result.data,
      }
    },
    { args, agency },
  )
}
async function rawMutation(path, target = page) {
  return target.evaluate(async (path) => {
    const { store } = await import('/src/app/store/store.ts')
    const protection = await fetch('/api/v1/auth/csrf', {
      credentials: 'include',
    }).then((res) => res.json())
    const res = await fetch('/api/v1/' + path, {
      method: 'POST',
      credentials: 'include',
      body: '{}',
      headers: {
        'Content-Type': 'application/json',
        'X-XSRF-TOKEN': protection.token,
        Authorization: 'Bearer ' + store.getState().auth.accessToken,
      },
    })
    return res.status
  }, path)
}
async function command(input) {
  phase = input.action
  switch (input.action) {
    case 'start': {
      settings = input
      process.chdir(fileURLToPath(new URL('../../..', import.meta.url)))
      process.env.VITE_ENABLE_MOCKS = 'false'
      process.env.VITE_API_BASE_URL = '/api/v1/'
      process.env.VITE_API_PROXY_TARGET = input.backend
      server = await createServer({
        configFile: fileURLToPath(
          new URL('../../../vite.config.ts', import.meta.url),
        ),
        mode: 'real-auth',
        logLevel: 'silent',
        define: {
          'import.meta.env.VITE_ENABLE_MOCKS': JSON.stringify('false'),
        },
        server: {
          host: '127.0.0.1',
          port: 0,
          strictPort: false,
          https: {
            pfx: readFileSync(input.certificate),
            passphrase: input.certificatePassword,
          },
          proxy: { '/api': { target: input.backend, changeOrigin: true } },
        },
      })
      await server.listen()
      origin = 'https://127.0.0.1:' + server.httpServer.address().port
      browser = await chromium.launch({ channel: 'msedge', headless: true })
      context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 1000 },
      })
      page = await context.newPage()
      observe(page)
      if (input.onboarding === 'true') {
        await page.goto(origin + '/sign-up')
        break
      }
      await signin()
      phase = 'secure-cookie-check'
      const cookies = await context.cookies(origin + '/api/v1/auth/refresh')
      const refresh = cookies.find(
        (c) => c.name === '__Secure-collector_refresh',
      )
      assert.ok(
        refresh?.httpOnly &&
          refresh.secure &&
          refresh.sameSite === 'Lax' &&
          refresh.path === '/api/v1/auth',
        'Production cookie policy mismatch',
      )
      assert.ok(
        await page.evaluate(
          () => !document.cookie.includes('collector_refresh'),
        ),
        'HttpOnly cookie was exposed',
      )
      phase = 'initial-me'
      assert.ok(
        (await run('me')).status === 200,
        'Authenticated identity failed',
      )
      break
    }
    case 'signin-safe':
      await signin(
        page,
        settings.password,
        200,
        'https://untrusted.example/landing',
      )
      await expect(page).toHaveURL(origin + '/app/onboarding')
      break
    case 'workspace-expired-access': {
      const before = refreshes
      assert.ok(
        (await run('workspaces/' + settings.workspace)).status === 200,
        'Expired workspace access did not refresh',
      )
      assert.ok(
        refreshes === before + 1,
        'Workspace access issued redundant refresh',
      )
      break
    }
    case 'cross-tab-logout': {
      await page.goto(origin + '/app/w/' + settings.workspace + '/overview')
      await waitState('authenticated')
      const peer = await context.newPage()
      try {
        await peer.goto(origin + '/app/w/' + settings.workspace + '/overview')
        await waitState('authenticated', peer)
        for (const target of [page, peer]) {
          await expect
            .poll(() =>
              target.evaluate(
                async (id) =>
                  Object.keys(
                    (await import('/src/app/store/store.ts')).store.getState()
                      .agencyApi.queries,
                  ).some((key) => key.includes(id)),
                settings.workspace,
              ),
            )
            .toBe(true)
        }
        const result = page.waitForResponse(
          (res) => new URL(res.url()).pathname === '/api/v1/auth/logout',
        )
        await page
          .getByRole('button', { name: 'Sign out', exact: true })
          .click()
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Sign out', exact: true })
          .click()
        assert.ok((await result).status() === 204, 'UI logout failed')
        for (const target of [page, peer]) {
          await waitState('anonymous', target)
          const cleared = await target.evaluate(async () => {
            const state = (
              await import('/src/app/store/store.ts')
            ).store.getState()
            return (
              state.auth.accessToken === null &&
              state.auth.memberships.length === 0 &&
              Object.keys(state.agencyApi.queries).length === 0 &&
              Object.keys(state.clientApi.queries).length === 0
            )
          })
          assert.ok(cleared, 'Cross-tab logout retained private state')
          await expect(
            target.getByRole('heading', { name: 'Welcome back', exact: true }),
          ).toBeVisible()
        }
      } finally {
        await peer.close()
      }
      break
    }
    case 'workspace-register': {
      await page
        .getByLabel('Your name', { exact: true })
        .fill('Synthetic Onboarding Owner')
      await page
        .getByLabel('Email address', { exact: true })
        .fill(settings.email)
      await page.getByLabel('Password', { exact: true }).fill(settings.password)
      await page
        .getByLabel('Confirm password', { exact: true })
        .fill(settings.password)
      const result = page.waitForResponse(
        (res) => new URL(res.url()).pathname === '/api/v1/auth/register',
      )
      await page
        .getByRole('button', { name: 'Create account', exact: true })
        .click()
      assert.ok((await result).status() === 202, 'Real registration failed')
      break
    }
    case 'workspace-verify': {
      await page.goto(origin + '/verify-email#token=' + input.token)
      const result = page.waitForResponse(
        (res) => new URL(res.url()).pathname === '/api/v1/auth/verify-email',
      )
      await page
        .getByRole('button', { name: 'Verify email', exact: true })
        .click()
      assert.ok((await result).status() === 200, 'Real verification failed')
      assert.ok(
        !new URL(page.url()).hash,
        'Verification capability remained in history',
      )
      break
    }
    case 'workspace-create': {
      await expect(
        page.getByRole('heading', { name: 'Let’s set up your workspace.' }),
      ).toBeVisible()
      await page
        .getByLabel('Workspace name', { exact: true })
        .fill('Browser acceptance studio')
      await page.getByLabel('Workspace timezone', { exact: true }).fill('UTC')
      const result = page.waitForResponse(
        (res) =>
          new URL(res.url()).pathname === '/api/v1/workspaces' &&
          res.request().method() === 'POST',
      )
      await page
        .getByRole('button', { name: 'Create workspace', exact: true })
        .click()
      assert.ok(
        (await result).status() === 201,
        'Real workspace creation failed',
      )
      await waitState('authenticated')
      await expect(page.getByLabel('Workspace', { exact: true })).toHaveValue(
        /.+/,
      )
      settings.workspace = await page
        .getByLabel('Workspace', { exact: true })
        .inputValue()
      await expect(
        page.getByText('Workspace owner', { exact: true }),
      ).toBeVisible()
      await expect(
        page.getByText('Synthetic Onboarding Owner', { exact: true }),
      ).toBeVisible()
      assert.ok(
        (await run('workspaces/' + settings.workspace)).status === 200,
        'Created workspace unavailable',
      )
      const memberships = await page.evaluate(
        async () =>
          (await import('/src/app/store/store.ts')).store.getState().auth
            .memberships,
      )
      assert.ok(
        memberships.length === 1 &&
          memberships[0].role === 'OWNER' &&
          memberships[0].workspaceId === settings.workspace,
        'Created owner membership absent',
      )
      break
    }
    case 'workspace-projects': {
      const cards = await page.evaluate(async (workspace) => {
        const { store } = await import('/src/app/store/store.ts')
        const response = await fetch(
          '/api/v1/workspaces/' + workspace + '/templates',
          {
            credentials: 'include',
            headers: {
              Authorization: 'Bearer ' + store.getState().auth.accessToken,
            },
          },
        )
        if (response.status !== 200) throw new Error('Catalog unavailable')
        return (await response.json()).data.map(
          ({ versionId, projectType }) => ({ versionId, projectType }),
        )
      }, settings.workspace)
      for (const [index, type] of [
        'WEBSITE',
        'WEB_APP',
        'MOBILE_APP',
      ].entries()) {
        const template = cards.find((card) => card.projectType === type)
        assert.ok(template, 'Missing published template')
        await page.goto(
          origin +
            '/app/w/' +
            settings.workspace +
            '/projects/new?template=' +
            template.versionId +
            '&type=' +
            type,
        )
        await page
          .getByLabel('Project name', { exact: true })
          .fill('Browser ' + type)
        await page.getByLabel('Due date', { exact: true }).fill('2026-12-20')
        await page.getByLabel('Timezone', { exact: true }).fill('UTC')
        if (index === 0) {
          await page.getByRole('radio', { name: /Add a new customer/ }).check()
          await page
            .getByLabel('Business name', { exact: true })
            .fill('Browser project customer')
          await page
            .getByLabel('Contact name', { exact: true })
            .fill('Synthetic contact')
          await page
            .getByLabel('Customer email', { exact: true })
            .fill('project-browser@example.test')
        } else {
          await expect(
            page
              .getByLabel('Customer', { exact: true })
              .locator('option', { hasText: 'Browser project customer' }),
          ).toHaveCount(1)
          await page
            .getByLabel('Customer', { exact: true })
            .selectOption({ label: 'Browser project customer' })
        }
        await page
          .getByRole('button', { name: 'Continue to review', exact: true })
          .click()
        const created = page.waitForResponse(
          (res) =>
            new URL(res.url()).pathname ===
              '/api/v1/workspaces/' + settings.workspace + '/projects' &&
            res.request().method() === 'POST',
        )
        await page
          .getByRole('button', { name: 'Save as draft', exact: true })
          .click()
        const response = await created
        assert.equal(response.status(), 201, 'Real project creation failed')
        const { project } = await response.json()
        assert.equal(project.projectType, type)
        assert.equal(project.state, 'DRAFT')
        assert.equal(project.version, 1)
        assert.equal(project.aiEnabled, false)
        await expect(
          page.getByRole('heading', { name: 'Browser ' + type, exact: true }),
        ).toBeVisible()
        const compatible = await page.evaluate(
          async ({ workspace, id }) => {
            const { store } = await import('/src/app/store/store.ts')
            const { validateProductRead } =
              await import('/src/services/api/resourceSchemas.ts')
            const path = 'workspaces/' + workspace + '/projects/' + id
            const response = await fetch('/api/v1/' + path, {
              credentials: 'include',
              headers: {
                Authorization: 'Bearer ' + store.getState().auth.accessToken,
              },
            })
            if (response.status !== 200) return false
            const data = await response.json()
            return (
              validateProductRead(path, data).success &&
              data.structure.length > 0 &&
              data.progress.submittedRequired === 0 &&
              data.progress.approvedRequired === 0
            )
          },
          { workspace: settings.workspace, id: project.id },
        )
        assert.ok(compatible, 'Real project detail violates frontend contract')
        await page.reload()
        await waitState('authenticated')
        await expect(
          page.getByRole('heading', { name: 'Browser ' + type, exact: true }),
        ).toBeVisible()
      }
      assert.ok(!serviceWorkerResponse, 'MSW intercepted project acceptance')
      break
    }
    case 'workspace-structure': {
      phase = 'structure-open'
      const projects = (
        await run('workspaces/' + settings.workspace + '/projects')
      ).data.data
      const project = projects.find((p) => p.projectType === 'WEBSITE')
      const path =
        'workspaces/' + settings.workspace + '/projects/' + project.id
      const url =
        origin + '/app/w/' + settings.workspace + '/projects/' + project.id
      await page.goto(url)
      await expect(
        page.getByRole('heading', { name: 'Project content', exact: true }),
      ).toBeVisible()
      const responseFor = (method, suffix) =>
        page.waitForResponse(
          (res) =>
            new URL(res.url()).pathname === '/api/v1/' + path + suffix &&
            res.request().method() === method,
        )
      await page.locator('summary').filter({ hasText: 'Add section' }).click()
      await page
        .getByLabel('Section title', { exact: true })
        .fill('Browser structure')
      let result = responseFor('POST', '/sections')
      await page
        .getByRole('button', { name: 'Add section', exact: true })
        .click()
      let response = await result
      assert.equal(response.status(), 201)
      const section = (await response.json()).section
      await page
        .getByRole('navigation', { name: 'Content sections' })
        .getByRole('button', { name: /Browser structure/ })
        .click()
      await page
        .locator('summary')
        .filter({ hasText: 'Edit section name' })
        .click()
      await page
        .getByLabel('Section name', { exact: true })
        .fill('Browser edited section')
      result = responseFor('PATCH', '/sections/' + section.id)
      await page
        .getByRole('button', { name: 'Save section name', exact: true })
        .click()
      assert.equal((await result).status(), 200)
      await expect(
        page.getByRole('heading', {
          name: 'Browser edited section',
          exact: true,
        }),
      ).toBeVisible()
      const dialog = page.getByRole('dialog', { name: 'Item settings' })
      const created = []
      for (const type of [
        'SHORT_TEXT',
        'LONG_TEXT',
        'URL',
        'SINGLE_SELECT',
        'MULTI_SELECT',
        'IMAGE',
        'FILE',
        'REPEATER',
      ]) {
        phase = 'structure-create-' + type
        await page
          .getByRole('button', { name: 'Add item', exact: true })
          .click()
        await dialog
          .getByLabel('Label', { exact: true })
          .fill('Browser ' + type)
        await dialog
          .getByLabel('Stable key', { exact: true })
          .fill('browser_' + type.toLowerCase())
        await dialog
          .getByLabel('Field type', { exact: true })
          .selectOption(type)
        if (type === 'REPEATER') {
          await dialog
            .getByLabel('Entry field label', { exact: true })
            .first()
            .fill('Name')
          await dialog
            .getByLabel('Entry field key', { exact: true })
            .first()
            .fill('name')
          await dialog.getByLabel('Maximum rows', { exact: true }).fill('7')
        }
        if (type === 'LONG_TEXT')
          await dialog
            .getByLabel('Instructions', { exact: true })
            .fill('Preserved instructions')
        result = responseFor('POST', '/sections/' + section.id + '/items')
        await dialog
          .getByRole('button', { name: 'Save item', exact: true })
          .click()
        response = await result
        assert.equal(
          response.status(),
          201,
          'Real item creation failed: ' + type,
        )
        created.push((await response.json()).item)
        await expect(dialog).not.toBeVisible()
        await expect(
          page.getByRole('button', {
            name: 'Edit Browser ' + type,
            exact: true,
          }),
        ).toBeVisible()
      }
      phase = 'structure-conditional'
      const dependent = created.find((i) => i.type === 'MULTI_SELECT')
      const control = created.find((i) => i.type === 'SINGLE_SELECT')
      await page
        .getByRole('button', { name: 'Edit Browser MULTI_SELECT', exact: true })
        .click()
      await dialog
        .getByLabel('Show when an earlier single select equals', {
          exact: true,
        })
        .selectOption(control.key)
      result = responseFor('PATCH', '/items/' + dependent.id + '/schema')
      await dialog
        .getByRole('button', { name: 'Save item', exact: true })
        .click()
      assert.equal((await result).status(), 200)
      await expect(dialog).not.toBeVisible()
      let detail = (await run(path)).data
      assert.equal(
        detail.structure
          .find((s) => s.id === section.id)
          .items.find((i) => i.id === dependent.id).visible,
        false,
      )
      phase = 'structure-keyboard-reorder'
      for (const label of [
        'Move Browser edited section section up',
        'Move Browser URL up',
      ]) {
        result = responseFor('POST', '/structure/reorder')
        await page.getByRole('button', { name: label, exact: true }).focus()
        await page.keyboard.press('Enter')
        assert.equal((await result).status(), 200)
        // Wait for the new version to arrive before another mutation.
        detail = (await run(path)).data
        await expect
          .poll(async () =>
            page.evaluate(
              async ({ path }) => {
                const queries = (
                  await import('/src/app/store/store.ts')
                ).store.getState().agencyApi.queries
                return Object.values(queries).find(
                  (q) => q.originalArgs === path,
                )?.data?.project?.structureVersion
              },
              { path },
            ),
          )
          .toBe(detail.project.structureVersion)
      }
      result = responseFor('POST', '/structure/reorder')
      await page
        .getByRole('button', {
          name: 'Move Browser MULTI_SELECT up',
          exact: true,
        })
        .click()
      assert.equal((await result).status(), 422)
      phase = 'structure-two-tabs'
      const second = await context.newPage()
      observe(second)
      await second.goto(url)
      await waitState('authenticated', second)
      await expect(
        second.getByRole('heading', { name: 'Project content', exact: true }),
      ).toBeVisible()
      const text = created.find((i) => i.type === 'LONG_TEXT')
      await page
        .getByRole('button', { name: 'Edit Browser LONG_TEXT', exact: true })
        .click()
      await dialog
        .getByLabel('Label', { exact: true })
        .fill('My retained draft')
      detail = (await run(path, second)).data
      assert.equal(
        (
          await run(
            {
              url: path + '/sections/' + section.id,
              method: 'PATCH',
              body: {
                title: 'Concurrent section edit',
                expectedStructureVersion: detail.project.structureVersion,
              },
            },
            second,
          )
        ).status,
        200,
      )
      result = responseFor('PATCH', '/items/' + text.id + '/schema')
      await dialog
        .getByRole('button', { name: 'Save item', exact: true })
        .click()
      response = await result
      assert.equal(response.status(), 409)
      const conflict = await response.json()
      assert.equal(conflict.code, 'STRUCTURE_CONFLICT')
      assert.equal(conflict.currentVersion, detail.project.structureVersion + 1)
      await expect(dialog.getByLabel('Label', { exact: true })).toHaveValue(
        'My retained draft',
      )
      const refreshed = page.waitForResponse(
        (res) =>
          new URL(res.url()).pathname === '/api/v1/' + path &&
          res.request().method() === 'GET',
      )
      await dialog
        .getByRole('button', {
          name: 'Refresh latest structure; keep my input',
          exact: true,
        })
        .click()
      assert.equal((await refreshed).status(), 200)
      await expect(dialog.getByLabel('Label', { exact: true })).toHaveValue(
        'My retained draft',
      )
      await expect(
        page.getByRole('heading', {
          name: 'Concurrent section edit',
          exact: true,
        }),
      ).toBeVisible()
      result = responseFor('PATCH', '/items/' + text.id + '/schema')
      await dialog
        .getByRole('button', { name: 'Save item', exact: true })
        .click()
      assert.equal((await result).status(), 200)
      await expect(dialog).not.toBeVisible()
      await second.close()
      phase = 'structure-disable-reload'
      for (const label of ['Disable', 'Enable']) {
        result = responseFor('PATCH', '/sections/' + section.id)
        await page.getByRole('button', { name: label, exact: true }).click()
        assert.equal((await result).status(), 200)
        await expect(
          page.getByRole('button', {
            name: label === 'Disable' ? 'Enable' : 'Disable',
            exact: true,
          }),
        ).toBeVisible()
      }
      await page.reload()
      await waitState('authenticated')
      await page
        .getByRole('navigation', { name: 'Content sections' })
        .getByRole('button', { name: /Concurrent section edit/ })
        .click()
      await expect(
        page.getByRole('button', {
          name: 'Edit My retained draft',
          exact: true,
        }),
      ).toBeVisible()
      detail = (await run(path)).data
      const persisted = detail.structure.find((s) => s.id === section.id)
      assert.equal(persisted.items.length, 8)
      assert.equal(
        persisted.items.find((i) => i.type === 'REPEATER').validation.maxRows,
        7,
      )
      assert.equal(
        persisted.items.find((i) => i.id === text.id).instructions,
        'Preserved instructions',
      )
      assert.ok(!serviceWorkerResponse, 'MSW intercepted structure acceptance')
      break
    }
    case 'workspace-contacts-preview': {
      settings.previewProject = new URL(page.url()).pathname.split('/').at(-1)
      await page
        .getByRole('link', { name: 'Client access', exact: true })
        .click()
      await expect(
        page.getByRole('heading', { name: 'Customers', exact: true }),
      ).toBeVisible()
      await page
        .getByRole('button', {
          name: 'Edit Browser project customer',
          exact: true,
        })
        .click()
      await page
        .getByLabel('Business name', { exact: true })
        .fill('Updated browser customer')
      const renamed = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname.includes('/clients/') &&
          r.request().method() === 'PATCH',
      )
      await page
        .getByRole('button', { name: 'Save customer name', exact: true })
        .click()
      assert.equal((await renamed).status(), 200)
      await expect(
        page.getByText('Customer updated.', { exact: true }),
      ).toBeVisible()
      await page
        .getByRole('button', { name: 'Add project contact', exact: true })
        .click()
      const dialog = page.getByRole('dialog')
      await dialog
        .getByLabel('Contact name', { exact: true })
        .fill('Browser contact')
      await dialog
        .getByLabel('Contact email', { exact: true })
        .fill('browser-contact@example.test')
      const created = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname.endsWith('/contacts') &&
          r.request().method() === 'POST',
      )
      await dialog
        .getByRole('button', { name: 'Save contact', exact: true })
        .click()
      assert.equal((await created).status(), 201)
      await expect(
        page.getByText('browser-contact@example.test', { exact: true }),
      ).toBeVisible()
      const writes = []
      const observeWrites = (req) => {
        if (
          new URL(req.url()).pathname.startsWith('/api/') &&
          !['GET', 'HEAD', 'OPTIONS'].includes(req.method()) &&
          !new URL(req.url()).pathname.startsWith('/api/v1/auth/')
        )
          writes.push(req.method() + ' ' + new URL(req.url()).pathname)
      }
      page.on('request', observeWrites)
      try {
        await page
          .getByRole('link', { name: 'Client preview', exact: true })
          .click()
        await expect(page.getByText(/Read-only owner preview/)).toBeVisible()
        await expect(
          page
            .getByRole('heading', { name: 'Browser WEBSITE', exact: true })
            .first(),
        ).toBeVisible()
        await page
          .getByRole('button', { name: 'Concurrent section edit', exact: true })
          .click()
        await expect(
          page.getByRole('heading', { name: /Preserved instructions/ }),
        ).toHaveCount(0)
        await expect(
          page.getByText('Preserved instructions', { exact: true }),
        ).toBeVisible()
        assert.ok(
          (await page.locator('.preview-item').count()) === 7,
          'Preview did not filter the unanswered conditional item',
        )
        for (const control of await page
          .locator(
            '.preview-item input,.preview-item textarea,.preview-item select',
          )
          .all())
          await expect(control).toBeDisabled()
        await page.setViewportSize({ width: 390, height: 844 })
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
          'Mobile preview overflows',
        )
        await page.reload()
        await waitState('authenticated')
        await expect(page.getByText(/Read-only owner preview/)).toBeVisible()
        await expect(
          page.getByRole('button', {
            name: 'Concurrent section edit',
            exact: true,
          }),
        ).toBeVisible()
        assert.deepEqual(writes, [], 'Preview persisted application writes')
      } finally {
        page.off('request', observeWrites)
        await page.setViewportSize({ width: 1440, height: 1000 })
      }
      assert.ok(!serviceWorkerResponse, 'MSW intercepted T12 acceptance')
      break
    }
    case 'team-invite': {
      settings.teammateEmail = input.email
      await page.goto(origin + '/app/w/' + settings.workspace + '/team')
      await page
        .getByRole('button', { name: 'Invite member', exact: false })
        .click()
      const dialog = page.getByRole('dialog', { name: 'Invite a team member' })
      await dialog.getByLabel('Teammate email').fill(input.email)
      const sent = page.waitForResponse(
        (res) =>
          res.request().method() === 'POST' &&
          new URL(res.url()).pathname.endsWith('/members'),
      )
      await dialog.getByRole('button', { name: 'Send invitation' }).click()
      assert.equal((await sent).status(), 202)
      await expect(
        page.getByRole('cell', { name: input.email, exact: true }),
      ).toBeVisible()
      break
    }
    case 'team-register': {
      teammateContext = await browser.newContext({ ignoreHTTPSErrors: true })
      teammatePage = await teammateContext.newPage()
      observe(teammatePage)
      await teammatePage.goto(origin + '/sign-up')
      await teammatePage
        .getByLabel('Your name', { exact: true })
        .fill('Browser Teammate')
      await teammatePage
        .getByLabel('Email address', { exact: true })
        .fill(settings.teammateEmail)
      await teammatePage
        .getByLabel('Password', { exact: true })
        .fill(settings.password)
      await teammatePage
        .getByLabel('Confirm password', { exact: true })
        .fill(settings.password)
      const registered = teammatePage.waitForResponse(
        (res) => new URL(res.url()).pathname === '/api/v1/auth/register',
      )
      await teammatePage
        .getByRole('button', { name: 'Create account', exact: true })
        .click()
      assert.equal((await registered).status(), 202)
      break
    }
    case 'team-verify-accept': {
      await teammatePage.goto(
        origin + '/verify-email#token=' + input.verification,
      )
      const verified = teammatePage.waitForResponse(
        (res) => new URL(res.url()).pathname === '/api/v1/auth/verify-email',
      )
      await teammatePage
        .getByRole('button', { name: 'Verify email', exact: true })
        .click()
      assert.equal((await verified).status(), 200)
      const ownerEmail = settings.email
      try {
        settings.email = settings.teammateEmail
        await signin(teammatePage)
      } finally {
        settings.email = ownerEmail
      }
      await teammatePage.goto(origin + '/team-invite#token=' + input.invitation)
      const accepted = teammatePage.waitForResponse(
        (res) =>
          new URL(res.url()).pathname === '/api/v1/team-invitations/accept',
      )
      await teammatePage
        .getByRole('button', { name: 'Accept invitation', exact: true })
        .click()
      assert.equal((await accepted).status(), 200)
      settings.teammateMember = (
        await accepted.then((res) => res.json())
      ).membership.memberId
      await teammatePage
        .getByRole('link', { name: 'Open workspace', exact: true })
        .click()
      await expect(teammatePage).toHaveURL(
        new RegExp('/app/w/' + settings.workspace),
      )
      assert.ok(!new URL(teammatePage.url()).hash)
      assert.equal(
        (await run('me', teammatePage)).data.memberships[0].role,
        'MEMBER',
      )
      break
    }
    case 'team-assign-revoke': {
      const root =
        'workspaces/' +
        settings.workspace +
        '/projects/' +
        settings.previewProject
      await page.goto(
        origin +
          '/app/w/' +
          settings.workspace +
          '/projects/' +
          settings.previewProject +
          '?tab=assignments',
      )
      const panel = page
        .locator('section')
        .filter({
          has: page.getByRole('heading', { name: 'Project team', exact: true }),
        })
        .last()
      await panel
        .getByRole('textbox', { name: 'Search teammates to assign' })
        .fill('Browser Teammate')
      await expect(
        panel.getByText('Browser Teammate', { exact: true }),
      ).toBeVisible()
      await panel.getByRole('checkbox', { name: 'Review', exact: true }).check()
      const assigned = page.waitForResponse(
        (res) =>
          res.request().method() === 'PUT' &&
          new URL(res.url()).pathname.endsWith(
            '/assignments/' + settings.teammateMember,
          ),
      )
      await panel.getByRole('button', { name: 'Assign', exact: true }).click()
      assert.equal((await assigned).status(), 200)
      const visible = await run(root, teammatePage)
      assert.equal(visible.status, 200)
      assert.equal(visible.data.project.permissions.canReview, true)
      assert.equal(visible.data.project.permissions.canExport, false)
      assert.equal(visible.data.project.permissions.canEditStructure, false)
      assert.equal(
        (await run(root + '/client-preview', teammatePage)).status,
        404,
      )
      const allProjects = (
        await run('workspaces/' + settings.workspace + '/projects')
      ).data.data
      const otherProject = allProjects.find(
        (project) => project.id !== settings.previewProject,
      )
      assert.ok(otherProject)
      assert.equal(
        (
          await run(
            'workspaces/' + settings.workspace + '/projects/' + otherProject.id,
            teammatePage,
          )
        ).status,
        404,
      )
      const projects = (
        await run(
          'workspaces/' + settings.workspace + '/projects',
          teammatePage,
        )
      ).data.data
      assert.equal(projects.length, 1)
      assert.equal(projects[0].id, settings.previewProject)
      const removed = page.waitForResponse(
        (res) =>
          res.request().method() === 'DELETE' &&
          new URL(res.url()).pathname.endsWith(
            '/assignments/' + settings.teammateMember,
          ),
      )
      await panel.getByRole('button', { name: 'Remove', exact: true }).click()
      assert.equal((await removed).status(), 204)
      assert.equal((await run(root, teammatePage)).status, 404)
      await page.goto(origin + '/app/w/' + settings.workspace + '/team')
      await page
        .getByRole('row')
        .filter({ hasText: settings.teammateEmail })
        .getByRole('button', { name: 'Remove access', exact: true })
        .click()
      const revoked = page.waitForResponse(
        (res) =>
          res.request().method() === 'DELETE' &&
          new URL(res.url()).pathname.endsWith(
            '/members/' + settings.teammateMember,
          ),
      )
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Remove access', exact: true })
        .click()
      assert.equal((await revoked).status(), 204)
      assert.equal((await run('me', teammatePage)).data.memberships.length, 0)
      assert.equal(
        (await run('workspaces/' + settings.workspace, teammatePage)).status,
        404,
      )
      await teammatePage.reload()
      await waitState('authenticated', teammatePage)
      await expect(
        teammatePage.getByLabel('Workspace', { exact: true }),
      ).toHaveCount(0)
      assert.ok(!serviceWorkerResponse, 'MSW intercepted T13 lifecycle')
      await teammateContext.close()
      break
    }
    case 'client-owner-invite': {
      await page.goto(
        origin +
          '/app/w/' +
          settings.workspace +
          '/projects/' +
          settings.previewProject +
          '?tab=access',
      )
      const row = page
        .getByRole('row')
        .filter({ hasText: 'browser-contact@example.test' })
      const sent = page.waitForResponse(
        (res) =>
          res.request().method() === 'POST' &&
          new URL(res.url()).pathname.endsWith('/invite'),
      )
      await row
        .getByRole('button', { name: 'Send / resend invite', exact: true })
        .click()
      assert.equal((await sent).status(), 202)
      await expect(
        page.getByText('Invitation sent.', { exact: true }),
      ).toBeVisible()
      break
    }
    case 'client-open': {
      if (!clientContext) {
        clientContext = await browser.newContext({
          ignoreHTTPSErrors: true,
          viewport: { width: 1440, height: 1000 },
        })
        clientPage = await clientContext.newPage()
        observe(clientPage)
        clientPage.on('request', (request) => {
          if (
            new URL(request.url()).pathname.startsWith('/api/v1/client') &&
            request.headers().authorization
          )
            clientBearerAttached = true
        })
      }
      await clientPage.goto(
        origin +
          '/client/access?projectId=' +
          settings.previewProject +
          '#token=' +
          input.token,
      )
      await waitState('anonymous', clientPage)
      await expect(
        clientPage.getByRole('button', {
          name: 'Open my project',
          exact: true,
        }),
      ).toBeVisible()
      await expect.poll(() => new URL(clientPage.url()).hash === '').toBe(true)
      phase = 'client-open:exchange'
      const exchanged = clientPage.waitForResponse(
        (res) =>
          new URL(res.url()).pathname === '/api/v1/client-access/exchange',
      )
      await clientPage
        .getByRole('button', { name: 'Open my project', exact: true })
        .click()
      assert.equal((await exchanged).status(), 200)
      const root = 'client/projects/' + settings.previewProject + '/checklist'
      const data = (await run(root, clientPage, false)).data
      await expect(
        clientPage.getByRole('heading', {
          name: data.project.title,
          exact: true,
        }),
      ).toBeVisible()
      await expect(
        clientPage.getByRole('navigation', { name: 'Requested sections' }),
      ).toBeVisible()
      await expect(
        clientPage.getByRole('button', {
          name: /Submit for review|Upload files/,
        }),
      ).toHaveCount(0)
      assert.equal(data.capabilities.canRespond, true)
      phase = 'client-open:cookie'
      const cookies = await clientContext.cookies(
        origin +
          '/api/v1/client/projects/' +
          settings.previewProject +
          '/checklist',
      )
      const cookie = cookies.find((c) => c.name === '__Secure-collector_client')
      assert.ok(
        cookie?.secure &&
          cookie.httpOnly &&
          cookie.sameSite === 'Lax' &&
          cookie.path === '/api/v1',
      )
      assert.ok(
        await clientPage.evaluate(
          () => !document.cookie.includes('collector_client'),
        ),
      )
      phase = 'client-open:scope'
      const other = (
        await run('workspaces/' + settings.workspace + '/projects')
      ).data.data.find((p) => p.id !== settings.previewProject)
      assert.equal(
        (
          await run(
            'client/projects/' + other.id + '/checklist',
            clientPage,
            false,
          )
        ).status,
        404,
      )
      assert.equal(
        (await run('workspaces/' + settings.workspace, clientPage, false))
          .status,
        401,
      )
      phase = 'client-open:layout'
      for (const width of [1440, 360]) {
        await clientPage.setViewportSize({ width, height: 1000 })
        const navigation = clientPage.getByRole('navigation', {
          name: 'Requested sections',
        })
        await navigation.getByRole('button').last().click()
        await clientPage.keyboard.press('Tab')
        assert.ok(
          await clientPage.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          'Client portal horizontal overflow',
        )
        const directory = new URL(
          '../../../.artifacts/real-auth/t14/',
          import.meta.url,
        )
        mkdirSync(directory, { recursive: true })
        await clientPage.screenshot({
          path: fileURLToPath(new URL(`portal-${width}.png`, directory)),
          fullPage: true,
        })
      }
      await clientPage.reload()
      await waitState('anonymous', clientPage)
      await expect(
        clientPage.getByRole('heading', {
          name: data.project.title,
          exact: true,
        }),
      ).toBeVisible()
      assert.ok(
        !clientBearerAttached && !serviceWorkerResponse,
        'Client/agency transport isolation failed',
      )
      assert.equal((await run('me')).status, 200)
      break
    }
    case 'client-analytics': {
      const root = 'client/projects/' + settings.previewProject
      const observed = []
      const observeEvent = (request) => {
        if (new URL(request.url()).pathname.endsWith('/events'))
          observed.push(request.postDataJSON())
      }
      clientPage.on('request', observeEvent)
      const opened = clientPage.waitForResponse(
        (res) =>
          new URL(res.url()).pathname.endsWith('/events') &&
          res.request().postDataJSON()?.events?.[0]?.type === 'project_opened',
      )
      await clientPage.reload()
      assert.equal((await opened).status(), 202)
      const data = (await run(root + '/checklist', clientPage, false)).data
      const section = data.sections.find((s) =>
        s.items.some(
          (i) => i.canEdit && ['SHORT_TEXT', 'LONG_TEXT'].includes(i.type),
        ),
      )
      assert.ok(section, 'Expected an editable text question')
      await clientPage
        .getByRole('navigation', { name: 'Requested sections' })
        .getByRole('button', { name: section.title, exact: true })
        .click()
      const item = section.items.find(
        (i) => i.canEdit && ['SHORT_TEXT', 'LONG_TEXT'].includes(i.type),
      )
      const started = clientPage.waitForResponse(
        (res) =>
          new URL(res.url()).pathname.endsWith('/events') &&
          res.request().postDataJSON()?.events?.[0]?.type === 'item_started',
      )
      await clientPage
        .locator('#item-' + item.id)
        .getByRole('textbox')
        .first()
        .focus()
      assert.equal((await started).status(), 202)
      for (const batch of observed) {
        assert.deepEqual(Object.keys(batch), ['events'])
        for (const event of batch.events) {
          assert.ok(['project_opened', 'item_started'].includes(event.type))
          assert.ok(
            Object.keys(event).every((key) =>
              ['clientEventId', 'type', 'itemId'].includes(key),
            ),
          )
        }
      }
      assert.equal(new URL(clientPage.url()).hash, '')
      assert.ok(!clientBearerAttached && !serviceWorkerResponse)
      const activity = await run(
        'workspaces/' +
          settings.workspace +
          '/projects/' +
          settings.previewProject +
          '/activity',
      )
      assert.equal(activity.status, 200)
      assert.ok(activity.data.data.length > 0)
      for (const event of activity.data.data)
        assert.deepEqual(
          Object.keys(event).sort(),
          [
            'id',
            'action',
            'resourceKind',
            'resourceId',
            'actorDisplayName',
            'occurredAt',
          ].sort(),
        )
      clientPage.off('request', observeEvent)
      break
    }
    case 'friction-analytics': {
      const root =
        'workspaces/' +
        settings.workspace +
        '/projects/' +
        settings.previewProject
      const result = await run(root + '/analytics')
      assert.equal(result.status, 200)
      const metric = result.data.metrics.friction.find(
        (m) => m.itemKey === input.itemKey,
      )
      assert.equal(metric.eligibleStarts, 11)
      assert.equal(metric.completedObservationWindows, 9)
      assert.equal(metric.startsWithoutSubmission, 9)
      assert.equal(metric.insufficientData, true)
      assert.equal(metric.rate, null)
      await page.goto(
        origin +
          '/app/w/' +
          settings.workspace +
          '/projects/' +
          settings.previewProject +
          '?tab=analytics',
      )
      await page
        .getByRole('button', { name: 'Item friction', exact: true })
        .click()
      const row = page.getByRole('row').filter({
        has: page.getByRole('rowheader', {
          name: input.itemKey,
          exact: true,
        }),
      })
      await expect(
        row.getByText('Insufficient data', { exact: true }),
      ).toBeVisible()
      await expect(
        row.getByText('2 still observing', { exact: true }),
      ).toBeVisible()
      await expect(row.getByRole('cell').nth(3)).not.toContainText('%')
      const templates = await run(
        'workspaces/' + settings.workspace + '/analytics/templates',
      )
      assert.equal(templates.status, 200)
      assert.ok(
        templates.data.data.some(
          (m) =>
            m.itemKey === input.itemKey &&
            m.templateVersionId === metric.templateVersionId &&
            m.projectType === 'WEBSITE',
        ),
      )
      await page.goto(origin + '/app/w/' + settings.workspace + '/insights')
      await expect(
        page.getByRole('heading', {
          name: 'Template friction comparisons',
          exact: true,
        }),
      ).toBeVisible()
      await expect(
        page.getByText('Template version ' + metric.templateVersionId, {
          exact: true,
        }),
      ).toBeVisible()
      break
    }
    case 'visibility-create': {
      await page.goto(
        origin + '/app/w/' + settings.workspace + '/settings?view=digest',
      )
      await page
        .getByRole('switch', { name: 'Receive my daily digest', exact: true })
        .check()
      const saved = page.waitForResponse(
        (res) =>
          new URL(res.url()).pathname.endsWith('/digest-preferences') &&
          res.request().method() === 'PUT',
      )
      await page
        .getByRole('button', { name: 'Save digest settings', exact: true })
        .click()
      assert.equal((await saved).status(), 200)
      await expect(
        page.getByText('Daily digest preference saved.', { exact: true }),
      ).toBeVisible()
      await page.goto(
        origin +
          '/app/w/' +
          settings.workspace +
          '/projects/' +
          settings.previewProject +
          '?tab=analytics',
      )
      await page
        .getByRole('button', { name: 'Counts-only status share', exact: true })
        .click()
      await page
        .getByLabel('Public alias', { exact: true })
        .fill('Project Evergreen')
      await page
        .getByLabel('Allowed embed origins (one HTTPS origin per line)')
        .fill(origin)
      const issued = page.waitForResponse(
        (res) =>
          new URL(res.url()).pathname.endsWith('/status-shares') &&
          res.request().method() === 'POST',
      )
      await page
        .getByRole('button', { name: 'Create counts-only share', exact: true })
        .click()
      const result = await issued
      assert.equal(result.status(), 201)
      settings.statusShare = await result.json()
      assert.ok(settings.statusShare.url.includes('#token='))
      await expect(
        page.getByRole('link', {
          name: 'Open counts-only status link',
          exact: true,
        }),
      ).toBeVisible()
      break
    }
    case 'visibility-public': {
      const share = settings.statusShare
      const publicContext = await browser.newContext({
        ignoreHTTPSErrors: true,
      })
      const publicPage = await publicContext.newPage()
      observe(publicPage)
      let attached = false
      publicPage.on('request', (request) => {
        if (
          new URL(request.url()).pathname.startsWith(
            '/api/v1/status-shares/',
          ) &&
          request.headers().authorization
        )
          attached = true
      })
      try {
        phase = 'visibility-public:open'
        await publicPage.goto(new URL(share.url, origin).href)
        await expect.poll(() => new URL(publicPage.url()).hash).toBe('')
        phase = 'visibility-public:counts'
        const countsResponse = publicPage.waitForResponse((res) =>
          new URL(res.url()).pathname.endsWith('/counts'),
        )
        await publicPage
          .getByRole('button', { name: 'View shared status', exact: true })
          .click()
        const counts = await countsResponse
        assert.equal(counts.status(), 200)
        const result = await counts.json()
        assert.deepEqual(
          Object.keys(result).sort(),
          [
            'alias',
            'approved',
            'submitted',
            'requiredTotal',
            'updatedAt',
          ].sort(),
        )
        await expect(
          publicPage.getByRole('heading', {
            name: 'Project Evergreen',
            exact: true,
          }),
        ).toBeVisible()
        assert.ok(!attached)
        assert.equal(
          await publicPage.evaluate(
            (token) =>
              JSON.stringify([
                Object.entries(localStorage),
                Object.entries(sessionStorage),
              ]).includes(token),
            share.fragmentToken,
          ),
          false,
        )
        phase = 'visibility-public:approved-embed'
        const embed =
          origin +
          '/api/v1/status-shares/' +
          share.shareId +
          '/embed#token=' +
          share.fragmentToken
        const headers = await publicPage.request.get(embed.split('#')[0])
        assert.ok(
          (headers.headers()['content-security-policy'] || '').includes(
            'frame-ancestors ' + origin,
          ),
        )
        assert.equal(headers.headers()['x-frame-options'], undefined)
        await publicPage.evaluate((src) => {
          const frame = document.createElement('iframe')
          frame.id = 'approved-status'
          frame.src = src
          document.body.append(frame)
        }, embed)
        const frame = publicPage.frameLocator('#approved-status')
        await frame
          .getByRole('button', { name: 'View shared status', exact: true })
          .click()
        await expect(frame.getByRole('status')).toContainText(
          'Project Evergreen',
        )
        phase = 'visibility-public:denied-embed'
        const other = new URL(origin)
        other.hostname =
          other.hostname === 'localhost' ? '127.0.0.1' : 'localhost'
        const deniedPage = await publicContext.newPage()
        await deniedPage.goto(other.href)
        const denied = deniedPage.waitForEvent('console', {
          predicate: (message) => message.text().includes('frame-ancestors'),
        })
        await deniedPage.evaluate((src) => {
          const f = document.createElement('iframe')
          f.id = 'denied-status'
          f.src = src
          document.body.append(f)
        }, embed)
        await denied
        await expect(
          deniedPage
            .frameLocator('#denied-status')
            .getByRole('button', { name: 'View shared status', exact: true }),
        ).toHaveCount(0)
        await deniedPage.close()
        const privateHeaders = await publicPage.request.get(
          origin +
            '/app/w/' +
            settings.workspace +
            '/projects/' +
            settings.previewProject,
        )
        assert.equal(privateHeaders.headers()['x-frame-options'], 'DENY')
        phase = 'visibility-public:revoke'
        assert.equal((await run('me')).status, 200)
        const revoked = page.waitForResponse(
          (res) =>
            new URL(res.url()).pathname.endsWith(
              '/status-shares/' + share.shareId,
            ) && res.request().method() === 'DELETE',
        )
        await page
          .getByRole('button', { name: 'Revoke share', exact: true })
          .click()
        assert.equal((await revoked).status(), 204)
        await publicPage
          .getByRole('button', { name: 'Refresh counts', exact: true })
          .click()
        await expect(publicPage.getByRole('alert')).toContainText(
          'unavailable, revoked or expired',
        )
        await expect(
          publicPage.getByRole('heading', {
            name: 'Project Evergreen',
            exact: true,
          }),
        ).toHaveCount(0)
      } finally {
        await publicContext.close()
      }
      break
    }
    case 'client-draft-collection': {
      const root = 'client/projects/' + settings.previewProject
      phase = 'client-drafts:setup'
      const ownerRoot =
        'workspaces/' +
        settings.workspace +
        '/projects/' +
        settings.previewProject
      let structure = (await run(ownerRoot)).data.project.structureVersion
      const created = await run({
        url: ownerRoot + '/sections',
        method: 'POST',
        body: {
          title: 'Browser draft types',
          expectedStructureVersion: structure,
        },
      })
      assert.equal(created.status, 201)
      const types = [
        ['SINGLE_SELECT', { options: [{ key: 'yes', label: 'Yes' }] }],
        [
          'MULTI_SELECT',
          { options: [{ key: 'yes', label: 'Yes' }], maxOptions: 1 },
        ],
        ['URL', { allowedSchemes: ['https'] }],
        [
          'REPEATER',
          {
            maxRows: 3,
            columns: [
              {
                key: 'name',
                label: 'Name',
                type: 'SHORT_TEXT',
                required: true,
              },
              { key: 'count', label: 'Count', type: 'NUMBER', required: false },
            ],
          },
        ],
      ]
      for (const [type, validation] of types) {
        structure = (await run(ownerRoot)).data.project.structureVersion
        const result = await run({
          url: ownerRoot + '/sections/' + created.data.section.id + '/items',
          method: 'POST',
          body: {
            definition: {
              key: 'browser.draft.' + type.toLowerCase(),
              label: 'Browser ' + type,
              type,
              instructions: 'Synthetic collection field',
              example: '',
              required: true,
              enabled: true,
              validation,
            },
            expectedStructureVersion: structure,
          },
        })
        assert.equal(result.status, 201)
      }
      await clientPage.reload()
      let checklist = (await run(root + '/checklist', clientPage, false)).data
      const section = checklist.sections.find((s) =>
        s.items.some((i) => i.type === 'SHORT_TEXT' && i.canEdit),
      )
      assert.ok(section, 'Editable text fixture required')
      const item = section.items.find(
        (i) => i.type === 'SHORT_TEXT' && i.canEdit,
      )
      const navigation = clientPage.getByRole('navigation', {
        name: 'Requested sections',
      })
      await navigation
        .getByRole('button', { name: section.title, exact: true })
        .click()
      const field = clientPage.locator('article').filter({
        has: clientPage.getByRole('heading', {
          name: item.label,
          exact: true,
        }),
      })
      const input = field.getByLabel('Your response')
      phase = 'client-drafts:first-save'
      await input.fill('Persisted browser draft')
      await expect(field.getByRole('status')).toContainText('Saved at')
      let saved = (await run(root + '/items/' + item.id, clientPage, false))
        .data.answer
      assert.equal(saved.value.text, 'Persisted browser draft')
      const other = checklist.sections.find((s) => s.id !== section.id)
      if (other)
        await navigation
          .getByRole('button', { name: other.title, exact: true })
          .click()
      await navigation
        .getByRole('button', { name: section.title, exact: true })
        .click()
      await expect(input).toHaveValue('Persisted browser draft')
      await clientPage.reload()
      await clientPage
        .getByRole('navigation', { name: 'Requested sections' })
        .getByRole('button', { name: section.title, exact: true })
        .click()
      await expect(input).toHaveValue('Persisted browser draft')
      phase = 'client-drafts:offline'
      await clientContext.setOffline(true)
      await input.fill('Retained offline draft')
      await field
        .getByRole('button', { name: 'Save draft', exact: true })
        .click()
      await expect(field.getByRole('status')).toContainText(
        /Offline|Save error/,
      )
      await expect(input).toHaveValue('Retained offline draft')
      await clientContext.setOffline(false)
      phase = 'client-drafts:offline-retry'
      // Reconnection can put the writer in Saving before either the retry action
      // or terminal saved status is present. Observe that legitimate intermediate
      // state atomically; the saved status and exact persisted text remain required.
      await expect
        .poll(() =>
          field.evaluate((node) => {
            const retry = [...node.querySelectorAll('button')].find(
              (button) => button.textContent.trim() === 'Retry save',
            )
            if (retry) {
              retry.click()
              return true
            }
            const status =
              node.querySelector('[role="status"]')?.textContent || ''
            return status.includes('Saving') || status.includes('Saved at')
          }),
        )
        .toBe(true)
      await expect(field.getByRole('status')).toContainText('Saved at')
      saved = (await run(root + '/items/' + item.id, clientPage, false)).data
        .answer
      assert.equal(saved.value.text, 'Retained offline draft')
      // A second browser tab/client writer advances the persisted version.
      phase = 'client-drafts:external-write'
      const external = await run(
        {
          url: root + '/items/' + item.id + '/answer',
          method: 'PUT',
          body: {
            value: { text: 'Other tab draft' },
            expectedVersion: saved.version,
            expectedStructureVersion: checklist.project.structureVersion,
            saveOperationId: crypto.randomUUID(),
          },
        },
        clientPage,
        false,
      )
      assert.equal(external.status, 200)
      phase = 'client-drafts:conflict'
      await input.fill('Keep my conflicting draft')
      await field
        .getByRole('button', { name: 'Save draft', exact: true })
        .click()
      await expect(field.getByRole('status')).toContainText('Conflict')
      await expect(input).toHaveValue('Keep my conflicting draft')
      await field.getByRole('button', { name: 'Compare saved answer' }).click()
      await expect(
        field.getByText('Other tab draft', { exact: false }),
      ).toBeVisible()
      await field
        .getByRole('button', { name: 'Save my answer against this version' })
        .click()
      await expect(field.getByRole('status')).toContainText('Saved at')
      assert.equal(
        (await run(root + '/items/' + item.id, clientPage, false)).data.answer
          .value.text,
        'Keep my conflicting draft',
      )
      await clientPage
        .getByRole('navigation', { name: 'Requested sections' })
        .getByRole('button', { name: 'Browser draft types', exact: true })
        .click()
      for (const [type] of types) {
        const panel = clientPage.locator('article').filter({
          has: clientPage.getByRole('heading', {
            name: 'Browser ' + type,
            exact: true,
          }),
        })
        if (type === 'SINGLE_SELECT')
          await panel.getByLabel('Choose one').selectOption('yes')
        if (type === 'MULTI_SELECT')
          await panel.getByLabel('Yes', { exact: true }).check()
        if (type === 'URL')
          await panel
            .getByLabel('Your response')
            .fill('https://example.test/client')
        if (type === 'REPEATER') {
          await panel.getByRole('button', { name: /Add entry/ }).click()
          await panel.getByLabel('Name').fill('Synthetic row')
          await panel.getByLabel('Count').fill('7')
        }
        await panel
          .getByRole('button', { name: 'Save draft', exact: true })
          .click()
        await expect(panel.getByRole('status')).toContainText('Saved at')
      }
      await clientPage
        .getByRole('navigation', { name: 'Requested sections' })
        .getByRole('button', { name: section.title, exact: true })
        .click()
      const agencyRoot =
        'workspaces/' +
        settings.workspace +
        '/projects/' +
        settings.previewProject
      const definition = { ...item }
      for (const key of [
        'id',
        'version',
        'state',
        'visible',
        'canEdit',
        'answer',
        'assets',
        'comments',
      ])
        delete definition[key]
      definition.validation = { ...definition.validation, maxLength: 1 }
      const unsafe = await run({
        url: agencyRoot + '/items/' + item.id + '/schema',
        method: 'PATCH',
        body: {
          definition,
          expectedStructureVersion: checklist.project.structureVersion,
          reopenAffected: false,
        },
      })
      assert.equal(unsafe.status, 422)
      assert.equal(unsafe.code, 'DRAFT_REVALIDATION_FAILED')
      const directory = new URL(
        '../../../.artifacts/real-auth/t15/',
        import.meta.url,
      )
      mkdirSync(directory, { recursive: true })
      await clientPage.setViewportSize({ width: 360, height: 950 })
      assert.ok(
        await clientPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      await clientPage.screenshot({
        path: fileURLToPath(new URL('draft-360.png', directory)),
        fullPage: true,
      })
      settings.draftItem = item.id
      settings.draftVersion = (
        await run(root + '/items/' + item.id, clientPage, false)
      ).data.answer.version
      break
    }
    case 'email-reminders': {
      phase = 'email-reminders:preferences'
      await clientPage
        .getByRole('button', { name: 'Reminder preferences', exact: true })
        .click()
      await expect(
        clientPage.getByRole('heading', {
          name: 'Reminder preferences',
          exact: true,
        }),
      ).toBeVisible()
      await clientPage.getByLabel('Your timezone').fill('Asia/Kabul')
      const saved = clientPage.waitForResponse(
        (res) =>
          res.request().method() === 'PUT' &&
          new URL(res.url()).pathname.endsWith('/notification-preferences'),
      )
      await clientPage
        .getByRole('button', { name: 'Save preferences', exact: true })
        .click()
      assert.equal((await saved).status(), 200)
      await expect(
        clientPage.getByText('Preferences saved.', { exact: true }),
      ).toBeVisible()
      await expect(
        clientPage.getByRole('button', { name: 'Send verification code' }),
      ).toHaveCount(0)
      phase = 'email-reminders:owner'
      await page.goto(
        origin +
          '/app/w/' +
          settings.workspace +
          '/projects/' +
          settings.previewProject +
          '?tab=reminders',
      )
      await expect(
        page.getByRole('button', { name: 'Save policy', exact: true }),
      ).toBeVisible()
      const policySaved = page.waitForResponse(
        (res) =>
          res.request().method() === 'PUT' &&
          new URL(res.url()).pathname.endsWith('/reminder-policy'),
      )
      await page
        .getByRole('button', { name: 'Save policy', exact: true })
        .click()
      assert.equal((await policySaved).status(), 200)
      await page
        .getByRole('button', { name: 'Email & SMS preview', exact: true })
        .click()
      await page
        .getByLabel('Contact', { exact: true })
        .selectOption({ index: 1 })
      await page.getByRole('button', { name: 'Preview', exact: true }).click()
      await expect(
        page.getByRole('button', { name: 'Send now', exact: true }),
      ).toBeEnabled()
      const queued = page.waitForResponse(
        (res) =>
          res.request().method() === 'POST' &&
          new URL(res.url()).pathname.endsWith('/reminders/send'),
      )
      await page.getByRole('button', { name: 'Send now', exact: true }).click()
      assert.equal((await queued).status(), 202)
      await expect(page.getByText(/Reminder queued/)).toBeVisible()
      break
    }
    case 'sms-request': {
      phase = 'sms-request:preferences'
      await clientPage.reload()
      await expect(
        clientPage.getByRole('button', {
          name: 'Reminder preferences',
          exact: true,
        }),
      ).toBeVisible()
      await clientPage
        .getByRole('button', { name: 'Reminder preferences', exact: true })
        .click()
      await expect(
        clientPage.getByRole('heading', {
          name: 'Optional US SMS reminders',
          exact: true,
        }),
      ).toBeVisible()
      await expect(clientPage.getByText(/SMS segments:/)).toBeVisible()
      await clientPage.getByLabel('US mobile number').fill('+12025550123')
      await clientPage.getByLabel(/I agree to/).check()
      const requested = clientPage.waitForResponse(
        (res) =>
          res.request().method() === 'POST' &&
          new URL(res.url()).pathname.endsWith('/sms/verification'),
      )
      await clientPage
        .getByRole('button', { name: 'Send verification code', exact: true })
        .click()
      assert.equal((await requested).status(), 202)
      await expect(
        clientPage.getByLabel('Verification code', { exact: true }),
      ).toBeVisible()
      await expect(
        clientPage.getByText(/Synthetic verification code/),
      ).toHaveCount(0)
      break
    }
    case 'sms-confirm-withdraw': {
      await clientPage
        .getByLabel('Verification code', { exact: true })
        .fill(input.code)
      const confirmed = clientPage.waitForResponse(
        (res) =>
          res.request().method() === 'POST' &&
          new URL(res.url()).pathname.endsWith('/sms/verification/confirm'),
      )
      await clientPage
        .getByRole('button', { name: 'Verify', exact: true })
        .click()
      assert.equal((await confirmed).status(), 200)
      await expect(
        clientPage.getByText(
          'Your phone is verified and SMS reminders are enabled.',
          { exact: true },
        ),
      ).toBeVisible()
      const withdrawn = clientPage.waitForResponse(
        (res) =>
          res.request().method() === 'DELETE' &&
          new URL(res.url()).pathname.endsWith('/sms/consent'),
      )
      await clientPage
        .getByRole('button', { name: 'Opt out of SMS', exact: true })
        .click()
      assert.equal((await withdrawn).status(), 204)
      await expect(
        clientPage.getByText('SMS reminders stopped.', { exact: true }),
      ).toBeVisible()
      assert.equal(
        (
          await run(
            'client/projects/' +
              settings.previewProject +
              '/notification-preferences',
            clientPage,
            false,
          )
        ).data.emailEnabled,
        true,
      )
      break
    }
    case 'email-reminder-history': {
      await page
        .getByRole('button', { name: 'Delivery activity', exact: true })
        .click()
      await expect(
        page.getByRole('cell', { name: 'ACCEPTED', exact: true }),
      ).toBeVisible()
      await expect(
        page.getByRole('cell', { name: 'DELIVERED', exact: true }),
      ).toHaveCount(0)
      break
    }
    case 'client-attachments': {
      phase = 'client-attachments:setup'
      const root = 'client/projects/' + settings.previewProject
      const agency =
        'workspaces/' +
        settings.workspace +
        '/projects/' +
        settings.previewProject
      let current = (await run(agency)).data
      const sectionResponse = await run({
        url: agency + '/sections',
        method: 'POST',
        body: {
          title: 'Browser attachments',
          expectedStructureVersion: current.project.structureVersion,
        },
      })
      assert.equal(sectionResponse.status, 201)
      current = (await run(agency)).data
      const created = await run({
        url: agency + '/sections/' + sectionResponse.data.section.id + '/items',
        method: 'POST',
        body: {
          expectedStructureVersion: current.project.structureVersion,
          definition: {
            key: 'browser.attachments',
            label: 'Private documents',
            type: 'FILE',
            instructions: 'Synthetic files only',
            example: '',
            enabled: true,
            required: false,
            validation: { maxFiles: 2, allowedExtensions: ['txt'] },
          },
        },
      })
      assert.equal(created.status, 201)
      const item = created.data.item.id
      settings.attachmentItem = item
      await clientPage.reload()
      await clientPage
        .getByRole('navigation', { name: 'Requested sections' })
        .getByRole('button', { name: 'Browser attachments', exact: true })
        .click()
      const field = clientPage.locator('article').filter({
        has: clientPage.getByRole('heading', {
          name: 'Private documents',
          exact: true,
        }),
      })
      phase = 'client-attachments:upload'
      await field.getByLabel('Choose project files').setInputFiles({
        name: 'browser-private.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Synthetic private browser document'),
      })
      await expect(
        field.getByRole('progressbar', {
          name: 'browser-private.txt upload progress',
        }),
      ).toBeVisible()
      await expect(field.getByText('READY', { exact: true })).toBeVisible({
        timeout: 30000,
      })
      await expect(
        field.getByRole('status').filter({ hasText: /^Saved/ }),
      ).toBeVisible()
      let persisted = (await run(root + '/items/' + item, clientPage, false))
        .data
      assert.equal(persisted.item.assets.length, 1)
      const asset = persisted.item.assets[0]
      assert.equal(persisted.answer.value.assetIds[0], asset.id)
      phase = 'client-attachments:reload'
      await clientPage.reload()
      await clientPage
        .getByRole('navigation', { name: 'Requested sections' })
        .getByRole('button', { name: 'Browser attachments', exact: true })
        .click()
      await expect(
        field.getByText('browser-private.txt', { exact: true }).first(),
      ).toBeVisible()
      phase = 'client-attachments:client-download'
      const clientDownload = clientPage.waitForEvent('download')
      await field.getByRole('button', { name: 'Download', exact: true }).click()
      const clientFile = await clientDownload
      assert.equal(clientFile.suggestedFilename(), 'browser-private.txt')
      assert.equal(
        readFileSync(await clientFile.path(), 'utf8'),
        'Synthetic private browser document',
      )
      await clientFile.delete()
      phase = 'client-attachments:agency-download'
      const signed = await run({
        url: agency + '/assets/' + asset.id + '/download',
        method: 'POST',
        body: { variant: 'ORIGINAL' },
      })
      assert.equal(signed.status, 200)
      const deniedContext = await browser.newContext({
        ignoreHTTPSErrors: true,
      })
      const deniedPage = await deniedContext.newPage()
      observe(deniedPage)
      const ownerEmail = settings.email
      try {
        settings.email = settings.teammateEmail
        await signin(deniedPage)
        phase = 'client-attachments:denied-agency'
        const denied = await run(
          {
            url: agency + '/assets/' + asset.id + '/download',
            method: 'POST',
            body: { variant: 'ORIGINAL' },
          },
          deniedPage,
        )
        assert.equal(denied.status, 404)
      } finally {
        settings.email = ownerEmail
        await deniedContext.close()
      }
      phase = 'client-attachments:agency-download'

      const downloaded = await context.request.get(signed.data.url)
      assert.equal(downloaded.status(), 200)
      assert.equal(
        await downloaded.text(),
        'Synthetic private browser document',
      )
      const unsigned = new URL(signed.data.url)
      unsigned.search = ''
      assert.ok(
        [401, 403].includes(
          (await context.request.get(unsigned.toString())).status(),
        ),
      )
      phase = 'client-attachments:remove'
      phase = 'client-attachments:unselect'
      await field
        .getByRole('checkbox', { name: /browser-private\.txt/ })
        .uncheck()
      await expect(
        field.getByRole('status').filter({ hasText: /^Saved/ }),
      ).toBeVisible()
      await field.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(
        field.getByText('browser-private.txt', { exact: true }),
      ).toHaveCount(0)
      persisted = (await run(root + '/items/' + item, clientPage, false)).data
      assert.deepEqual(persisted.answer.value.assetIds, [])
      phase = 'client-attachments:validation'
      await field.getByLabel('Choose project files').setInputFiles({
        name: 'empty.txt',
        mimeType: 'text/plain',
        buffer: Buffer.alloc(0),
      })
      await expect(field.getByText(/is empty/)).toBeVisible()
      phase = 'client-attachments:rejection'
      await field.getByLabel('Choose project files').setInputFiles({
        name: 'invalid.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from([255, 0]),
      })
      await expect(
        field.getByText('INVALID_FILE', { exact: true }),
      ).toBeVisible({ timeout: 30000 })
      await expect(field.getByText('REJECTED', { exact: true })).toBeVisible()
      persisted = (await run(root + '/items/' + item, clientPage, false)).data
      assert.deepEqual(persisted.answer.value.assetIds, [])

      phase = 'client-attachments:submission'
      await field.getByLabel('Choose project files').setInputFiles({
        name: 'submitted-history.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Immutable submitted browser file'),
      })
      await expect(field.getByText('READY', { exact: true })).toBeVisible({
        timeout: 30000,
      })
      await expect(
        field.getByRole('status').filter({ hasText: /^Saved/ }),
      ).toBeVisible()
      const beforeSubmit = (
        await run(root + '/items/' + item, clientPage, false)
      ).data
      const retained = beforeSubmit.item.assets.find(
        (a) => a.originalName === 'submitted-history.txt',
      )
      assert.ok(retained)
      await field
        .getByRole('button', { name: 'Review and submit', exact: true })
        .click()
      const submittedResponse = clientPage.waitForResponse(
        (res) =>
          res.request().method() === 'POST' &&
          new URL(res.url()).pathname.endsWith('/items/' + item + '/submit'),
      )
      await field
        .getByRole('button', { name: 'Submit for review', exact: true })
        .click()
      const submitted = await submittedResponse
      assert.equal(submitted.status(), 201)
      const revision = await submitted.json()
      assert.equal(revision.revisionNo, 1)
      await expect(
        field.getByRole('button', { name: 'Withdraw to edit' }),
      ).toBeVisible()
      assert.equal(
        (
          await run(
            {
              url: root + '/items/' + item + '/answer',
              method: 'PUT',
              body: {
                value: { assetIds: [] },
                expectedVersion: beforeSubmit.answer.version,
                expectedStructureVersion: current.project.structureVersion,
                saveOperationId: crypto.randomUUID(),
              },
            },
            clientPage,
            false,
          )
        ).status,
        409,
      )
      await clientPage.reload()
      await clientPage
        .getByRole('navigation', { name: 'Requested sections' })
        .getByRole('button', { name: 'Browser attachments', exact: true })
        .click()
      await expect(
        field.getByRole('button', { name: 'Withdraw to edit' }),
      ).toBeVisible()
      const snapshot = (
        await run(
          agency + '/items/' + item + '/revisions/' + revision.revisionId,
        )
      ).data.revision
      assert.deepEqual(snapshot.valueSnapshot.assetIds, [retained.id])
      assert.equal(snapshot.assets[0].id, retained.id)
      await page.goto(
        origin +
          '/app/w/' +
          settings.workspace +
          '/projects/' +
          settings.previewProject +
          '?tab=submissions',
      )
      await page
        .getByRole('region', { name: 'Submitted versions' })
        .getByRole('combobox', { name: 'Question' })
        .selectOption(item)
      phase = 'client-attachments:agency-history'
      await page.getByRole('button', { name: /Revision 1/ }).click()
      await expect(
        page.getByRole('heading', { name: 'Private documents · Revision 1' }),
      ).toBeVisible()
      phase = 'client-attachments:agency-history-file'
      await expect(
        page.getByText('submitted-history.txt', { exact: true }),
      ).toBeVisible()
      phase = 'client-attachments:withdraw'
      await field.getByRole('button', { name: 'Withdraw to edit' }).click()
      await expect(
        field.getByRole('button', { name: 'Review and submit', exact: true }),
      ).toBeVisible()
      phase = 'client-attachments:unselect'
      await field
        .getByRole('checkbox', { name: /submitted-history\.txt/ })
        .uncheck()
      await expect(
        field.getByRole('status').filter({ hasText: /^Saved/ }),
      ).toBeVisible()
      const removal = await run(
        { url: root + '/assets/' + retained.id, method: 'DELETE' },
        clientPage,
        false,
      )
      assert.equal(removal.status, 409)
      assert.deepEqual(
        (
          await run(
            agency + '/items/' + item + '/revisions/' + revision.revisionId,
          )
        ).data.revision,
        snapshot,
      )
      assert.equal(
        (
          await run(
            {
              url: root + '/assets/' + retained.id + '/download',
              method: 'POST',
              body: { variant: 'ORIGINAL' },
            },
            clientPage,
            false,
          )
        ).status,
        200,
      )
      phase = 'client-attachments:resubmit'
      await clientPage.setViewportSize({ width: 1440, height: 1000 })
      await field
        .getByRole('checkbox', { name: /submitted-history\.txt/ })
        .check()
      await expect(
        field.getByRole('status').filter({ hasText: /^Saved/ }),
      ).toBeVisible()
      await field
        .getByRole('button', { name: 'Review and submit', exact: true })
        .click()
      const resubmission = clientPage.waitForResponse(
        (res) =>
          res.request().method() === 'POST' &&
          new URL(res.url()).pathname.endsWith('/items/' + item + '/submit'),
      )
      await field
        .getByRole('button', { name: 'Submit for review', exact: true })
        .click()
      assert.equal((await (await resubmission).json()).revisionNo, 2)
      await expect(
        field.getByRole('button', { name: 'Withdraw to edit' }),
      ).toBeVisible()

      break
    }
    case 'client-ai-failure': {
      phase = 'client-ai-failure'
      const root = `client/projects/${settings.previewProject}`
      const item = input.item
      const before = (await run(`${root}/items/${item}`, clientPage, false))
        .data.answer
      const queued = await run(
        {
          url: `${root}/items/${item}/ai-drafts`,
          method: 'POST',
          body: {
            facts: ['Family owned practice', 'Serving the local community'],
            tone: 'Professional',
            targetWords: 150,
            baseAnswerVersion: before.version,
            consent: true,
          },
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        },
        clientPage,
        false,
      )
      assert.equal(queued.status, 202)
      await expect
        .poll(
          async () =>
            (
              await run(
                `${root}/ai-drafts/${queued.data.jobId}`,
                clientPage,
                false,
              )
            ).data.job.state,
        )
        .toBe('FAILED')
      const job = (
        await run(`${root}/ai-drafts/${queued.data.jobId}`, clientPage, false)
      ).data.job
      assert.equal(job.failureCode, 'AI_TIMEOUT')
      assert.equal(job.result, null)
      const unchanged = (await run(`${root}/items/${item}`, clientPage, false))
        .data.answer
      assert.deepEqual(unchanged, before)
      const checklist = (await run(root + '/checklist', clientPage, false)).data
      const saved = await run(
        {
          url: `${root}/items/${item}/answer`,
          method: 'PUT',
          body: {
            value: {
              text: 'Writing manually remains available after provider failure.',
            },
            expectedVersion: before.version,
            expectedStructureVersion: checklist.project.structureVersion,
            saveOperationId: crypto.randomUUID(),
          },
        },
        clientPage,
        false,
      )
      assert.equal(saved.status, 200)
      assert.equal(saved.data.answer.version, before.version + 1)
      break
    }
    case 'client-ai-acceptance': {
      phase = 'client-ai-acceptance'
      const root = `client/projects/${settings.previewProject}`
      const item = input.item
      const checklist = (await run(root + '/checklist', clientPage, false)).data
      assert.equal(checklist.project.aiEnabled, true)
      const section = checklist.sections.find((s) =>
        s.items.some((i) => i.id === item),
      )
      const original = (await run(`${root}/items/${item}`, clientPage, false))
        .data.answer
      await clientPage.reload()
      await clientPage
        .getByRole('navigation', { name: 'Requested sections' })
        .getByRole('button', { name: section.title, exact: true })
        .click()
      const field = clientPage.locator('#item-' + item)
      const notes = field.getByLabel('Facts to include (one per line)')
      async function generate() {
        await notes.fill('Family owned practice\nServing our local community')
        await field
          .getByRole('checkbox', { name: /I consent to sending/ })
          .check()
        await field
          .getByRole('button', { name: 'Draft from my notes', exact: true })
          .click()
        await expect(
          field.getByRole('button', { name: 'Use this draft', exact: true }),
        ).toBeVisible()
      }
      await generate()
      assert.deepEqual(
        (await run(`${root}/items/${item}`, clientPage, false)).data.answer,
        original,
      )
      await field
        .getByRole('button', { name: 'Discard suggestion', exact: true })
        .click()
      assert.deepEqual(
        (await run(`${root}/items/${item}`, clientPage, false)).data.answer,
        original,
      )
      await generate()
      await field
        .getByRole('button', { name: 'Use this draft', exact: true })
        .click()
      await expect(
        clientPage.getByRole('dialog', { name: 'Use this AI draft?' }),
      ).toBeVisible()
      assert.deepEqual(
        (await run(`${root}/items/${item}`, clientPage, false)).data.answer,
        original,
      )
      const accepting = clientPage.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname.endsWith('/accept'),
      )
      await clientPage
        .getByRole('dialog')
        .getByRole('button', { name: 'Save as draft', exact: true })
        .click()
      assert.equal((await accepting).status(), 200)
      await expect(
        field.getByLabel('Your response', { exact: true }),
      ).toHaveValue('Family owned practice Serving our local community')
      const accepted = (await run(`${root}/items/${item}`, clientPage, false))
        .data
      assert.equal(accepted.answer.version, original.version + 1)
      assert.equal(accepted.item.state, 'DRAFT')
      await expect(field.getByText(/has not been submitted/)).toBeVisible()
      // A different tab/client writer advances the draft while another suggestion is shown.
      await field
        .getByRole('button', { name: 'Regenerate', exact: true })
        .click()
      await generate()
      const newer = await run(
        {
          url: `${root}/items/${item}/answer`,
          method: 'PUT',
          body: {
            value: { text: 'A newer manually saved answer.' },
            expectedVersion: accepted.answer.version,
            expectedStructureVersion: checklist.project.structureVersion,
            saveOperationId: crypto.randomUUID(),
          },
        },
        clientPage,
        false,
      )
      assert.equal(newer.status, 200)
      await field
        .getByRole('button', { name: 'Use this draft', exact: true })
        .click()
      const stale = clientPage.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname.endsWith('/accept'),
      )
      await clientPage
        .getByRole('dialog')
        .getByRole('button', { name: 'Save as draft', exact: true })
        .click()
      assert.equal((await stale).status(), 409)
      assert.equal(
        (await run(`${root}/items/${item}`, clientPage, false)).data.answer
          .value.text,
        'A newer manually saved answer.',
      )
      await clientPage
        .getByRole('dialog')
        .getByRole('button', { name: 'Cancel', exact: true })
        .click()
      break
    }
    case 'review-decisions': {
      phase = 'review-decisions:setup'
      const item = settings.attachmentItem
      const agency =
        'workspaces/' +
        settings.workspace +
        '/projects/' +
        settings.previewProject
      const clientRoot = 'client/projects/' + settings.previewProject
      const history = (await run(agency + '/items/' + item + '/revisions')).data
        .data
      const oldRevision = history[0].revisionId
      const oldSnapshot = (
        await run(agency + '/items/' + item + '/revisions/' + oldRevision)
      ).data.revision
      const reviewUrl =
        origin +
        '/app/w/' +
        settings.workspace +
        '/projects/' +
        settings.previewProject +
        '?tab=review'
      await page.goto(reviewUrl.replace('?tab=review', '?tab=submissions'))
      await page
        .getByRole('navigation', { name: 'Project sections' })
        .getByRole('link', { name: 'Review', exact: true })
        .click()
      await page.getByLabel('Browse submitted item history').selectOption(item)
      await expect(
        page.getByRole('heading', {
          name: 'Submitted revision 2',
          exact: true,
        }),
      ).toBeVisible()
      phase = 'review-decisions:internal-comment'
      await page.getByLabel('Comment visibility').selectOption('INTERNAL')
      await page
        .getByLabel('Comment', { exact: true })
        .fill('Synthetic internal review note')
      await page
        .getByRole('button', { name: 'Add comment', exact: true })
        .click()
      await expect(
        page.getByText('Synthetic internal review note', { exact: true }),
      ).toBeVisible()
      const safe = (
        await run(
          clientRoot + '/items/' + item + '/comments',
          clientPage,
          false,
        )
      ).data
      assert.ok(
        !JSON.stringify(safe).includes('Synthetic internal review note'),
      )
      phase = 'review-decisions:request-changes'
      await page
        .getByRole('button', { name: 'Request changes', exact: true })
        .click()
      await page
        .getByLabel('Feedback shared with the client')
        .fill('Please confirm this is the final document.')
      const changes = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname.endsWith('/review-decisions'),
      )
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Send feedback', exact: true })
        .click()
      assert.equal((await changes).status(), 201)
      await expect(
        page.getByText(
          'Changes requested. Your feedback is visible to the client.',
          { exact: true },
        ),
      ).toBeVisible()
      phase = 'review-decisions:client-feedback'
      await clientPage.reload()
      await clientPage
        .getByRole('navigation', { name: 'Requested sections' })
        .getByRole('button', { name: 'Browser attachments', exact: true })
        .click()
      const field = clientPage.locator('article').filter({
        has: clientPage.getByRole('heading', {
          name: 'Private documents',
          exact: true,
        }),
      })
      await expect(
        field.getByText('Please confirm this is the final document.', {
          exact: true,
        }),
      ).toBeVisible()
      await expect(
        clientPage.getByText('Synthetic internal review note', { exact: true }),
      ).toHaveCount(0)
      await field
        .getByLabel('Message to your agency')
        .fill('Confirmed, this is the final document.')
      await field
        .getByRole('button', { name: 'Send comment', exact: true })
        .click()
      await expect(
        field.getByText('Confirmed, this is the final document.', {
          exact: true,
        }),
      ).toBeVisible()
      phase = 'review-decisions:resubmit'
      await field
        .getByRole('button', { name: 'Review and submit', exact: true })
        .click()
      const submitted = clientPage.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname.endsWith('/submit'),
      )
      await field
        .getByRole('button', { name: 'Submit for review', exact: true })
        .click()
      const third = await (await submitted).json()
      assert.equal(third.revisionNo, 3)
      phase = 'review-decisions:approve'
      await page.reload()
      await page.getByLabel('Browse submitted item history').selectOption(item)
      await expect(
        page.getByRole('heading', {
          name: 'Submitted revision 3',
          exact: true,
        }),
      ).toBeVisible()
      await page
        .getByLabel('Submitted revision', { exact: true })
        .selectOption(oldRevision)
      await expect(
        page.getByRole('heading', {
          name: 'Submitted revision 2',
          exact: true,
        }),
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Approve revision', exact: true }),
      ).toBeDisabled()
      await page
        .getByLabel('Submitted revision', { exact: true })
        .selectOption(third.revisionId)
      await expect(
        page.getByRole('heading', {
          name: 'Submitted revision 3',
          exact: true,
        }),
      ).toBeVisible()
      await page
        .getByRole('button', { name: 'Approve revision', exact: true })
        .click()
      const approved = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname.endsWith('/review-decisions'),
      )
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Approve', exact: true })
        .click()
      assert.equal((await approved).status(), 201)
      await expect(
        page.getByText('Exact submitted revision approved.', { exact: true }),
      ).toBeVisible()
      assert.deepEqual(
        (await run(agency + '/items/' + item + '/revisions/' + oldRevision))
          .data.revision,
        oldSnapshot,
      )
      const final = (
        await run(clientRoot + '/items/' + item, clientPage, false)
      ).data.item
      assert.equal(final.state, 'APPROVED')
      assert.equal(final.canEdit, false)
      await expect(
        page.getByRole('button', { name: 'Approve revision', exact: true }),
      ).toBeDisabled()
      await expect(
        page.getByRole('button', { name: 'Reopen approved item', exact: true }),
      ).toBeEnabled()
      break
    }
    case 'approved-exports': {
      phase = 'approved-exports'
      const root = `workspaces/${settings.workspace}/projects/${settings.previewProject}`
      const detail = (await run(root)).data
      const approved = detail.structure
        .flatMap((s) => s.items)
        .find((i) => i.id === settings.attachmentItem)
      assert.equal(approved.state, 'APPROVED')
      const revision = (
        await run(
          `${root}/items/${approved.id}/revisions/${approved.currentRevisionId}`,
        )
      ).data.revision
      await page.goto(
        `${origin}/app/w/${settings.workspace}/projects/${settings.previewProject}?tab=exports`,
      )
      await page.getByRole('button', { name: /New export/ }).click()
      await page.getByLabel(/I understand this is a/).check()
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      const queued = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname.endsWith('/exports'),
      )
      await page
        .getByRole('button', { name: 'Create approved export', exact: true })
        .click()
      const response = await queued
      assert.equal(response.status(), 202)
      const first = await response.json()
      assert.equal(first.state, 'QUEUED')
      await expect(page.getByText(/Export queued/)).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Download', exact: true }),
      ).toBeVisible()
      const downloading = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download', exact: true }).click()
      const download = await downloading
      assert.equal(await download.failure(), null)
      const zip = unzipSync(readFileSync(await download.path()))
      const manifest = JSON.parse(
        Buffer.from(zip['manifest.json']).toString('utf8'),
      )
      const exported = manifest.sections
        .flatMap((s) => s.items)
        .find((i) => i.itemId === approved.id)
      assert.equal(manifest.partial, true)
      assert.equal(exported.revisionId, approved.currentRevisionId)
      assert.deepEqual(exported.value, revision.valueSnapshot)
      assert.ok(exported.files.length > 0)
      for (const file of exported.files) assert.ok(zip[file.path]?.length > 0)
      assert.ok(Object.keys(zip).some((path) => path.endsWith('/content.md')))
      assert.ok(
        !JSON.stringify(manifest).includes('Synthetic internal review note'),
      )
      assert.equal(Object.hasOwn(manifest, 'sources'), false)
      for (const format of ['APPROVED_JSON', 'APPROVED_MARKDOWN']) {
        phase = 'approved-exports:' + format
        const result = await run({
          url: root + '/exports',
          method: 'POST',
          body: {
            format,
            expectedProjectVersion: detail.project.version,
            includeOriginals: false,
            acknowledgePartial: true,
          },
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        })
        assert.ok(result.data.jobId)
        const jobId = result.data.jobId
        await expect
          .poll(
            async () =>
              (await run(root + '/exports/' + jobId)).data.export.state,
          )
          .toBe('READY')
        const link = (
          await run({
            url: root + '/exports/' + jobId + '/download',
            method: 'POST',
            body: {},
          })
        ).data.url
        const artifact = await context.request.get(link)
        assert.equal(artifact.status(), 200)
        if (format === 'APPROVED_JSON') {
          const json = await artifact.json()
          assert.deepEqual(json.sections, manifest.sections)
          assert.equal(json.projectVersion, manifest.projectVersion)
        } else {
          const markdown = await artifact.text()
          assert.ok(markdown.includes('Partial approved export'))
          assert.ok(markdown.includes(approved.currentRevisionId))
          assert.ok(!markdown.includes('Synthetic internal review note'))
        }
      }
      break
    }
    case 'project-publication': {
      phase = 'project-publication'
      await page.goto(
        origin +
          '/app/w/' +
          settings.workspace +
          '/projects/' +
          settings.previewProject,
      )
      await page.getByLabel('Project action').selectOption('publish')
      const published = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname.endsWith('/publish'),
      )
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Confirm publish', exact: true })
        .click()
      const response = await published
      assert.equal(response.status(), 200)
      const data = await response.json()
      assert.equal(data.projectState, 'ACTIVE')
      assert.ok(data.publishedAt)
      assert.equal(data.publishedVersion, data.projectVersion)
      await expect(page.getByRole('dialog')).not.toBeVisible()
      break
    }
    case 'project-reopening': {
      const agency =
        'workspaces/' +
        settings.workspace +
        '/projects/' +
        settings.previewProject
      const clientRoot = 'client/projects/' + settings.previewProject
      const item = settings.attachmentItem
      const url =
        origin +
        '/app/w/' +
        settings.workspace +
        '/projects/' +
        settings.previewProject +
        '?tab=review'
      async function action(name, reason) {
        await waitState('authenticated')
        await expect(page.getByLabel('Project action')).toBeVisible()
        // A preceding item/lifecycle mutation can still be refreshing the shared
        // project query. Capture an action only after the current server version
        // is in the RTK cache; preserve the real optimistic-concurrency assertion.
        const version = (await run(agency)).data.project.version
        await expect
          .poll(() =>
            page.evaluate(
              async ({ agency, version }) => {
                const { store } = await import('/src/app/store/store.ts')
                const { workspaceApi } =
                  await import('/src/services/api/resourceApi.ts')
                const query = workspaceApi.endpoints.read.select(agency)(
                  store.getState(),
                )
                return (
                  query.status === 'fulfilled' &&
                  query.data?.project?.version === version
                )
              },
              { agency, version },
            ),
          )
          .toBe(true)
        await page.getByLabel('Project action').selectOption(name)
        if (reason)
          await page
            .getByRole('dialog')
            .getByLabel('Reason', { exact: true })
            .fill(reason)
        const response = page.waitForResponse(
          (r) =>
            r.request().method() === 'POST' &&
            new URL(r.url()).pathname.endsWith('/' + name),
        )
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Confirm ' + name, exact: true })
          .click()
        const result = await response
        assert.equal(result.status(), 200)
        await expect(page.getByRole('dialog')).not.toBeVisible()
        return (await result.json()).projectState
      }
      phase = 'project-reopening:pause'
      await page.goto(url)
      assert.equal(await action('pause'), 'PAUSED')
      assert.equal(
        (await run(clientRoot + '/checklist', clientPage, false)).data
          .capabilities.canRespond,
        false,
      )
      assert.equal(await action('resume'), 'ACTIVE')
      phase = 'project-reopening:item'
      await page.getByLabel('Browse submitted item history').selectOption(item)
      const previous = (await run(agency + '/items/' + item + '/revisions'))
        .data.data[0].revisionId
      const frozen = (
        await run(agency + '/items/' + item + '/revisions/' + previous)
      ).data
      await page
        .getByRole('button', { name: 'Reopen approved item', exact: true })
        .click()
      await page
        .getByLabel('Feedback shared with the client')
        .fill(
          'Please reconfirm the approved document after the request update.',
        )
      const opened = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname.endsWith('/items/' + item + '/reopen'),
      )
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Reopen item', exact: true })
        .click()
      assert.equal((await opened).status(), 200)
      await expect(
        page.getByText(
          'Item reopened. Historical approvals remain unchanged.',
          { exact: true },
        ),
      ).toBeVisible()
      phase = 'project-reopening:structure'
      let project = (await run(agency)).data
      const field = project.structure
        .flatMap((s) => s.items)
        .find((i) => i.id === item)
      const definition = {
        ...field,
        required: true,
        validation: { ...field.validation, maxFiles: 3 },
      }
      for (const key of [
        'id',
        'sectionId',
        'sortOrder',
        'state',
        'version',
        'currentRevisionId',
        'visible',
      ])
        delete definition[key]
      const changed = await run({
        url: agency + '/items/' + item + '/schema',
        method: 'PATCH',
        body: {
          definition,
          expectedStructureVersion: project.project.structureVersion,
          reopenAffected: false,
        },
      })
      assert.equal(changed.status, 200)
      assert.deepEqual(
        (await run(agency + '/items/' + item + '/revisions/' + previous)).data,
        frozen,
      )
      phase = 'project-reopening:client-resubmission'
      await clientPage.reload()
      await clientPage
        .getByRole('navigation', { name: 'Requested sections' })
        .getByRole('button', { name: 'Browser attachments', exact: true })
        .click()
      const editor = clientPage.locator('article').filter({
        has: clientPage.getByRole('heading', {
          name: 'Private documents',
          exact: true,
        }),
      })
      await expect(
        editor.getByText(
          'Please reconfirm the approved document after the request update.',
          { exact: true },
        ),
      ).toBeVisible()
      await editor
        .getByRole('button', { name: 'Review and submit', exact: true })
        .click()
      const submitted = clientPage.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname.endsWith('/submit'),
      )
      await editor
        .getByRole('button', { name: 'Submit for review', exact: true })
        .click()
      const fourth = await (await submitted).json()
      assert.equal(fourth.revisionNo, 4)
      await page.reload()
      await page.getByLabel('Browse submitted item history').selectOption(item)
      await expect(
        page.getByRole('heading', {
          name: 'Submitted revision 4',
          exact: true,
        }),
      ).toBeVisible()
      await page
        .getByRole('button', { name: 'Approve revision', exact: true })
        .click()
      const approved = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname.endsWith('/review-decisions'),
      )
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Approve', exact: true })
        .click()
      assert.equal((await approved).status(), 201)
      phase = 'project-reopening:completion'
      // Disable unrelated requests through the real T11 API, preserving every saved draft/history.
      project = (await run(agency)).data
      for (const section of project.structure.filter(
        (s) => !s.items.some((i) => i.id === item),
      )) {
        project = (await run(agency)).data
        assert.equal(
          (
            await run({
              url: agency + '/sections/' + section.id,
              method: 'PATCH',
              body: {
                enabled: false,
                expectedStructureVersion: project.project.structureVersion,
              },
            })
          ).status,
          200,
        )
      }
      await page.reload()
      assert.equal(await action('complete'), 'COMPLETED')
      assert.equal(
        (await run(clientRoot + '/checklist', clientPage, false)).data
          .capabilities.canRespond,
        false,
      )
      assert.equal(
        await action('reopen', 'Client requests one final update.'),
        'ACTIVE',
      )
      await page.getByLabel('Browse submitted item history').selectOption(item)
      await page
        .getByRole('button', { name: 'Reopen approved item', exact: true })
        .click()
      await page
        .getByLabel('Feedback shared with the client')
        .fill('Final selective reopening after project completion.')
      const again = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname.endsWith('/items/' + item + '/reopen'),
      )
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Reopen item', exact: true })
        .click()
      assert.equal((await again).status(), 200)
      phase = 'project-reopening:archive-restore'
      assert.equal(await action('archive'), 'ARCHIVED')
      assert.equal(
        (await run(clientRoot + '/checklist', clientPage, false)).data
          .capabilities.canRespond,
        false,
      )
      assert.equal(await action('restore'), 'PAUSED')
      assert.equal(await action('resume'), 'ACTIVE')
      assert.deepEqual(
        (await run(agency + '/items/' + item + '/revisions/' + previous)).data,
        frozen,
      )
      break
    }
    case 'client-idle-request-link': {
      const root = 'client/projects/' + settings.previewProject + '/checklist'
      assert.equal((await run(root, clientPage, false)).status, 401)
      await clientPage.evaluate(() => window.dispatchEvent(new Event('focus')))
      await expect(
        clientPage.getByRole('heading', {
          name: 'Let’s reconnect to your project',
        }),
      ).toBeVisible()
      await clientPage
        .getByRole('link', { name: 'Request a fresh link', exact: true })
        .click()
      await clientPage
        .getByLabel('Your email', { exact: true })
        .fill('browser-contact@example.test')
      const requested = clientPage.waitForResponse(
        (res) =>
          new URL(res.url()).pathname === '/api/v1/client-access/request-link',
      )
      await clientPage
        .getByRole('button', { name: 'Request fresh link', exact: true })
        .click()
      assert.equal((await requested).status(), 202)
      await expect(clientPage.getByRole('status')).toContainText(
        'If this address has active access',
      )
      break
    }
    case 'client-expired-invitation': {
      const expiredContext = await browser.newContext({
        ignoreHTTPSErrors: true,
      })
      try {
        const target = await expiredContext.newPage()
        observe(target)
        await target.goto(origin + '/client/access#token=' + input.token)
        await waitState('anonymous', target)
        const result = target.waitForResponse(
          (res) =>
            new URL(res.url()).pathname === '/api/v1/client-access/exchange',
        )
        await target
          .getByRole('button', { name: 'Open my project', exact: true })
          .click()
        assert.equal((await result).status(), 401)
        phase = 'client-expired-invitation:message'
        await expect(target.getByRole('alert')).toContainText('expired')
      } finally {
        await expiredContext.close()
      }
      break
    }
    case 'client-revoke': {
      await page.goto(
        origin +
          '/app/w/' +
          settings.workspace +
          '/projects/' +
          settings.previewProject +
          '?tab=access',
      )
      await page
        .getByRole('row')
        .filter({ hasText: 'browser-contact@example.test' })
        .getByRole('button', { name: 'Revoke', exact: true })
        .click()
      const result = page.waitForResponse(
        (res) =>
          res.request().method() === 'DELETE' &&
          new URL(res.url()).pathname.endsWith('/access'),
      )
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Revoke access', exact: true })
        .click()
      assert.equal((await result).status(), 204)
      await expect(page.getByRole('dialog')).toHaveCount(0)
      assert.equal(
        (
          await run(
            {
              url:
                'client/projects/' +
                settings.previewProject +
                '/items/' +
                settings.draftItem +
                '/answer',
              method: 'PUT',
              body: {
                value: { text: 'Rejected' },
                expectedVersion: settings.draftVersion,
                expectedStructureVersion: 1,
                saveOperationId: crypto.randomUUID(),
              },
            },
            clientPage,
            false,
          )
        ).status,
        401,
      )
      const uploadDenied = await run(
        {
          url: 'client/projects/' + settings.previewProject + '/uploads',
          method: 'POST',
          headers: { 'Idempotency-Key': crypto.randomUUID() },
          body: {
            itemId: settings.attachmentItem,
            originalName: 'revoked.txt',
            contentType: 'text/plain',
            bytes: 10,
            keepOriginal: true,
          },
        },
        clientPage,
        false,
      )
      assert.equal(uploadDenied.status, 401)
      const response = clientPage.waitForResponse(
        (res) =>
          new URL(res.url()).pathname.endsWith('/checklist') &&
          res.status() === 401,
      )
      await clientPage.evaluate(() => window.dispatchEvent(new Event('focus')))
      await response
      await expect(
        clientPage.getByRole('heading', {
          name: 'Let’s reconnect to your project',
        }),
      ).toBeVisible()
      const state = await clientPage.evaluate(async () =>
        (await import('/src/app/store/store.ts')).store.getState(),
      )
      assert.ok(
        state.clientAccess.blocked &&
          Object.keys(state.clientApi.queries).length === 0,
      )
      assert.equal((await run('me')).status, 200)
      await clientPage.reload()
      await expect(
        clientPage.getByRole('heading', {
          name: 'Let’s reconnect to your project',
        }),
      ).toBeVisible()
      await clientContext.close()
      clientContext = undefined
      break
    }
    case 'workspace-reload': {
      await page.reload()
      await waitState('authenticated')
      await expect(page.getByLabel('Workspace', { exact: true })).toHaveValue(
        settings.workspace,
      )
      await page
        .getByLabel('Workspace', { exact: true })
        .selectOption(settings.workspace)
      await expect(
        page.getByText('Workspace owner', { exact: true }),
      ).toBeVisible()
      assert.ok(
        (await run('workspaces')).status === 200,
        'Workspace list unavailable after reload',
      )
      assert.ok(
        (await run('workspaces/' + settings.workspace)).status === 200,
        'Workspace did not persist',
      )
      // Finish the reloaded page's lazy reads before the Java driver advances
      // its clock. Otherwise a newly mounted read races the explicit expiry probe.
      await page.locator('main h1').first().waitFor({ state: 'visible' })
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const { store } = await import('/src/app/store/store.ts')
            return Object.values(store.getState().agencyApi.queries).every(
              (query) => query?.status !== 'pending',
            )
          }),
        )
        .toBe(true)
      break
    }
    case 'workspace-isolation': {
      for (const suffix of ['client-preview', 'contacts'])
        assert.equal(
          (
            await run(
              'workspaces/' +
                input.other +
                '/projects/' +
                settings.previewProject +
                '/' +
                suffix,
            )
          ).status,
          404,
          'Foreign T12 resource exposed',
        )

      for (const id of [input.other, '00000000-0000-0000-0000-000000000001']) {
        assert.ok(
          (await run('workspaces/' + id)).status === 404,
          'Unrelated tenant metadata exposed',
        )
        assert.ok(
          (
            await run({
              url: 'workspaces/' + id,
              method: 'PATCH',
              body: { name: 'Denied', expectedVersion: 0 },
            })
          ).status === 404,
          'Unrelated tenant modification accepted',
        )
      }
      break
    }
    case 'workspace-member': {
      await page.evaluate(async () => {
        const { store } = await import('/src/app/store/store.ts')
        const { bootstrapSession } =
          await import('/src/features/auth/store/session.ts')
        await store.dispatch(bootstrapSession())
      })
      await waitState('authenticated')
      await page
        .getByLabel('Workspace', { exact: true })
        .selectOption(input.other)
      await expect(page.getByText('Team member', { exact: true })).toBeVisible()
      await page.reload()
      await waitState('authenticated')
      await expect
        .poll(() =>
          page.evaluate(
            async () =>
              (await import('/src/app/store/store.ts')).store.getState().auth
                .workspaceId,
          ),
        )
        .toBe(input.other)
      await expect(page.getByLabel('Workspace', { exact: true })).toHaveValue(
        input.other,
      )
      const stale = await page.evaluate(
        async (id) =>
          Object.keys(
            (await import('/src/app/store/store.ts')).store.getState().agencyApi
              .queries,
          ).some((key) => key.includes(id)),
        settings.workspace,
      )
      assert.ok(
        !stale,
        'Workspace switch/reload retained previous tenant queries',
      )
      await expect(
        page
          .getByRole('navigation', { name: 'Workspace navigation' })
          .getByRole('link', { name: 'Team', exact: true }),
      ).toHaveCount(0)
      assert.ok(
        (await run('workspaces/' + input.other)).status === 200,
        'Explicit member access failed',
      )
      assert.ok(
        (
          await run({
            url: 'workspaces/' + input.other,
            method: 'PATCH',
            body: { name: 'Denied', expectedVersion: 0 },
          })
        ).status === 403,
        'Member owner mutation accepted',
      )
      break
    }
    case 'workspace-revoked': {
      phase = 'workspace-revoked:bootstrap'
      await page.evaluate(async () => {
        const { store } = await import('/src/app/store/store.ts')
        const { bootstrapSession } =
          await import('/src/features/auth/store/session.ts')
        await store.dispatch(bootstrapSession())
      })
      await waitState('authenticated')
      await expect(
        page.getByRole('heading', {
          name: 'This space isn’t available to your account',
        }),
      ).toBeVisible()
      phase = 'workspace-revoked:cache'
      const retained = await page.evaluate(async (id) => {
        const state = (await import('/src/app/store/store.ts')).store.getState()
        return (
          state.auth.memberships.some((m) => m.workspaceId === id) ||
          Object.keys(state.agencyApi.queries).some((key) => key.includes(id))
        )
      }, input.other)
      assert.ok(!retained, 'Revoked membership or private cache retained')
      assert.ok(
        (await run('workspaces/' + input.other)).status === 404,
        'Disabled member retained backend access',
      )
      break
    }
    case 'csrf': {
      const statuses = await page.evaluate(async () => {
        const { store } = await import('/src/app/store/store.ts')
        const paths = [
          'auth/login',
          'auth/refresh',
          'auth/logout',
          'auth/reset-password',
          'me/sessions/00000000-0000-0000-0000-000000000001',
        ]
        return Promise.all(
          paths.map(
            async (path) =>
              (
                await fetch('/api/v1/' + path, {
                  method: path.startsWith('me/') ? 'DELETE' : 'POST',
                  credentials: 'include',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization:
                      'Bearer ' + store.getState().auth.accessToken,
                  },
                  body: path.startsWith('me/') ? undefined : '{}',
                })
              ).status,
          ),
        )
      })
      assert.ok(
        statuses.every((status) => status === 403),
        'Missing CSRF was accepted',
      )
      assert.ok(
        (await run('me')).status === 200,
        'CSRF rejection damaged session',
      )
      break
    }
    case 'cors': {
      const hostile = createHttpServer((_req, res) => {
        res.setHeader('Content-Type', 'text/html')
        res.end('<!doctype html><title>Untrusted origin check</title>')
      })
      await new Promise((resolve) => hostile.listen(0, '127.0.0.1', resolve))
      const outsider = await context.newPage()
      try {
        await outsider.goto('http://127.0.0.1:' + hostile.address().port)
        const denied = await outsider.evaluate(async (apiOrigin) => {
          try {
            await fetch(apiOrigin + '/api/v1/auth/refresh', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                'X-XSRF-TOKEN': 'untrusted',
              },
              body: '{}',
            })
            return false
          } catch {
            return true
          }
        }, settings.backend)
        const rejected = await context.request.fetch(
          settings.backend + '/api/v1/auth/refresh',
          {
            method: 'OPTIONS',
            headers: {
              Origin: 'http://127.0.0.1:' + hostile.address().port,
              'Access-Control-Request-Method': 'POST',
              'Access-Control-Request-Headers': 'content-type,x-xsrf-token',
            },
          },
        )
        assert.ok(
          rejected.status() === 403 &&
            !rejected.headers()['access-control-allow-origin'],
          'Backend did not reject origin preflight',
        )
        assert.ok(denied, 'Untrusted credentialed CORS request succeeded')
      } finally {
        await outsider.close()
        await new Promise((resolve) => hostile.close(resolve))
      }
      assert.ok((await run('me')).status === 200, 'CORS probe damaged session')
      break
    }
    case 'bootstrap':
      phase = 'bootstrap-reload'
      await page.reload()
      phase = 'bootstrap-auth'
      await waitState('authenticated')
      phase = 'bootstrap-me'
      assert.ok((await run('me')).status === 200, 'Bootstrap identity failed')
      break
    case 'expired-write': {
      const before = refreshes
      assert.ok(
        (await run({ url: 'me/sessions/' + input.sessionId, method: 'DELETE' }))
          .status === 204,
        'Write retry did not renew CSRF',
      )
      assert.ok(refreshes === before + 1, 'Write refresh count mismatch')
      break
    }
    case 'concurrent-refresh': {
      const before = refreshes
      const results = await Promise.all([run('me'), run('me/sessions')])
      assert.ok(
        results.every((result) => result.status === 200),
        'Concurrent request failed',
      )
      assert.ok(
        refreshes === before + 1,
        'Concurrent requests did not share refresh',
      )
      break
    }
    case 'logout':
      await page.evaluate(async () => {
        const { store } = await import('/src/app/store/store.ts')
        const { logoutSession } =
          await import('/src/features/auth/store/session.ts')
        await store.dispatch(logoutSession())
      })
      await waitState('anonymous')
      assert.ok(
        !(await context.cookies(origin + '/api/v1/auth/refresh')).some(
          (cookie) => cookie.name === '__Secure-collector_refresh',
        ),
        'Logout did not delete cookie',
      )
      break
    case 'invalid-login':
      await signin(page, 'synthetic wrong password', 401)
      break
    case 'signin':
      await signin(page, input.password || settings.password)
      break
    case 'reset': {
      const popup = await context.newPage()
      await popup.goto(origin + '/reset-password#token=' + input.token)
      await popup
        .getByLabel('New password', { exact: true })
        .fill(input.password)
      await popup
        .getByLabel('Confirm password', { exact: true })
        .fill(input.password)
      phase = 'reset-submit'
      const reset = popup.waitForResponse(
        (res) => new URL(res.url()).pathname === '/api/v1/auth/reset-password',
      )
      await popup
        .getByRole('button', { name: 'Reset password', exact: true })
        .click()
      assert.ok((await reset).status() === 200, 'Password reset failed')
      assert.ok(!new URL(popup.url()).hash, 'Reset token remained in history')
      await popup.close()
      assert.ok(
        (await run('me')).status === 401,
        'Reset did not invalidate old access',
      )
      await waitState('anonymous')
      settings.password = input.password
      break
    }
    case 'logout-all': {
      const other = await browser.newContext({ ignoreHTTPSErrors: true })
      const second = await other.newPage()
      await signin(second, settings.password)
      assert.ok(
        (await rawMutation('auth/logout-all', second)) === 204,
        'Logout-all failed',
      )
      assert.ok(
        (await run('me')).status === 401,
        'Other device retained access',
      )
      await waitState('anonymous')
      await other.close()
      break
    }
    case 'expired-session':
      assert.ok(
        (await run('me')).status === 401,
        'Expired session retained access',
      )
      await waitState('anonymous')
      break
    case 'storage': {
      const empty = await page.evaluate(async () => {
        const values = [
          ...Object.values(localStorage),
          ...Object.values(sessionStorage),
        ]
        return (
          values.length === 0 &&
          (await navigator.serviceWorker.getRegistrations()).length === 0
        )
      })
      assert.ok(
        empty && !serviceWorkerResponse,
        'Private persistence or interception found',
      )
      break
    }
    case 'stop':
      await context?.close()
      await browser?.close()
      await server?.close()
      break
    default:
      throw new Error('Unknown check')
  }
}
const lines = createInterface({ input: process.stdin })
for await (const line of lines) {
  try {
    const input = JSON.parse(line)
    await command(input)
    response(true)
    if (input.action === 'stop') break
  } catch (error) {
    if (
      (phase.startsWith('client-attachments') ||
        phase.startsWith('client-ai') ||
        phase.startsWith('client-drafts') ||
        phase.startsWith('review-decisions')) &&
      clientPage
    ) {
      const alerts = await clientPage
        .getByRole('alert')
        .allTextContents()
        .catch(() => [])
      await clientPage
        .screenshot({
          path: fileURLToPath(
            new URL(
              '../../../.artifacts/real-auth/t17-failure.png',
              import.meta.url,
            ),
          ),
          fullPage: true,
        })
        .catch(() => {})
      http.push({
        failure: String(error.message)
          .replace(/https?:\/\/[^\s]+/g, '[private URL]')
          .replace(/[A-Za-z0-9_-]{40,}/g, '[redacted]')
          .slice(0, 2400),
        uploadAlerts: alerts.map((text) =>
          text.replace(/https?:\/\/[^\s]+/g, '[private URL]'),
        ),
      })
    }
    if (phase.startsWith('structure') || phase.startsWith('project-')) {
      const choices = await page
        .locator('dialog select')
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            label: node.closest('label')?.textContent?.slice(0, 120),
            options: [...node.options].map((option) => ({
              value: option.value,
              label: option.textContent,
            })),
          })),
        )
        .catch(() => [])
      http.push({
        failure: String(error.message)
          .replace(/https?:\/\/[^\s]+/g, '[private URL]')
          .replace(/[A-Za-z0-9_-]{40,}/g, '[redacted]')
          .slice(0, 2200),
        choices,
      })
      await page
        .screenshot({
          path: fileURLToPath(
            new URL(
              '../../../.artifacts/real-auth/t22-agency-failure.png',
              import.meta.url,
            ),
          ),
          fullPage: true,
        })
        .catch(() => {})
    }
    const diagnostic = String(error.message || '')
      .split('\n')[0]
      .replace(/https?:\/\/[^\s]+/g, '[private URL]')
      .replace(/[A-Za-z0-9_-]{40,}/g, '[redacted]')
      .slice(0, 500)
    response(false, `${error.name}: ${diagnostic}`)
  }
}
await browser?.close()
await server?.close()

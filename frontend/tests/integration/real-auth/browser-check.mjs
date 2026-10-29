// Explicit integration runner: real Vite, HTTPS, Edge and HTTP API; no MSW or request mocks.
import { createServer } from 'vite'
import { createServer as createHttpServer } from 'node:http'
import { chromium, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import assert from 'node:assert/strict'

let server, browser, context, page, settings, origin
let phase = 'start'
let refreshes = 0
let serviceWorkerResponse = false
const http = []
const response = (ok, kind = '') =>
  process.stdout.write(
    JSON.stringify({ ok, phase, kind, http: ok ? [] : http.slice(-12) }) +
      String.fromCharCode(10),
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
async function run(args, target = page) {
  return target.evaluate(async (args) => {
    const { store } = await import('/src/app/store/store.ts')
    const { createBaseQuery } = await import('/src/services/api/baseQuery.ts')
    const control = new AbortController()
    const result = await createBaseQuery(true)(
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
  }, args)
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
    response(false, error.name)
  }
}
await browser?.close()
await server?.close()

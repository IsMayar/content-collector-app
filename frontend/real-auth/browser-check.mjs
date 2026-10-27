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
            (await import('/src/app/store.ts')).store.getState().auth.status,
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
) {
  phase = 'signin-open'
  await target.goto(origin + '/sign-in')
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
    const { store } = await import('/src/app/store.ts')
    const { createBaseQuery } = await import('/src/api/baseQuery.ts')
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
    }
  }, args)
}
async function rawMutation(path, target = page) {
  return target.evaluate(async (path) => {
    const { store } = await import('/src/app/store.ts')
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
      process.chdir(fileURLToPath(new URL('..', import.meta.url)))
      process.env.VITE_ENABLE_MOCKS = 'false'
      process.env.VITE_API_BASE_URL = '/api/v1/'
      process.env.VITE_API_PROXY_TARGET = input.backend
      server = await createServer({
        configFile: fileURLToPath(
          new URL('../vite.config.ts', import.meta.url),
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
    case 'csrf': {
      const statuses = await page.evaluate(async () => {
        const { store } = await import('/src/app/store.ts')
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
        const { store } = await import('/src/app/store.ts')
        const { logoutSession } = await import('/src/features/auth/session.ts')
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

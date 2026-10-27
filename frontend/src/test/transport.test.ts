import { describe, expect, it } from 'vitest'
import { http, HttpResponse, delay } from 'msw'
import { createBaseQuery } from '@/api/baseQuery'
import { apiProblem, errorMessage } from '@/lib/apiError'
import { createAppStore } from '@/app/store'
import { tokenReceived, identityReceived } from '@/features/auth/authSlice'
import type { BaseQueryApi, FetchArgs } from '@reduxjs/toolkit/query'
import { server } from './setup'

const base = 'http://localhost:5173/api/v1/'
function boundary(agency = false) {
  const store = createAppStore()
  const controller = new AbortController()
  const api: BaseQueryApi = {
    signal: controller.signal,
    abort: () => controller.abort(),
    dispatch: store.dispatch,
    getState: store.getState,
    extra: undefined,
    endpoint: 'transport-test',
    type: 'query',
  }
  return {
    store,
    run: (args: string | FetchArgs) => createBaseQuery(agency)(args, api, {}),
  }
}

const envelope = (status: number) => ({
  type: 'about:blank',
  title: 'Safe title',
  status,
  detail: 'Safe detail',
  code: 'TEST_ERROR',
  traceId: 'server-trace-1',
  errors: [{ fieldPath: 'name', message: 'Invalid value.' }],
})

describe('shared HTTP transport contract', () => {
  it.each([400, 401, 403, 404, 405, 409, 415, 422, 429, 500])(
    'retains problem JSON and HTTP status %s without retrying client calls',
    async (status) => {
      let calls = 0
      server.use(
        http.get(`${base}transport-test`, () => {
          calls++
          return HttpResponse.json(envelope(status), {
            status,
            headers: {
              'Content-Type': 'application/problem+json',
              'X-Request-ID': 'server-trace-1',
            },
          })
        }),
      )
      const result = await boundary().run('transport-test')
      expect(result.error?.status).toBe(status)
      expect(apiProblem(result.error)).toEqual(envelope(status))
      expect(result.meta?.response?.headers.get('X-Request-ID')).toBe(
        'server-trace-1',
      )
      expect(calls).toBe(1)
    },
  )

  it.each([200, 201, 202])('parses JSON success %s', async (status) => {
    server.use(
      http.get(`${base}transport-test`, () =>
        HttpResponse.json({ id: '123' }, { status }),
      ),
    )
    const result = await boundary().run('transport-test')
    expect(result.data).toEqual({ id: '123' })
    expect(result.error).toBeUndefined()
  })

  it('handles an empty 204 response', async () => {
    server.use(
      http.get(
        `${base}transport-test`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    )
    const result = await boundary().run('transport-test')
    expect(result.error).toBeUndefined()
    expect(result.data).toBeNull()
  })

  it('sends same-origin cookies, JSON, caller correlation and agency bearer headers', async () => {
    server.use(
      http.get(`${base}auth/csrf`, () =>
        HttpResponse.json({ token: 'fresh-csrf' }),
      ),
      http.post(`${base}transport-test`, async ({ request }) => {
        expect(request.credentials).toBe('include')
        expect(request.headers.get('Accept')).toBe(
          'application/json, application/problem+json',
        )
        expect(request.headers.get('Content-Type')).toContain(
          'application/json',
        )
        expect(request.headers.get('Authorization')).toBe('Bearer memory-only')
        expect(request.headers.get('X-XSRF-TOKEN')).toBe('fresh-csrf')
        expect(request.headers.get('X-Request-ID')).toBe('caller-1')
        expect(await request.json()).toEqual({ name: 'Example' })
        return HttpResponse.json({ ok: true })
      }),
    )
    const transport = boundary(true)
    transport.store.dispatch(
      tokenReceived({ accessToken: 'memory-only', expiresIn: 300 }),
    )
    const result = await transport.run({
      url: 'transport-test',
      method: 'post',
      body: { name: 'Example' },
      headers: { 'X-Request-ID': 'caller-1' },
    })
    expect(result.data).toEqual({ ok: true })
  })

  it('never attaches agency bearer credentials to the client API', async () => {
    server.use(
      http.get(`${base}transport-test`, ({ request }) => {
        expect(request.headers.has('Authorization')).toBe(false)
        return HttpResponse.json({ ok: true })
      }),
    )
    const transport = boundary()
    transport.store.dispatch(
      tokenReceived({ accessToken: 'agency-only', expiresIn: 300 }),
    )
    expect((await transport.run('transport-test')).error).toBeUndefined()
  })

  it('stops a mutation when CSRF acquisition is denied by the foundation backend', async () => {
    let mutations = 0
    server.use(
      http.get(`${base}auth/csrf`, () =>
        HttpResponse.json(envelope(403), {
          status: 403,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
      ),
      http.post(`${base}transport-test`, () => {
        mutations++
        return HttpResponse.json({})
      }),
    )
    const result = await boundary().run({
      url: 'transport-test',
      method: 'POST',
      body: {},
    })
    expect(result.error?.status).toBe(403)
    expect(mutations).toBe(0)
  })

  it('reports network failures without claiming success', async () => {
    server.use(http.get(`${base}transport-test`, () => HttpResponse.error()))
    const result = await boundary().run('transport-test')
    expect(result.error?.status).toBe('FETCH_ERROR')
    expect(result.data).toBeUndefined()
  })

  it('reports a bounded request timeout without retrying', async () => {
    let calls = 0
    server.use(
      http.get(`${base}transport-test`, async () => {
        calls++
        await delay(200)
        return HttpResponse.json({})
      }),
    )
    const result = await boundary().run({ url: 'transport-test', timeout: 25 })
    expect(result.error?.status).toBe('TIMEOUT_ERROR')
    expect(result.data).toBeUndefined()
    expect(calls).toBe(1)
  })

  it('reports non-JSON gateway responses as parsing errors', async () => {
    server.use(
      http.get(
        `${base}transport-test`,
        () =>
          new HttpResponse('<html>gateway</html>', {
            status: 502,
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    )
    const result = await boundary().run('transport-test')
    expect(result.error?.status).toBe('PARSING_ERROR')
    expect(apiProblem(result.error)).toEqual({})
    expect(errorMessage(result.error)).not.toContain('gateway')
  })

  it('ignores malformed problem fields and trusts the HTTP status', () => {
    const error = {
      status: 403,
      data: { status: 200, code: 7, errors: 'not-an-array' },
    }
    expect(apiProblem(error)).toEqual({ status: 403 })
    expect(errorMessage(error)).toBe('You do not have permission to do that.')
    expect(
      apiProblem({ status: 422, data: { ...envelope(400), status: 400 } })
        .status,
    ).toBe(422)
  })
})

it('renews the CSRF nonce when retrying a protected write after refresh', async () => {
  let refreshed = false
  let csrfReads = 0
  server.use(
    http.get(`${base}auth/csrf`, () => {
      csrfReads++
      return HttpResponse.json({
        token: refreshed ? 'csrf-after-refresh' : 'csrf-before-refresh',
      })
    }),
    http.post(`${base}auth/refresh`, () => {
      refreshed = true
      return HttpResponse.json({
        accessToken: 'renewed-access',
        expiresIn: 300,
      })
    }),
    http.delete(`${base}protected-write`, ({ request }) => {
      if (request.headers.get('Authorization') !== 'Bearer renewed-access')
        return HttpResponse.json(envelope(401), { status: 401 })
      if (request.headers.get('X-XSRF-TOKEN') !== 'csrf-after-refresh')
        return HttpResponse.json(envelope(403), { status: 403 })
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const client = boundary(true)
  client.store.dispatch(
    identityReceived({
      user: {
        id: 'synthetic',
        email: 'synthetic@example.test',
        displayName: 'Synthetic',
        verified: true,
      },
      memberships: [],
    }),
  )
  client.store.dispatch(
    tokenReceived({ accessToken: 'expired-access', expiresIn: 300 }),
  )
  const result = await client.run({ url: 'protected-write', method: 'DELETE' })
  expect(result.error).toBeUndefined()
  expect(csrfReads).toBe(3)
})

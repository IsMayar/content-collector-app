import '@/mocks/agencyFiles'
import '@/mocks/collaboration'
import '@/mocks/collection'
import '@/mocks/commercial'
import type { MockAccount } from '@/mocks/fixtures'
import { accountFixtures, agencyId } from '@/mocks/fixtures'
import { productDb, resetProductDb, uid } from '@/mocks/productDb'
import { productHandlers } from '@/mocks/productHandlers'
import '@/mocks/review'
import { apiBaseUrl } from '@/services/api/baseQuery'
import { delay, http, HttpResponse } from 'msw'

export const mockState = {
  accounts: accountFixtures(),
  activeEmail: null as string | null,
  token: '',
  csrf: 'synthetic-csrf',
  usedTokens: new Set<string>(),
  lastRegistered: 'unverified@studio.example',
  resetEmail: 'owner@studio.example',
  acceptedInvitation: false,
}
export function resetMockState() {
  resetProductDb()
  Object.assign(mockState, {
    accounts: accountFixtures(),
    activeEmail: null,
    token: '',
    usedTokens: new Set<string>(),
    lastRegistered: 'unverified@studio.example',
    resetEmail: 'owner@studio.example',
    acceptedInvitation: false,
  })
}
const root = new URL(
  apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`,
  typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:5173',
).href
const url = (path: string) => `${root}${path}`
function problem(status: number, code: string) {
  return HttpResponse.json(
    {
      type: 'about:blank',
      title: 'Request could not be completed',
      status,
      code,
      detail: 'Synthetic development scenario.',
      traceId: 'mock-trace',
      errors: [],
    },
    { status },
  )
}
const json = (data: Record<string, unknown>, status = 200) =>
  HttpResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
const csrfValid = (request: Request) =>
  request.headers.get('X-XSRF-TOKEN') === mockState.csrf
const account = () =>
  mockState.activeEmail ? mockState.accounts[mockState.activeEmail] : undefined
const authorized = (request: Request) =>
  !!account() &&
  request.headers.get('Authorization') === `Bearer ${mockState.token}`
function tokenError(token: string, purpose: string) {
  if (
    mockState.usedTokens.has(`${purpose}:${token}`) ||
    token.endsWith('consumed')
  )
    return problem(410, 'TOKEN_CONSUMED')
  if (token.endsWith('expired')) return problem(410, 'TOKEN_EXPIRED')
  if (token !== `${purpose}-valid`) return problem(400, 'TOKEN_INVALID')
  return null
}
function mutation(
  path: string,
  handler: (request: Request) => Promise<Response> | Response,
) {
  return http.post(url(path), async ({ request }) => {
    await delay(180)
    return csrfValid(request) ? handler(request) : problem(403, 'CSRF_INVALID')
  })
}
export const handlers = [
  http.get(url('auth/csrf'), () => json({ token: mockState.csrf })),
  mutation('auth/login', async (request) => {
    const body = (await request.json()) as { email: string; password: string }
    if (body.email === 'offline@studio.example') return HttpResponse.error()
    if (body.email === 'busy@studio.example')
      return problem(429, 'RATE_LIMITED')
    const user = mockState.accounts[body.email.toLowerCase()]
    if (!user || user.password !== body.password)
      return problem(401, 'INVALID_CREDENTIALS')
    if (!user.user.verified) return problem(403, 'EMAIL_NOT_VERIFIED')
    mockState.activeEmail = user.user.email
    mockState.token = `mock-access-${user.user.id}`
    return json({
      accessToken: mockState.token,
      expiresIn: 300,
      user: user.user,
    })
  }),
  mutation('auth/refresh', () =>
    account()
      ? json({ accessToken: mockState.token, expiresIn: 300 })
      : problem(401, 'SESSION_EXPIRED'),
  ),
  mutation('auth/logout', (request) => {
    if (!authorized(request)) return problem(401, 'SESSION_EXPIRED')
    mockState.activeEmail = null
    mockState.token = ''
    return new HttpResponse(null, { status: 204 })
  }),
  http.get(url('me'), ({ request }) => {
    const user = account()
    return user && authorized(request)
      ? json({ user: user.user, memberships: user.memberships })
      : problem(401, 'SESSION_EXPIRED')
  }),
  http.get(url('workspaces'), ({ request }) =>
    authorized(request)
      ? json({ data: account()!.memberships })
      : problem(401, 'SESSION_EXPIRED'),
  ),
  mutation('auth/register', async (request) => {
    const body = (await request.json()) as {
      email: string
      password: string
      displayName: string
    }
    const email = body.email.toLowerCase()
    if (!mockState.accounts[email]) {
      mockState.accounts[email] = {
        user: {
          id: crypto.randomUUID(),
          email,
          displayName: body.displayName,
          verified: false,
        },
        memberships: [],
        password: body.password,
      } satisfies MockAccount
      mockState.lastRegistered = email
    }
    return json({ message: 'Check your email for the next steps.' }, 202)
  }),
  mutation('auth/verify-email', async (request) => {
    const { token } = (await request.json()) as { token: string }
    const error = tokenError(token, 'verify')
    if (error) return error
    mockState.accounts[mockState.lastRegistered].user.verified = true
    mockState.usedTokens.add(`verify:${token}`)
    return json({ verified: true })
  }),
  mutation('auth/resend-verification', () =>
    json(
      { message: 'If verification is needed, a fresh link will be sent.' },
      202,
    ),
  ),
  mutation('auth/forgot-password', async (request) => {
    const { email } = (await request.json()) as { email: string }
    if (mockState.accounts[email]) mockState.resetEmail = email
    return json(
      { message: 'If an account matches, instructions will be sent.' },
      202,
    )
  }),
  mutation('auth/reset-password', async (request) => {
    const { token, password } = (await request.json()) as {
      token: string
      password: string
    }
    const error = tokenError(token, 'reset')
    if (error) return error
    mockState.accounts[mockState.resetEmail].password = password
    mockState.usedTokens.add(`reset:${token}`)
    mockState.activeEmail = null
    mockState.token = ''
    return json({ message: 'Password reset.' })
  }),
  mutation('team-invitations/accept', async (request) => {
    if (!authorized(request)) return problem(401, 'SESSION_EXPIRED')
    const { token } = (await request.json()) as { token: string }
    for (const w of Object.values(productDb.workspaces)) {
      const invite = w.pendingInvites.find((i) => i.id === token)
      if (!invite) continue
      if (
        invite.state !== 'PENDING' ||
        new Date(invite.expiresAt).getTime() < Date.now()
      )
        return problem(410, 'INVITATION_EXPIRED')
      const user = account()!
      if (user.user.email.toLowerCase() !== invite.email.toLowerCase())
        return problem(403, 'INVITATION_EMAIL_MISMATCH')
      if (!request.headers.get('Idempotency-Key'))
        return problem(400, 'IDEMPOTENCY_REQUIRED')
      const memberId = uid()
      const membership = {
        memberId,
        workspaceId: w.workspace.id,
        workspaceName: w.workspace.name,
        role: 'MEMBER' as const,
      }
      w.members.push({
        id: memberId,
        user: user.user,
        role: 'MEMBER',
        state: 'ACTIVE',
      })
      user.memberships.push(membership)
      invite.state = 'CONSUMED'
      w.usage.seatsReserved--
      w.usage.seatsUsed++
      return json({ membership })
    }
    const error = tokenError(token, 'invite')
    if (error) return error
    if (account()?.user.email !== 'member@studio.example')
      return problem(403, 'INVITATION_EMAIL_MISMATCH')
    if (!request.headers.get('Idempotency-Key'))
      return problem(400, 'IDEMPOTENCY_REQUIRED')
    mockState.usedTokens.add(`invite:${token}`)
    mockState.acceptedInvitation = true
    return json({
      membership: account()!.memberships.find(
        (m) => m.workspaceId === agencyId,
      ),
    })
  }),
  ...productHandlers,
  http.all(url('*'), () => problem(501, 'MOCK_NOT_IMPLEMENTED')),
]

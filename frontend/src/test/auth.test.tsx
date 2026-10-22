import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from '@/app/router'
import { createAppStore } from '@/app/store'
import { Notifications } from '@/components/Feedback'
import { demoPassword, agencyId, soloId } from '@/mocks/fixtures'
import { safeReturnDestination } from '@/lib/returnDestination'
import { mockState } from '@/mocks/handlers'
import { clientApi } from '@/api/clientApi'
import { authApi } from '@/features/auth/authApi'
import { server } from './setup'
import { delay, http, HttpResponse } from 'msw'

function mount(path = '/sign-in') {
  const store = createAppStore()
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <Provider store={store}>
      <Notifications>
        <RouterProvider router={router} />
      </Notifications>
    </Provider>,
  )
  return { store, router, user: userEvent.setup() }
}
async function signIn(
  user: ReturnType<typeof userEvent.setup>,
  email = 'owner@studio.example',
  password = demoPassword,
) {
  await user.type(await screen.findByLabelText('Email address'), email)
  await user.type(screen.getByLabelText('Password', { exact: true }), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('safe return destinations', () => {
  it.each([
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/%2f%2fevil.test',
    '/app/../sign-in',
    '/sign-in',
    '/app%0aevil',
    'javascript:alert(1)',
  ])('rejects %s', (input) => {
    expect(safeReturnDestination(input)).toBe('/app')
  })
  it('preserves a permitted internal workspace path', () => {
    expect(
      safeReturnDestination(`/app/w/${agencyId}/overview?tab=content`),
    ).toBe(`/app/w/${agencyId}/overview?tab=content`)
  })
})
describe('authentication through real RTK Query requests intercepted by MSW', () => {
  it('redirects protected routes and preserves a safe destination', async () => {
    const { router } = mount(`/app/w/${agencyId}/overview`)
    await screen.findByRole('heading', { name: 'Sign in to your workspace' })
    expect(router.state.location.pathname).toBe('/sign-in')
    expect(
      new URLSearchParams(router.state.location.search).get('returnTo'),
    ).toBe(`/app/w/${agencyId}/overview`)
  })
  it('validates fields without sending a login', async () => {
    const { user } = mount()
    await user.click(await screen.findByRole('button', { name: 'Sign in' }))
    expect(
      await screen.findByText('Enter a valid email address.'),
    ).toBeVisible()
    expect(screen.getByText('Enter your password.')).toBeVisible()
    expect(mockState.activeEmail).toBeNull()
    expect(screen.getByLabelText('Email address')).toHaveFocus()
  })
  it('signs in, follows the return destination and keeps tokens out of browser storage', async () => {
    const { user, router, store } = mount(
      `/sign-in?returnTo=${encodeURIComponent(`/app/w/${agencyId}/overview`)}`,
    )
    await signIn(user)
    await screen.findByRole('heading', { name: 'Welcome, Alex' })
    expect(router.state.location.pathname).toBe(`/app/w/${agencyId}/overview`)
    expect(store.getState().auth.status).toBe('authenticated')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })
  it('shows invalid credentials and never enters protected content', async () => {
    const { user, store } = mount()
    await signIn(user, 'owner@studio.example', 'incorrect-password')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email or password is incorrect',
    )
    expect(store.getState().auth.status).toBe('anonymous')
  })
  it('uses a generic recovery confirmation for an unknown address', async () => {
    const { user } = mount('/forgot-password')
    await user.type(
      await screen.findByLabelText('Email address'),
      'unknown@example.test',
    )
    await user.click(
      screen.getByRole('button', { name: 'Send reset instructions' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'If an account matches that email',
    )
  })
  it('does not follow an external return destination after login', async () => {
    const { user, router } = mount('/sign-in?returnTo=https://evil.test')
    await signIn(user)
    await screen.findByRole('heading', { name: 'Welcome, Alex' })
    expect(router.state.location.pathname).toBe(`/app/w/${agencyId}/overview`)
  })
  it('clears both API caches and local session after confirmed logout', async () => {
    const { user, store } = mount()
    await signIn(user)
    await screen.findByRole('heading', { name: 'Welcome, Alex' })
    const clientWithProbe = clientApi.injectEndpoints({
      endpoints: (build) => ({
        testProbe: build.query<{ private: boolean }, void>({
          queryFn: () => ({ data: { private: true } }),
        }),
      }),
    })
    await store
      .dispatch(clientWithProbe.endpoints.testProbe.initiate())
      .unwrap()
    expect(Object.keys(store.getState().clientApi.queries)).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    const dialog = await screen.findByRole('dialog')
    const buttons = dialog.querySelectorAll('button')
    await user.click(buttons[1])
    await screen.findByRole('heading', { name: 'Sign in to your workspace' })
    expect(store.getState().auth.accessToken).toBeNull()
    expect(store.getState().auth.memberships).toEqual([])
    expect(store.getState().agencyApi.queries).toEqual({})
    expect(store.getState().clientApi.queries).toEqual({})
  })
  it('hides owner navigation and denies its route for a member', async () => {
    const { user, router } = mount()
    await signIn(user, 'member@studio.example')
    await screen.findByRole('heading', { name: 'Welcome, Jamie' })
    expect(
      screen.queryByRole('link', { name: /Owner access/ }),
    ).not.toBeInTheDocument()
    await router.navigate(`/app/w/${agencyId}/access-foundation`)
    expect(
      await screen.findByRole('heading', {
        name: 'This space isn’t available to your account',
      }),
    ).toBeVisible()
  })
  it('switches workspace and changes owner navigation to member navigation', async () => {
    const { user, store } = mount()
    await signIn(user)
    await screen.findByRole('heading', { name: 'Welcome, Alex' })
    await user.selectOptions(screen.getByLabelText('Workspace'), soloId)
    await waitFor(() => expect(store.getState().auth.workspaceId).toBe(soloId))
    expect(
      screen.queryByRole('link', { name: /Owner access/ }),
    ).not.toBeInTheDocument()
  })
  it('shows expired verification feedback without claiming success', async () => {
    const { user } = mount('/verify-email')
    await user.type(
      await screen.findByLabelText('Email link code'),
      'verify-expired',
    )
    await user.click(screen.getByRole('button', { name: 'Verify email' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This link has expired',
    )
  })
  it('restores a server-side session through refresh and /me', async () => {
    mockState.activeEmail = 'solo@studio.example'
    mockState.token = 'synthetic-existing-session'
    const { store } = mount('/app')
    await screen.findByRole('heading', { name: 'Welcome, Sam' })
    expect(store.getState().auth.workspaceId).toBe(soloId)
  })
  it('shares one refresh across concurrent expired bearer requests', async () => {
    const { user, store } = mount()
    await signIn(user)
    await screen.findByRole('heading', { name: 'Welcome, Alex' })
    let refreshCount = 0
    server.use(
      http.post('http://localhost:5173/api/v1/auth/refresh', async () => {
        refreshCount++
        await delay(100)
        mockState.token = 'rotated-token'
        return HttpResponse.json({
          accessToken: mockState.token,
          expiresIn: 300,
        })
      }),
      http.get('http://localhost:5173/api/v1/probe/:id', ({ request }) =>
        request.headers.get('Authorization') === 'Bearer rotated-token'
          ? HttpResponse.json({ ok: true })
          : HttpResponse.json({}, { status: 401 }),
      ),
    )
    const probes = authApi.injectEndpoints({
      endpoints: (build) => ({
        probe: build.query<{ ok: boolean }, number>({
          query: (id) => `probe/${id}`,
        }),
      }),
    })
    const results = await Promise.all(
      [1, 2].map((id) =>
        store.dispatch(probes.endpoints.probe.initiate(id)).unwrap(),
      ),
    )
    expect(results).toEqual([{ ok: true }, { ok: true }])
    expect(refreshCount).toBe(1)
  })
  it('clears identity and private caches when refresh confirms session expiry', async () => {
    const { user, store } = mount()
    await signIn(user)
    await screen.findByRole('heading', { name: 'Welcome, Alex' })
    mockState.activeEmail = null
    await store.dispatch(
      authApi.endpoints.me.initiate(undefined, {
        forceRefetch: true,
        subscribe: false,
      }),
    )
    await waitFor(() => expect(store.getState().auth.status).toBe('anonymous'))
    expect(store.getState().auth.accessToken).toBeNull()
    expect(store.getState().agencyApi.queries).toEqual({})
  })
  it('keeps entered email after a network sign-in failure', async () => {
    const { user } = mount()
    await signIn(user, 'offline@studio.example')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Check your connection',
    )
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'offline@studio.example',
    )
  })
  it('resets a valid password without automatically signing the account in', async () => {
    const { user, store } = mount('/reset-password')
    await user.type(
      await screen.findByLabelText('Email link code'),
      'reset-valid',
    )
    await user.type(
      screen.getByLabelText('New password', { exact: true }),
      'UpdatedPassword2026',
    )
    await user.type(
      screen.getByLabelText('Confirm password', { exact: true }),
      'UpdatedPassword2026',
    )
    await user.click(screen.getByRole('button', { name: 'Reset password' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your password was reset',
    )
    expect(store.getState().auth.status).toBe('anonymous')
    expect(mockState.accounts['owner@studio.example'].password).toBe(
      'UpdatedPassword2026',
    )
  })
})

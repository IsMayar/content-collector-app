import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { Provider } from 'react-redux'
import { createAppStore } from '@/app/store/store'
import {
  StatusSharePage,
  captureStatusFragment,
} from '@/features/analytics/pages/StatusSharePage'
import { statusCounts, statusApi } from '@/features/analytics/api/statusApi'
import { tokenReceived } from '@/features/auth/store/authSlice'
import { HttpResponse, http } from 'msw'
import { expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { server } from './setup'
const base = 'http://localhost:5173/api/v1/'
const counts = {
  alias: 'Evergreen',
  approved: 1,
  submitted: 2,
  requiredTotal: 3,
  updatedAt: '2026-11-03T00:00:00Z',
}
it('removes the fragment immediately and never persists the capability', () => {
  history.replaceState(null, '', '/status/share#token=synthetic-capability')
  expect(captureStatusFragment()).toBe('synthetic-capability')
  expect(location.hash).toBe('')
  expect(localStorage.getItem('synthetic-capability')).toBeNull()
  expect(sessionStorage.getItem('synthetic-capability')).toBeNull()
})
it('rejects extra identity or content fields in public count responses', () => {
  expect(statusCounts.safeParse(counts).success).toBe(true)
  expect(
    statusCounts.safeParse({ ...counts, projectType: 'WEBSITE' }).success,
  ).toBe(false)
  expect(statusCounts.safeParse({ ...counts, answers: [] }).success).toBe(false)
})
it('uses credential-free status transport without attaching or refreshing agency identity', async () => {
  const store = createAppStore()
  store.dispatch(
    tokenReceived({ accessToken: 'private-agency-token', expiresIn: 300 }),
  )
  let calls = 0
  server.use(
    http.post(base + 'status-shares/exchange', async ({ request }) => {
      calls++
      expect(request.credentials).toBe('omit')
      expect(request.headers.get('Authorization')).toBeNull()
      expect(request.headers.get('X-XSRF-TOKEN')).toBeNull()
      return HttpResponse.json({ readToken: 'status-only' })
    }),
    http.get(base + 'status-shares/share/counts', ({ request }) => {
      calls++
      expect(request.credentials).toBe('omit')
      expect(request.headers.get('Authorization')).toBeNull()
      expect(request.headers.get('X-Status-Token')).toBe('status-only')
      return HttpResponse.json(counts)
    }),
  )
  const read = await store
    .dispatch(
      statusApi.endpoints.exchangeStatus.initiate({
        shareId: 'share',
        token: 'capability',
      }),
    )
    .unwrap()
  expect(
    await store
      .dispatch(
        statusApi.endpoints.statusCounts.initiate({
          shareId: 'share',
          readToken: read.readToken,
        }),
      )
      .unwrap(),
  ).toEqual(counts)
  expect(calls).toBe(2)
  expect(store.getState().auth.accessToken).toBe('private-agency-token')
  store.dispatch(statusApi.util.resetApiState())
})
it('clears displayed counts after revocation and keeps errors generic', async () => {
  const store = createAppStore()
  let revoked = false
  server.use(
    http.post(base + 'status-shares/exchange', () =>
      HttpResponse.json({ readToken: 'read' }),
    ),
    http.get(base + 'status-shares/share/counts', () =>
      revoked
        ? HttpResponse.json({ status: 404 }, { status: 404 })
        : HttpResponse.json(counts),
    ),
  )
  history.replaceState(null, '', '/status/share#token=capability')
  render(
    <StrictMode>
      <Provider store={store}>
        <MemoryRouter initialEntries={['/status/share#token=capability']}>
          <Routes>
            <Route path="/status/:shareId" element={<StatusSharePage />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    </StrictMode>,
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'View shared status' }),
  )
  expect(
    await screen.findByRole('heading', { name: 'Evergreen' }),
  ).toBeInTheDocument()
  revoked = true
  await userEvent.click(screen.getByRole('button', { name: 'Refresh counts' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'unavailable, revoked or expired',
  )
  expect(
    screen.queryByRole('heading', { name: 'Evergreen' }),
  ).not.toBeInTheDocument()
})

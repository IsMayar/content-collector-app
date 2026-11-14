import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { expect, it, vi } from 'vitest'
import { ProfileDropdown } from '@/features/settings/components/ProfileDropdown'
import { SettingsPage } from '@/features/settings/pages/SettingsPage'

vi.mock('@/shared/hooks/useWorkspace', () => ({
  useWorkspace: () => ({
    id: 'w',
    base: '/app/w/w',
    owner: true,
    user: { displayName: 'Alex Morgan', email: 'alex@example.test' },
  }),
}))
vi.mock('@/services/api/resourceApi', () => ({
  useData: () => ({ isLoading: false, data: undefined }),
}))
vi.mock('@/shared/hooks/useCommand', () => ({
  useCommand: () => ({ run: vi.fn(), pending: false }),
}))
vi.mock('@/features/auth/components/AccountPanel', () => ({
  AccountPanel: () => <div>Account controls</div>,
}))
vi.mock('@/features/analytics/components/DigestPreview', () => ({
  DigestPreview: () => <div>Digest controls</div>,
}))
vi.mock('@/features/billing/pages/BillingPage', () => ({
  BillingPage: () => <div>Billing controls</div>,
}))
function Location() {
  const location = useLocation()
  return (
    <output aria-label="Location">
      {location.pathname + location.search + location.hash}
    </output>
  )
}
function dropdown(onSignOut = vi.fn()) {
  return render(
    <MemoryRouter>
      <ProfileDropdown
        name="Alex Morgan"
        email="alex@example.test"
        base="/app/w/w"
        onSignOut={onSignOut}
      />
      <button>Outside</button>
      <Location />
    </MemoryRouter>,
  )
}
it('provides workspace-aware links and closes after Notifications navigation', async () => {
  const user = userEvent.setup()
  dropdown()
  await user.click(screen.getByRole('button', { name: 'Profile and settings' }))
  expect(screen.getByText('AM')).toBeInTheDocument()
  expect(screen.getByText('alex@example.test')).toBeInTheDocument()
  expect(screen.getAllByRole('link')).toHaveLength(5)
  expect(screen.queryByRole('link', { name: /team/i })).not.toBeInTheDocument()
  await user.click(screen.getByRole('link', { name: /Notifications/ }))
  expect(screen.getByLabelText('Location')).toHaveTextContent(
    '/app/w/w/settings?view=account#daily-digest',
  )
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
})
it('supports keyboard opening, tabbing, Escape focus restoration, outside click and toggle', async () => {
  const user = userEvent.setup()
  dropdown()
  const trigger = screen.getByRole('button', { name: 'Profile and settings' })
  trigger.focus()
  await user.keyboard('{Enter}')
  await user.tab()
  expect(screen.getByRole('link', { name: /My account/ })).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(trigger).toHaveFocus()
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await user.click(trigger)
  await user.click(screen.getByRole('button', { name: 'Outside' }))
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await user.click(trigger)
  await user.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
})
it('delegates sign out to the existing workflow', async () => {
  const user = userEvent.setup()
  const logout = vi.fn()
  dropdown(logout)
  await user.click(screen.getByRole('button', { name: 'Profile and settings' }))
  await user.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(logout).toHaveBeenCalledOnce()
})
it('redirects the legacy Settings Team link to the canonical Team route', () => {
  render(
    <MemoryRouter initialEntries={['/app/w/w/settings?view=team']}>
      <Routes>
        <Route path="/app/w/w/settings" element={<SettingsPage />} />
        <Route path="/app/w/w/team" element={<h1>Canonical Team</h1>} />
      </Routes>
    </MemoryRouter>,
  )
  expect(
    screen.getByRole('heading', { name: 'Canonical Team' }),
  ).toBeInTheDocument()
})
it('keeps workspace configuration without embedded team controls or a secondary sidebar', () => {
  render(
    <MemoryRouter initialEntries={['/app/w/w/settings?view=workspace']}>
      <SettingsPage />
    </MemoryRouter>,
  )
  expect(
    screen.getByRole('heading', { name: 'Workspace settings' }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('navigation', { name: 'Settings navigation' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: 'Team' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: 'Workspace ownership' }),
  ).not.toBeInTheDocument()
})
it('focuses the existing Daily digest section from Notifications', () => {
  const scroll = vi.fn()
  HTMLElement.prototype.scrollIntoView = scroll
  render(
    <MemoryRouter
      initialEntries={['/app/w/w/settings?view=account#daily-digest']}
    >
      <SettingsPage />
    </MemoryRouter>,
  )
  expect(screen.getByRole('region', { name: 'Daily digest' })).toHaveFocus()
  expect(scroll).toHaveBeenCalled()
})

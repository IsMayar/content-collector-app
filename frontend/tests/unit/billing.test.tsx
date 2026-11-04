import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { BillingPage } from '@/features/billing/pages/BillingPage'
import {
  billingDestination,
  subscriptionResponse,
} from '@/features/billing/api/billingApi'

const fake = vi.hoisted(() => ({
  run: vi.fn(),
  owner: true,
  read: vi.fn(),
  usage: vi.fn(),
}))
vi.mock('@/features/billing/api/billingApi', async (original) => ({
  ...(await original<typeof import('@/features/billing/api/billingApi')>()),
  useBillingSubscriptionQuery: fake.read,
}))
vi.mock('@/shared/hooks/useWorkspace', () => ({
  useWorkspace: () => ({
    id: 'workspace',
    owner: fake.owner,
    base: '/app/w/workspace',
  }),
}))
vi.mock('@/shared/hooks/useCommand', () => ({
  useCommand: () => ({ run: fake.run, error: '', pending: false }),
}))
vi.mock('@/services/api/resourceApi', () => ({ useData: fake.usage }))
const subscription = {
  planKey: 'SOLO',
  state: 'TRIALING',
  currentPeriodStart: '2026-11-04T00:00:00Z',
  currentPeriodEnd: '2026-11-18T00:00:00Z',
  cancelAtPeriodEnd: false,
  graceEndsAt: null,
  readOnlyEndsAt: null,
}
beforeEach(() => {
  fake.owner = true
  fake.run.mockReset().mockResolvedValue(undefined)
  fake.read
    .mockReset()
    .mockReturnValue({ data: subscription, refetch: vi.fn() })
  fake.usage.mockReset().mockReturnValue({})
})
it('validates the original wrapped subscription contract', () => {
  expect(
    subscriptionResponse.safeParse({
      subscription,
      entitlements: { planKey: 'SOLO', seats: 1 },
    }).success,
  ).toBe(true)
  expect(subscriptionResponse.safeParse(subscription).success).toBe(false)
  expect(
    subscriptionResponse.safeParse({
      subscription: { ...subscription, state: 'PAID' },
      entitlements: {},
    }).success,
  ).toBe(false)
})
it('restricts hosted destinations and allows demo redirects only with explicit mocks', () => {
  for (const host of ['checkout.stripe.com', 'billing.stripe.com'])
    expect(
      billingDestination(
        `https://${host}/session`,
        'https://collector.test',
        false,
      ),
    ).toBeTruthy()
  for (const url of [
    'javascript:alert(1)',
    'https://checkout.stripe.com.evil.test/',
    'https://evil.test/',
    'http://checkout.stripe.com/',
    'https://user@billing.stripe.com/',
    'https://billing.stripe.com:8443/',
  ])
    expect(billingDestination(url, 'https://collector.test', false)).toBeNull()
  const demo = '/app/w/test/billing?hosted=demo'
  expect(billingDestination(demo, 'https://collector.test', false)).toBeNull()
  expect(billingDestination(demo, 'https://collector.test', true)).toBeTruthy()
})
it('does not activate a plan from return parameters or request T33 usage on billing', () => {
  render(
    <MemoryRouter
      initialEntries={['/billing?view=status&plan=AGENCY&success=true']}
    >
      <BillingPage />
    </MemoryRouter>,
  )
  expect(screen.getAllByText('TRIALING').length).toBeGreaterThan(0)
  expect(fake.run).not.toHaveBeenCalled()
  expect(fake.usage).toHaveBeenCalledWith('workspaces/workspace/usage', {
    skip: true,
  })
})
it('keeps a stable in-memory checkout retry key and sends only the selected plan', async () => {
  render(
    <MemoryRouter>
      <BillingPage />
    </MemoryRouter>,
  )
  const button = screen.getByRole('button', { name: 'Choose solo' })
  await userEvent.click(button)
  await userEvent.click(button)
  expect(fake.run).toHaveBeenCalledTimes(2)
  const first = fake.run.mock.calls[0]
  expect(first.slice(0, 3)).toEqual([
    'workspaces/workspace/billing/checkout',
    { planKey: 'SOLO' },
    'POST',
  ])
  expect(first[3]['Idempotency-Key']).toBe(
    fake.run.mock.calls[1][3]['Idempotency-Key'],
  )
})
it('shows invalid hosted destinations as an error instead of navigating', async () => {
  fake.run.mockResolvedValue({ url: 'https://evil.test/session' })
  render(
    <MemoryRouter>
      <BillingPage />
    </MemoryRouter>,
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Manage in hosted billing portal' }),
  )
  expect(screen.getByText(/invalid billing destination/)).toBeInTheDocument()
})
it('keeps owner-only billing controls unavailable to members', () => {
  fake.owner = false
  render(
    <MemoryRouter>
      <BillingPage />
    </MemoryRouter>,
  )
  expect(screen.getByText('Owner access required')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Choose solo' }),
  ).not.toBeInTheDocument()
  expect(fake.read).toHaveBeenCalledWith(
    'workspace',
    expect.objectContaining({ skip: true }),
  )
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { BillingPage } from '@/features/billing/pages/BillingPage'
import { WorkspaceBillingNotice } from '@/features/billing/components/WorkspaceBillingNotice'
import {
  billingDestination,
  subscriptionResponse,
  usageResponse,
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
  useBillingUsageQuery: fake.usage,
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
  expect(fake.usage).toHaveBeenCalledWith('workspace', {
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

const usage = {
  periodStart: '2026-11-04T00:00:00Z',
  periodEnd: '2026-12-04T00:00:00Z',
  storageUsedBytes: 1000,
  storageReservedBytes: 1000,
  storageLimitBytes: 2000,
  aiDraftsUsed: 0,
  aiDraftAllowance: 0,
  aiDraftsReserved: 0,
  smsSegmentsUsed: 2,
  smsSegmentAllowance: 25,
  smsSegmentsReserved: 1,
  seatsUsed: 1,
  seatsReserved: 1,
  seatsLimit: 2,
  aiPeriodStart: '2026-11-01T00:00:00Z',
  aiPeriodEnd: '2026-12-01T00:00:00Z',
}
it('validates the usage envelope and rejects negative counters', () => {
  expect(usageResponse.safeParse({ usage }).success).toBe(true)
  expect(usageResponse.safeParse(usage).success).toBe(false)
  expect(
    usageResponse.safeParse({ usage: { ...usage, seatsReserved: -1 } }).success,
  ).toBe(false)
})
it('discloses reservations, limits and zero allowances without an invalid progressbar', () => {
  fake.usage.mockReturnValue({ data: usage })
  render(
    <MemoryRouter initialEntries={['/billing?view=usage']}>
      <BillingPage />
    </MemoryRouter>,
  )
  expect(fake.usage).toHaveBeenCalledWith('workspace', { skip: false })
  expect(
    screen.queryByRole('progressbar', { name: 'AI drafts usage' }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByText('No allowance is included in the current trial or plan.'),
  ).toBeInTheDocument()
  expect(screen.getByText(/1 active \+ 1 reserved/)).toBeInTheDocument()
  expect(screen.getByText(/2 used \+ 1 reserved/)).toBeInTheDocument()
  expect(screen.getAllByText(/Limit reached/)).toHaveLength(2)
  expect(
    screen.getByText(/AI resets on the UTC calendar month/),
  ).toBeInTheDocument()
})
it('explains grace using the server state and deadline', () => {
  fake.read.mockReturnValue({
    data: {
      ...subscription,
      state: 'PAST_DUE',
      graceEndsAt: '2026-11-11T00:00:00Z',
    },
  })
  render(
    <MemoryRouter>
      <BillingPage />
    </MemoryRouter>,
  )
  expect(
    screen.getByText(
      /Payment needs attention. Editing remains available until/,
    ),
  ).toBeInTheDocument()
})
it('explains read-only restrictions and the access deadline', () => {
  fake.read.mockReturnValue({
    data: {
      ...subscription,
      state: 'READ_ONLY',
      readOnlyEndsAt: '2026-12-04T00:00:00Z',
    },
  })
  render(
    <MemoryRouter>
      <BillingPage />
    </MemoryRouter>,
  )
  expect(
    screen.getByText(/Editing, AI, reminders and new invitations are paused/),
  ).toBeInTheDocument()
  expect(
    screen.getByText(/Authorized reads and exports are available until/),
  ).toBeInTheDocument()
})
it('explains scheduled cancellation without claiming editing has already stopped', () => {
  fake.read.mockReturnValue({
    data: { ...subscription, state: 'ACTIVE', cancelAtPeriodEnd: true },
  })
  render(
    <MemoryRouter>
      <BillingPage />
    </MemoryRouter>,
  )
  expect(screen.getByText(/Cancellation is scheduled for/)).toBeInTheDocument()
})
it('does not expose billing state notices or make an owner query for a member', () => {
  fake.read.mockReturnValue({ data: { ...subscription, state: 'PAST_DUE' } })
  render(
    <MemoryRouter>
      <WorkspaceBillingNotice workspace="workspace" owner={false} />
    </MemoryRouter>,
  )
  expect(screen.queryByText(/Payment needs attention/)).not.toBeInTheDocument()
  expect(fake.read).toHaveBeenCalledWith(
    'workspace',
    expect.objectContaining({ skip: true }),
  )
})

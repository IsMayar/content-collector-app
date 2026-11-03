import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { RemindersPanel } from '@/features/reminders/components/RemindersPanel'
import { ClientPreferences } from '@/features/client/components/ClientPreferences'
import { validateProductRead } from '@/services/api/resourceSchemas'
vi.mock('@/config/env', () => ({ env: { mocksEnabled: false } }))
const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  smsAvailable: false,
  timezone: 'Asia/Kabul' as string | null,
}))
const rule = {
  id: 'rule',
  channel: 'EMAIL',
  daysRelativeToDueDate: -3,
  localTime: '10:00',
  weekdaysOnly: true,
}
const policy = {
  version: 2,
  enabled: true,
  paused: false,
  timezone: 'Asia/Kabul',
  rules: [rule],
}
vi.mock('@/shared/hooks/useCommand', () => ({
  useCommand: () => ({ run: mocks.run, pending: false, error: '' }),
}))
vi.mock('@/services/api/resourceApi', () => ({
  useData: (path: string) => ({
    data: path.endsWith('reminder-policy')
      ? { policy }
      : path.endsWith('contacts')
        ? { data: [{ id: 'contact', name: 'Sarah', state: 'ACTIVE' }] }
        : { data: [] },
    isLoading: false,
    isError: false,
  }),
  usePortalData: () => ({
    data: {
      emailEnabled: true,
      timezone: mocks.timezone,
      smsStatus: 'NOT_CONFIGURED',
      smsAvailable: mocks.smsAvailable,
      smsConsentTextVersion: '2026-11-03',
      smsUsage: {
        allowance: 25,
        usedSegments: 2,
        reservedSegments: 1,
        spendingLimitMicrousd: 1000000,
      },
    },
    isError: false,
  }),
}))
beforeEach(() => {
  mocks.run.mockReset()
  mocks.smsAvailable = false
  mocks.timezone = 'Asia/Kabul'
})
it('reads wrapped policy and saves explicit enabled rules with optimistic version', async () => {
  mocks.run.mockResolvedValue({ policy })
  render(<RemindersPanel root="workspaces/w/projects/p" />)
  await userEvent.click(screen.getByRole('button', { name: 'Cadence' }))
  expect(screen.getByLabelText('Local delivery time')).toHaveValue('10:00')
  await userEvent.click(screen.getByLabelText('Enable rule'))
  await userEvent.click(screen.getByRole('button', { name: 'Save policy' }))
  expect(mocks.run).toHaveBeenCalledWith(
    'workspaces/w/projects/p/reminder-policy',
    expect.objectContaining({
      rules: [],
      expectedVersion: 2,
      timezone: 'Asia/Kabul',
    }),
    'PUT',
  )
  expect(await screen.findByText('Reminder policy saved.')).toBeInTheDocument()
})
it('uses wrapped preview and confirms queuing only after server acknowledgment', async () => {
  mocks.run.mockResolvedValueOnce({
    preview: {
      channel: 'EMAIL',
      subject: 'Reminder',
      body: 'Two required items',
      eligible: true,
      reasons: [],
      estimatedSegments: null,
    },
  })
  render(<RemindersPanel root="workspaces/w/projects/p" />)
  await userEvent.click(
    screen.getByRole('button', { name: 'Email & SMS preview' }),
  )
  await userEvent.selectOptions(screen.getByLabelText('Contact'), 'contact')
  await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
  expect(await screen.findByText('Two required items')).toBeInTheDocument()
  let finish!: (v: unknown) => void
  mocks.run.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await userEvent.click(screen.getByRole('button', { name: 'Send now' }))
  expect(screen.queryByText(/Reminder queued/)).not.toBeInTheDocument()
  finish({ jobId: 'job' })
  await waitFor(() =>
    expect(screen.getByText(/Reminder queued/)).toBeInTheDocument(),
  )
})
it('live email preferences never expose unimplemented SMS controls', async () => {
  mocks.run.mockResolvedValue({ preferences: { emailEnabled: false } })
  render(<ClientPreferences root="client/projects/p" emailOnly />)
  expect(
    screen.queryByRole('button', { name: 'Send verification code' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Opt out of SMS' }),
  ).not.toBeInTheDocument()
  await userEvent.click(screen.getByLabelText('Email reminders'))
  await userEvent.click(
    screen.getByRole('button', { name: 'Save preferences' }),
  )
  expect(mocks.run).toHaveBeenCalledWith(
    'client/projects/p/notification-preferences',
    { emailEnabled: false, timezone: 'Asia/Kabul' },
    'PUT',
  )
})
it('rejects obsolete policy and invalid delivery response shapes', () => {
  expect(
    validateProductRead('workspaces/w/projects/p/reminder-policy', policy)
      .success,
  ).toBe(false)
  expect(
    validateProductRead('workspaces/w/projects/p/reminder-policy', { policy })
      .success,
  ).toBe(true)
  expect(
    validateProductRead('workspaces/w/projects/p/deliveries', {
      data: [{ id: 'a', state: 'SENT' }],
    }).success,
  ).toBe(false)
})

it('uses recipient consent and catalog confirmation route without showing a synthetic real code', async () => {
  mocks.smsAvailable = true
  mocks.run
    .mockResolvedValueOnce({ verificationId: 'verification' })
    .mockResolvedValueOnce({ smsStatus: 'VERIFIED_OPTED_IN' })
  render(<ClientPreferences root="client/projects/p" />)
  expect(screen.getByText(/2 used, 1 reserved of 25/)).toBeInTheDocument()
  await userEvent.type(
    screen.getByLabelText('US mobile number'),
    '+12025550123',
  )
  await userEvent.click(screen.getByLabelText(/I agree/))
  await userEvent.click(
    screen.getByRole('button', { name: 'Send verification code' }),
  )
  expect(mocks.run).toHaveBeenCalledWith('client/projects/p/sms/verification', {
    phoneE164: '+12025550123',
    consent: true,
    consentTextVersion: '2026-11-03',
  })
  expect(
    screen.queryByText(/Synthetic verification code/),
  ).not.toBeInTheDocument()
  await userEvent.type(
    await screen.findByLabelText('Verification code'),
    '654321',
  )
  await userEvent.click(screen.getByRole('button', { name: /^Verify$/ }))
  expect(mocks.run).toHaveBeenLastCalledWith(
    'client/projects/p/sms/verification/confirm',
    { verificationId: 'verification', code: '654321' },
  )
  expect(
    await screen.findByText(
      'Your phone is verified and SMS reminders are enabled.',
    ),
  ).toBeInTheDocument()
})
it('does not report SMS consent success when the server rejects confirmation', async () => {
  mocks.smsAvailable = true
  mocks.run
    .mockResolvedValueOnce({ verificationId: 'verification' })
    .mockResolvedValueOnce(undefined)
  render(<ClientPreferences root="client/projects/p" />)
  await userEvent.type(
    screen.getByLabelText('US mobile number'),
    '+12025550123',
  )
  await userEvent.click(screen.getByLabelText(/I agree/))
  await userEvent.click(
    screen.getByRole('button', { name: 'Send verification code' }),
  )
  await userEvent.type(
    await screen.findByLabelText('Verification code'),
    '000000',
  )
  await userEvent.click(screen.getByRole('button', { name: /^Verify$/ }))
  expect(
    screen.queryByText('Your phone is verified and SMS reminders are enabled.'),
  ).not.toBeInTheDocument()
  expect(screen.getByLabelText('Verification code')).toHaveValue('000000')
})

it('email opt-out remains independent of SMS timezone enrollment', async () => {
  mocks.timezone = null
  mocks.run.mockResolvedValue({
    preferences: { emailEnabled: false, timezone: null },
  })
  render(<ClientPreferences root="client/projects/p" />)
  await userEvent.click(screen.getByLabelText('Email reminders'))
  await userEvent.click(
    screen.getByRole('button', { name: 'Save preferences' }),
  )
  expect(mocks.run).toHaveBeenCalledWith(
    'client/projects/p/notification-preferences',
    { emailEnabled: false, timezone: null },
    'PUT',
  )
  expect(await screen.findByText('Preferences saved.')).toBeInTheDocument()
})

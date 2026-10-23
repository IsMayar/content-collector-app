import { test, expect } from '@playwright/test'

const password = 'ContentDemo!2026'
test('keyboard sign-in, responsive workspace and confirmed logout', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/sign-in')
  await expect(
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible()
  await expect(page.getByLabel('Development environment')).toContainText(
    'Synthetic data',
  )
  await page.screenshot({
    path: info.outputPath('sign-in.png'),
    fullPage: true,
  })
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Email address')).toBeFocused()
  await page.getByLabel('Email address').fill('owner@studio.example')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Show password', exact: true }).click()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
    'type',
    'text',
  )
  await page.getByRole('button', { name: 'Hide password', exact: true }).click()
  await page.getByLabel('Password', { exact: true }).press('Enter')
  await expect(
    page.getByRole('heading', { name: 'Welcome back, Alex' }),
  ).toBeVisible()
  await expect(page.locator('main')).toBeFocused()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: info.outputPath('workspace.png'),
    fullPage: true,
  })
  if (info.project.name === 'phone') {
    await page.getByText('Workspace menu', { exact: true }).press('Enter')
    await expect(
      page.getByRole('navigation', { name: 'Mobile workspace navigation' }),
    ).toBeVisible()
  }
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Sign out of your account?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Sign out', exact: true }),
  ).toBeFocused()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await dialog.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 })
  expect(errors).toEqual([])
})

test('invalid credentials, recovery, and expired and consumed links', async ({
  page,
}, info) => {
  await page.goto('/sign-in')
  await page.getByLabel('Email address').fill('owner@studio.example')
  await page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Email or password is incorrect',
  )
  await page.screenshot({
    path: info.outputPath('sign-in-error.png'),
    fullPage: true,
  })
  await page.getByRole('link', { name: 'Forgot your password?' }).click()
  await page.getByLabel('Email address').fill('nobody@example.test')
  await page.getByRole('button', { name: 'Send reset instructions' }).click()
  await expect(page.getByRole('status')).toContainText(
    'If an account matches that email',
  )
  await page.goto('/reset-password#token=reset-expired')
  await expect(page.getByLabel('Email link code')).toHaveValue('reset-expired')
  await expect(page).toHaveURL(/\/reset-password$/)
  await page.getByLabel('New password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password', { exact: true }).fill(password)
  await page
    .getByRole('button', { name: 'Reset password', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('This link has expired')
  await page.goto('/verify-email#token=verify-consumed')
  await page.getByRole('button', { name: 'Verify email', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('already been used')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})

test('invitation survives sign-in and member navigation omits owner controls', async ({
  page,
}) => {
  await page.goto('/team-invite#token=invite-valid')
  await page.getByRole('link', { name: 'Sign in to accept' }).click()
  await page.getByLabel('Email address').fill('member@studio.example')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByLabel('Email link code')).toHaveValue('invite-valid')
  await page
    .getByRole('button', { name: 'Accept invitation', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText(
    'invitation was accepted',
  )
  await page.getByRole('link', { name: 'Open workspace', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Good morning, Jamie' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /Owner access/ })).toHaveCount(0)
})

test('registration validation, verification resend and client layout', async ({
  page,
}, info) => {
  await page.goto('/sign-up')
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click()
  await expect(
    page.getByText('Enter your name.', { exact: true }),
  ).toBeVisible()
  await page.getByLabel('Your name').fill('Robin Demo')
  await page.getByLabel('Email address').fill('robin@example.test')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password', { exact: true }).fill(password)
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText(
    'If your address can be registered',
  )
  await page
    .getByRole('link', { name: 'Verify your email', exact: true })
    .click()
  await page.getByText('Need a new verification link?', { exact: true }).click()
  await page.getByLabel('Email address').fill('robin@example.test')
  await page
    .getByRole('button', { name: 'Resend verification', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText(
    'If verification is needed',
  )
  await page.getByLabel('Email link code').fill('verify-valid')
  await page.getByRole('button', { name: 'Verify email', exact: true }).click()
  await expect(
    page.getByText('Your email is verified. You can now sign in.'),
  ).toBeVisible()
  await page.goto('/client/access')
  await expect(
    page.getByRole('heading', { name: 'A little detail. A big difference.' }),
  ).toBeVisible()
  await page.screenshot({
    path: info.outputPath('client-foundation.png'),
    fullPage: true,
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})

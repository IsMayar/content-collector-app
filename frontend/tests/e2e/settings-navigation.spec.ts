import { test, expect } from '@playwright/test'

test('profile settings and canonical Team navigation', async ({
  page,
}, info) => {
  await page.goto('/sign-in')
  await page.getByLabel('Email address').fill('owner@studio.example')
  await page.getByLabel('Password', { exact: true }).fill('ContentDemo!2026')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: /Welcome back,|Good morning,/ }),
  ).toBeVisible()
  const trigger = page.getByRole('button', { name: 'Profile and settings' })
  const workspacePath = new URL(page.url()).pathname.replace('/overview', '')
  await expect(trigger.locator('.account-avatar')).toBeVisible()
  await trigger.click()
  await page.getByRole('link', { name: /Workspace settings/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Workspace settings', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Workspace name', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Settings navigation' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Workspace ownership' }),
  ).toHaveCount(0)
  await expect(
    page
      .getByRole('navigation', { name: 'Workspace navigation', exact: true })
      .getByRole('link', { name: 'Settings', exact: true }),
  ).toHaveCount(0)
  for (const [label, heading] of [
    ['My account', 'My account'],
    ['Billing & usage', 'Billing & usage'],
    ['Privacy & data', 'Privacy & data'],
  ]) {
    await trigger.click()
    await page.getByRole('link', { name: new RegExp(label) }).click()
    await expect(
      page.getByRole('heading', { name: heading, exact: true }).first(),
    ).toBeVisible()
  }
  await trigger.click()
  await page.getByRole('link', { name: /Notifications/ }).click()
  await expect(page.getByRole('region', { name: 'Daily digest' })).toBeFocused()
  await trigger.click()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  // The opt-in mock session is in memory, so a hard deep link requires sign-in again.
  await page.goto(workspacePath + '/settings?view=team')
  await page.getByLabel('Email address').fill('owner@studio.example')
  await page.getByLabel('Password', { exact: true }).fill('ContentDemo!2026')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(new RegExp('/team$'))
  await expect(
    page.getByRole('heading', { name: 'Workspace ownership', exact: true }),
  ).toHaveCount(1)
  await page.getByRole('button', { name: /Invite member/ }).click()
  await expect(
    page.getByRole('dialog', { name: 'Invite a team member' }),
  ).toBeVisible()
  await page
    .getByRole('dialog', { name: 'Invite a team member' })
    .getByRole('button', { name: 'Cancel', exact: true })
    .click()
  await trigger.click()
  await expect(
    page.getByRole('navigation', { name: 'Personal and workspace settings' }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: info.outputPath('team-profile.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Sign out of your account?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(new RegExp('/sign-in$'))
})

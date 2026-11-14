import { test, expect } from '@playwright/test'
test('Client access approved layout', async ({ page }, info) => {
  await page.setViewportSize({ width: 1672, height: 941 })
  await page.goto('/sign-in')
  await page.getByLabel('Email address').fill('owner@studio.example')
  await page.getByLabel('Password', { exact: true }).fill('ContentDemo!2026')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: /Welcome back,|Good morning,/ }),
  ).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Workspace navigation', exact: true })
    .getByRole('link', { name: 'Projects', exact: true })
    .click()
  await page
    .getByRole('link', { name: 'Lamar Dental website', exact: true })
    .click()
  await page.getByRole('link', { name: 'Client access', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Project contacts', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Contact name', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible()
  await expect(
    page.getByLabel('Access expires (optional)', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'View project', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: info.outputPath('client-access.png'),
    fullPage: true,
  })
})

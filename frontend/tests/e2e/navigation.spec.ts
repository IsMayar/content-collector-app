import { test, expect, type Page } from '@playwright/test'

async function signIn(page: Page, member = false) {
  await page.goto('/sign-in')
  await page
    .getByLabel('Email address')
    .fill(member ? 'member@studio.example' : 'owner@studio.example')
  await page.getByLabel('Password', { exact: true }).fill('ContentDemo!2026')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: /Welcome back,|Good morning,/ }),
  ).toBeVisible()
}
async function openInApp(page: Page, url: string) {
  await page.evaluate((path) => {
    history.pushState(null, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, url)
}
async function workspaceLink(page: Page, name: string) {
  if ((page.viewportSize()?.width || 1440) < 768) {
    await page.getByText('Workspace menu', { exact: true }).click()
    await page
      .getByRole('navigation', { name: 'Mobile workspace navigation' })
      .getByRole('link', { name, exact: true })
      .click()
    await expect(
      page.getByRole('navigation', { name: 'Mobile workspace navigation' }),
    ).not.toBeVisible()
  } else
    await page
      .getByRole('navigation', { name: 'Workspace navigation', exact: true })
      .getByRole('link', { name, exact: true })
      .click()
}

test('assigned member follows project analytics and account without owner actions', async ({
  page,
}) => {
  await signIn(page, true)
  await workspaceLink(page, 'Projects')
  await page
    .getByRole('link', { name: 'Lamar Dental website', exact: true })
    .click()
  const projectUrl = page.url().split('?')[0]
  await page.getByRole('link', { name: 'Analytics', exact: true }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Submissions and approvals',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Counts-only status share', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: 'Client access', exact: true }),
  ).toHaveCount(0)
  await openInApp(page, projectUrl + '?tab=exports')
  await expect(
    page.getByRole('heading', { name: 'This project view is unavailable' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Back to content', exact: true }).click()
  await expect(page).toHaveURL(/tab=checklist/)
  await workspaceLink(page, 'My account')
  await expect(
    page.getByRole('heading', { name: 'My account', exact: true }),
  ).toBeVisible()
})

test('owner destinations, invalid tabs, history and workspace scope remain navigable', async ({
  page,
}) => {
  await signIn(page)
  await workspaceLink(page, 'Projects')
  await page
    .getByRole('link', { name: 'Lamar Dental website', exact: true })
    .click()
  const projectUrl = page.url().split('?')[0]
  await page.getByRole('link', { name: 'Client access', exact: true }).click()
  await expect(page).toHaveURL(/tab=access/)
  await page.getByRole('link', { name: 'Analytics', exact: true }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Submissions and approvals',
      exact: true,
    }),
  ).toBeVisible()
  await page.goBack()
  await expect(
    page.getByRole('heading', { name: 'Client access', exact: true }),
  ).toBeVisible()
  await openInApp(page, projectUrl + '?tab=unknown-view')
  await expect(
    page.getByRole('heading', { name: 'This project view is unavailable' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Back to content', exact: true }).click()
  await workspaceLink(page, 'Settings')
  const settingsUrl = page.url().split('?')[0]
  await openInApp(page, settingsUrl + '?view=unknown-view')
  await expect(
    page.getByRole('heading', { name: 'Workspace settings', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'My account', exact: true }).click()
  await page.goBack()
  await expect(
    page.getByRole('heading', { name: 'Workspace settings', exact: true }),
  ).toBeVisible()
  await openInApp(page, '/app/w/99999999-9999-4999-8999-999999999999/overview')
  await expect(
    page.getByRole('heading', {
      name: 'This space isn’t available to your account',
    }),
  ).toBeVisible()
  await page
    .getByRole('link', { name: 'Back to your workspace', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: /Welcome back,/ }),
  ).toBeVisible()
})

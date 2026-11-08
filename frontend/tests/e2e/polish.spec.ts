import { mainReady } from './helpers/readiness'
import { test, expect, type Page } from '@playwright/test'

async function signIn(page: Page) {
  await page.goto('/sign-in')
  await page.getByLabel('Email address').fill('owner@studio.example')
  await page.getByLabel('Password', { exact: true }).fill('ContentDemo!2026')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Welcome back, Alex' }),
  ).toBeVisible()
}
async function nav(page: Page, name: string) {
  if ((page.viewportSize()?.width || 1440) < 768) {
    await page.getByText('Workspace menu', { exact: true }).click()
    await page
      .getByRole('navigation', { name: 'Mobile workspace navigation' })
      .getByRole('link', { name, exact: true })
      .click()
  } else
    await page
      .getByRole('navigation', { name: 'Workspace navigation', exact: true })
      .getByRole('link', { name, exact: true })
      .click()
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
}

test('workspace header stays at the top while the dashboard scrolls', async ({
  page,
}) => {
  await page.setViewportSize({ ...page.viewportSize()!, height: 480 })
  await signIn(page)
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  )
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0)
  const header = page.getByRole('banner')
  await expect
    .poll(() =>
      header.evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBe(0)
  await header.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(
    page.getByRole('dialog', { name: 'Sign out of your account?' }),
  ).toBeVisible()
})

for (const [path, title] of [
  ['sign-in', 'Welcome back'],
  ['sign-up', 'Create your account'],
  ['verify-email', 'Verify your email'],
  ['forgot-password', 'Reset your password'],
  ['reset-password', 'Choose a new password'],
  ['team-invite', 'You’re invited to join'],
]) {
  test(`authentication layout: ${path} keeps brand styling and accessible actions`, async ({
    page,
  }, info) => {
    await page.goto('/' + path)
    await mainReady(page)
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible()
    await expect(page.locator('.auth-refresh .auth-story')).toBeVisible()
    expect(await page.locator('body').innerText()).not.toMatch(/[→←↗↑↓]/)
    await noOverflow(page)
    await page.screenshot({
      path: info.outputPath(`auth-${path}.png`),
      fullPage: true,
    })
  })
}

test('customer choice creates a new customer and keeps existing selection separate', async ({
  page,
}, info) => {
  await signIn(page)
  await nav(page, 'Templates')
  await page
    .locator('.template-card')
    .first()
    .getByRole('link', { name: 'Use template', exact: true })
    .click()
  await page.getByRole('radio', { name: /Add a new customer/ }).check()
  await expect(page.getByLabel('Customer', { exact: true })).toBeDisabled()
  await page
    .getByLabel('Business name', { exact: true })
    .fill('Polish Customer')
  await page.getByLabel('Contact name', { exact: true }).fill('Taylor Test')
  await page
    .getByLabel('Customer email', { exact: true })
    .fill('taylor@example.com')
  await page.getByRole('radio', { name: /Select an existing customer/ }).check()
  await expect(page.getByLabel('Business name', { exact: true })).toBeDisabled()
  await page.getByRole('radio', { name: /Add a new customer/ }).check()
  await expect(page.getByLabel('Business name', { exact: true })).toHaveValue(
    'Polish Customer',
  )
  if ((page.viewportSize()?.width || 1440) >= 768) {
    const boxes = await page
      .locator('.customer-option')
      .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().x))
    expect(boxes[0]).toBeLessThan(boxes[1])
  }
  await page
    .getByLabel('Project name', { exact: true })
    .fill('Customer layout project')
  await page.getByLabel('Due date', { exact: true }).fill('2026-12-20')
  await noOverflow(page)
  await page.screenshot({
    path: info.outputPath('customer-selection.png'),
    fullPage: true,
  })
  await page
    .getByRole('button', { name: 'Continue to review', exact: true })
    .click()
  await expect(page.locator('.summary-list')).toContainText('Polish Customer')
  const request = page.waitForRequest(
    (r) =>
      r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/clients'),
  )
  await page
    .getByRole('button', { name: 'Create project', exact: true })
    .click()
  expect((await request).postDataJSON()).toMatchObject({
    businessName: 'Polish Customer',
    contactName: 'Taylor Test',
    email: 'taylor@example.com',
  })
  await expect(
    page.getByRole('heading', { name: 'Customer layout project', exact: true }),
  ).toBeVisible()
})

test('team assignment search and Insights are readable and functional', async ({
  page,
}, info) => {
  await signIn(page)
  await nav(page, 'Team')
  await page
    .getByRole('button', { name: 'Invite member', exact: false })
    .click()
  const modal = page.getByRole('dialog', { name: 'Invite a team member' })
  const email = modal.getByRole('textbox', { name: 'Teammate email' })
  await expect(email).toBeVisible()
  expect((await email.boundingBox())!.height).toBeGreaterThanOrEqual(40)
  await expect(
    modal.getByText('Private project access', { exact: true }),
  ).toBeVisible()
  await expect(
    modal.getByText(/do not grant project access automatically/),
  ).toBeVisible()
  await expect(modal.getByRole('combobox')).toBeDisabled()
  await email.fill('new-teammate@example.test')
  await noOverflow(page)
  await page.screenshot({
    path: info.outputPath('team-invitation.png'),
    fullPage: true,
  })
  await page.keyboard.press('Escape')
  await expect(modal).toHaveCount(0)
  await nav(page, 'Insights')
  const details = page.getByText('Section status details', { exact: true })
  await expect(page.getByRole('table').first()).toBeVisible()
  await details.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.insights-table')).toBeHidden()
  await page.keyboard.press('Enter')
  await expect(page.locator('.insights-table')).toBeVisible()
  const overview = page.getByRole('region', { name: 'Workspace overview' })
  const before = await overview.locator('article strong').allTextContents()
  const picker = page.getByRole('combobox', { name: 'Project', exact: true })
  await picker.selectOption({ index: 1 })
  const name = await picker.locator('option:checked').innerText()
  await expect(
    page.getByRole('region', { name: 'Insights for ' + name }),
  ).toContainText(name)
  await expect(overview.locator('article strong')).toHaveText(before)
  await expect(page.getByText('Demo scenarios', { exact: true })).toHaveCount(0)
  expect(await page.locator('body').innerText()).not.toMatch(/[→←↗↑↓]/)
  await noOverflow(page)
  await page.screenshot({
    path: info.outputPath('insights.png'),
    fullPage: true,
  })
})

import { test, expect, type Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
test.setTimeout(90000)
async function signIn(page: Page, email = 'owner@studio.example') {
  await page.goto('/sign-in')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('ContentDemo!2026')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Welcome,/ })).toBeVisible()
}
async function nav(page: Page, name: string) {
  const mobile = page.getByRole('navigation', {
    name: 'Mobile workspace navigation',
  })
  if (await page.getByText('Workspace menu', { exact: true }).isVisible()) {
    const summary = page.getByText('Workspace menu', { exact: true })
    if (!(await mobile.isVisible())) await summary.click()
    await mobile.getByRole('link', { name, exact: true }).click()
    await summary.click()
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
test('owner → client draft → immutable review → approved export', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await signIn(page)
  await nav(page, 'Projects')
  await page
    .getByRole('heading', { name: 'Lamar Dental website', exact: true })
    .click()
  await page.getByRole('link', { name: 'Client access', exact: true }).click()
  await page.getByRole('button', { name: 'Send / resend invite' }).click()
  await page
    .getByRole('link', { name: 'Open client access', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'A little detail. A big difference.' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Open my project' }).click()
  await expect(
    page.getByRole('heading', { name: 'Lamar Dental website', exact: true }),
  ).toBeVisible()
  const response = page.getByLabel('Your response', { exact: true })
  await response.fill('Lamar Dental — synthetic client content')
  await expect(
    page.getByText('All changes saved', { exact: true }),
  ).toBeVisible()
  await noOverflow(page)
  await page.screenshot({
    path: info.outputPath('client-editor.png'),
    fullPage: true,
  })
  await page
    .getByRole('button', { name: 'Submit for review', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Submit for review', exact: true })
    .click()
  await expect(
    page.getByText('Your submission is waiting for review.', { exact: false }),
  ).toBeVisible()
  await page
    .getByRole('link', { name: 'Website Content Collector home' })
    .click()
  await page.getByRole('link', { name: 'Open workspace', exact: true }).click()
  await nav(page, 'Projects')
  await page
    .getByRole('heading', { name: 'Lamar Dental website', exact: true })
    .click()
  await page.getByRole('link', { name: 'Review', exact: true }).click()
  await expect(
    page.getByText('Lamar Dental — synthetic client content', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Approve revision', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Approve', exact: true })
    .click()
  await expect(
    page.getByText('Exact revision approved.', { exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Exports', exact: true }).click()
  await page
    .getByLabel('I understand this is a partial export', { exact: false })
    .check()
  await page
    .getByRole('button', { name: 'Create approved export', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Download', exact: true }),
  ).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.zip$/)
  await noOverflow(page)
  await page.screenshot({
    path: info.outputPath('approved-export.png'),
    fullPage: true,
  })
  expect(errors).toEqual([])
})
test('all project types, template previews, settings and keyboard reorder', async ({
  page,
}, info) => {
  await signIn(page)
  await nav(page, 'Template gallery')
  await expect(
    page.getByRole('heading', { name: 'Template gallery', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Preview', exact: true })
    .first()
    .click()
  await expect(
    page.getByRole('heading', { name: 'Collection checklist', exact: true }),
  ).toBeVisible()
  await noOverflow(page)
  await page.screenshot({
    path: info.outputPath('templates.png'),
    fullPage: true,
  })
  for (const [type, name] of [
    ['WEBSITE', 'Website journey'],
    ['WEB_APP', 'Web app journey'],
    ['MOBILE_APP', 'Mobile app journey'],
  ]) {
    await nav(page, 'Projects')
    await page
      .getByRole('link', { name: 'New project', exact: false })
      .first()
      .click()
    await page.getByLabel('Project name', { exact: true }).fill(name)
    await page.getByLabel('Project type', { exact: true }).selectOption(type)
    await page
      .getByLabel('Customer', { exact: true })
      .selectOption({ label: 'Lamar Dental' })
    await page.getByLabel('Due date', { exact: true }).fill('2026-12-20')
    await page
      .getByRole('button', { name: 'Create project', exact: true })
      .click()
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
    await noOverflow(page)
    const move = page.getByRole('button', { name: /Move .+ down/ }).first()
    await move.focus()
    await page.keyboard.press('Enter')
    await expect(
      page.getByText('Order updated.', { exact: true }),
    ).toBeVisible()
  }
  for (const [link, heading] of [
    ['Team', 'Your team'],
    ['Insights', 'Insights'],
    ['Billing & usage', 'Room to do your best work'],
    ['Settings', 'Workspace settings'],
  ]) {
    await nav(page, link)
    await expect(
      page.getByRole('heading', { name: heading, exact: true }),
    ).toBeVisible()
    await noOverflow(page)
  }
  await page.screenshot({
    path: info.outputPath('workspace-settings.png'),
    fullPage: true,
  })
})
test('public landing and pricing remain responsive and keyboard accessible', async ({
  page,
}, info) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: /Great projects/ }),
  ).toBeVisible()
  await noOverflow(page)
  await page.screenshot({
    path: info.outputPath('landing.png'),
    fullPage: true,
  })
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toBeFocused()
  await page.getByRole('link', { name: 'Explore plans', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Small team/ })).toBeVisible()
  await noOverflow(page)
})

test('client upload processing and explicit AI acceptance preserve submission choice', async ({
  page,
}, info) => {
  await page.goto('/client/access#token=client-demo')
  await page.getByRole('button', { name: 'Open my project' }).click()
  await page
    .getByRole('navigation', { name: 'Collection checklist' })
    .getByRole('button', { name: 'Hero photo', exact: false })
    .click()
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XkAAAAASUVORK5CYII=',
    'base64',
  )
  await page
    .getByLabel('Choose images from library or files')
    .setInputFiles({
      name: 'synthetic-photo.png',
      mimeType: 'image/png',
      buffer: png,
    })
  await expect(page.getByText('READY', { exact: true })).toBeVisible({
    timeout: 15000,
  })
  await expect(
    page.getByText('All changes saved', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Submit for review', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Submit for review', exact: true })
    .click()
  await expect(
    page.getByText('Your submission is waiting for review.', { exact: false }),
  ).toBeVisible()
  await noOverflow(page)
  await page.screenshot({
    path: info.outputPath('client-upload.png'),
    fullPage: true,
  })
  await page
    .getByRole('navigation', { name: 'Collection checklist' })
    .getByRole('button', { name: 'Short introduction', exact: false })
    .click()
  await page
    .getByLabel('Facts to include (one per line)')
    .fill('Family-owned practice since 2019.\nOpen Monday to Friday.')
  await page
    .getByLabel('Use these facts to prepare a suggestion.', { exact: false })
    .check()
  await page
    .getByRole('button', { name: 'Generate suggestion', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Suggested draft', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Your response', { exact: true })).toHaveValue(
    '',
  )
  await page
    .getByRole('button', { name: 'Accept as draft', exact: true })
    .click()
  await expect(page.getByLabel('Your response', { exact: true })).toHaveValue(
    'Family-owned practice since 2019. Open Monday to Friday.',
  )
  await expect(
    page.getByText('Accepted suggestion saved as a draft.', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Submit for review', exact: true }),
  ).toBeEnabled()
  await noOverflow(page)
})

test('mock failure, billing grace and read-only states offer deliberate recovery', async ({
  page,
}) => {
  await signIn(page)
  await nav(page, 'Projects')
  const scenarios = page.getByText('Demo scenarios', { exact: true })
  await scenarios.click()
  await page
    .getByLabel('Scenario', { exact: true })
    .selectOption('list-failure')
  await page.getByRole('button', { name: 'Apply scenario' }).click()
  await expect(
    page.getByRole('heading', { name: 'Couldn’t load this view' }),
  ).toBeVisible()
  await page.getByLabel('Scenario', { exact: true }).selectOption('normal')
  await page.getByRole('button', { name: 'Apply scenario' }).click()
  await expect(
    page.getByRole('heading', { name: 'Lamar Dental website', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Scenario', { exact: true }).selectOption('grace')
  await page.getByRole('button', { name: 'Apply scenario' }).click()
  await scenarios.click()
  await nav(page, 'Billing & usage')
  await expect(page.getByText('PAST DUE', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: 'Manage in hosted billing portal' })
    .click()
  await expect(
    page.getByText('Mock hosted billing return.', { exact: false }),
  ).toBeVisible()
  await scenarios.click()
  await page.getByLabel('Scenario', { exact: true }).selectOption('read-only')
  await page.getByRole('button', { name: 'Apply scenario' }).click()
  await expect(
    page.getByText('This workspace is read-only.', { exact: false }),
  ).toBeVisible()
  await noOverflow(page)
})

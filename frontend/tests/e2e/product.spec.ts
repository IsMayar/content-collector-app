import {
  mainReady,
  agencyReadsReady,
  createProjectReady,
} from './helpers/readiness'
import { test, expect, type Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
test.setTimeout(90000)
async function signIn(page: Page, email = 'owner@studio.example') {
  await page.goto('/sign-in')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('ContentDemo!2026')
  const signedIn = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/v1/me' && r.status() === 200,
  )
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await signedIn
  await mainReady(page)
  await agencyReadsReady(page)
  await expect(
    page.getByRole('heading', { name: /Welcome back,|Good morning,/ }),
  ).toBeVisible()
}
async function nav(page: Page, name: string) {
  const mobile = page.getByRole('navigation', {
    name: 'Mobile workspace navigation',
  })
  if ((page.viewportSize()?.width || 1440) < 768) {
    const summary = page.getByText('Workspace menu', { exact: true })
    await expect(summary).toBeVisible()
    if (!(await mobile.isVisible())) await summary.click()
    await mobile.getByRole('link', { name, exact: true }).click()
    if (await mobile.isVisible()) await summary.click()
  } else
    await page
      .getByRole('navigation', { name: 'Workspace navigation', exact: true })
      .getByRole('link', { name, exact: true })
      .click()
  await mainReady(page)
  await agencyReadsReady(page)
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
}
test('owner client draft immutable review approved export', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await signIn(page)
  await nav(page, 'Projects')
  await page
    .getByRole('link', { name: 'Lamar Dental website', exact: true })
    .click()
  await page.getByRole('link', { name: 'Client access', exact: true }).click()
  await page.getByRole('button', { name: 'Send / resend invite' }).click()
  await page
    .getByRole('link', { name: 'Open client access', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'You’re invited to share content.' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Open my project' }).click()
  await page.getByRole('button', { name: 'Continue section' }).first().click()
  await expect(
    page.getByRole('heading', { name: 'Lamar Dental website', exact: true }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('navigation', { name: 'Client project views' })
      .getByRole('button', { name: 'Checklist', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
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
    .getByRole('link', { name: 'Lamar Dental website', exact: true })
    .click()
  await page.getByRole('link', { name: 'Review', exact: true }).click()
  await page
    .getByRole('button', { name: 'Review', exact: true })
    .first()
    .click()
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
  await page.getByRole('button', { name: 'New export' }).click()
  await page
    .getByLabel('I understand this is a partial export', { exact: false })
    .check()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
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
  const documentNavigations: string[] = []
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame())
      documentNavigations.push(new URL(request.url()).pathname)
  })
  await nav(page, 'Templates')
  await expect(
    page.getByRole('heading', { name: 'Project templates', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Preview', exact: true })
    .first()
    .click()
  await expect(
    page.getByRole('heading', { name: /Requested content/ }),
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
      .getByRole('link', { name: 'Create project', exact: false })
      .first()
      .click()
    await page
      .getByRole('navigation', { name: 'Project type', exact: true })
      .getByRole('button', {
        name:
          type === 'WEBSITE'
            ? 'Website'
            : type === 'WEB_APP'
              ? 'Web app'
              : 'Mobile app',
        exact: true,
      })
      .click()
    await page.locator('.reference-template-tile').first().click()
    await page.getByRole('button', { name: 'Use this template' }).click()
    await page.getByLabel('Project name', { exact: true }).fill(name)
    await page
      .getByLabel('Customer', { exact: true })
      .selectOption({ label: 'Lamar Dental' })
    await page.getByLabel('Due date', { exact: true }).fill('2026-12-20')
    await page.getByRole('button', { name: 'Continue to review' }).click()
    await createProjectReady(page, 'Create project')
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
    ['Team', 'Team'],
    ['Insights', 'Insights'],
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
  expect(
    documentNavigations,
    'Wizard and workspace links must preserve the SPA session',
  ).toEqual([])
})
test('public landing and pricing remain responsive and keyboard accessible', async ({
  page,
}, info) => {
  await page.goto('/')
  await mainReady(page)
  await expect(
    page.getByRole('heading', { name: /Get client content/ }),
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
  await page.getByRole('link', { name: 'Pricing', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: /Choose the plan/ }),
  ).toBeVisible()
  await noOverflow(page)
})

test('public legal documents use simple navigation without demo chrome', async ({
  page,
}) => {
  await page.goto('/')
  await mainReady(page)
  await expect(page.getByRole('link', { name: 'Product' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await page.getByRole('link', { name: 'See how it works' }).click()
  await expect(page).toHaveURL(/#how-it-works$/)
  const footer = page.getByRole('navigation', { name: 'Legal navigation' })
  await footer.getByRole('link', { name: 'Privacy' }).click()
  for (const [title, section] of [
    ['Privacy Policy', '6. Your rights'],
    ['Terms of Service', '4. Service availability'],
  ]) {
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: section, exact: true }),
    ).toBeVisible()
    await expect(page.getByText('Policy draft', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Development environment')).toHaveCount(0)
    await expect(page.getByText('Demo scenarios', { exact: true })).toHaveCount(
      0,
    )
    await expect(
      page.getByRole('navigation', { name: 'Document sections' }),
    ).toHaveCount(0)
    await noOverflow(page)
    if (title === 'Privacy Policy')
      await footer.getByRole('link', { name: 'Terms' }).click()
  }
  const header = page.getByRole('navigation', { name: 'Main navigation' })
  await header.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/' && !url.hash)
  await footer.getByRole('link', { name: 'Terms' }).click()
  await header.getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible()
  await expect(page.getByLabel('Development environment')).toBeVisible()
})

test('wizard preserves details and item drawer traps and restores keyboard focus', async ({
  page,
}) => {
  await signIn(page)
  await nav(page, 'Projects')
  await page.getByRole('link', { name: 'Create project' }).click()
  await page.locator('.reference-template-tile').first().click()
  await page.getByRole('button', { name: 'Use this template' }).click()
  await page
    .getByLabel('Project name', { exact: true })
    .fill('Wizard review verification')
  await page
    .getByLabel('Customer', { exact: true })
    .selectOption({ label: 'Lamar Dental' })
  await page.getByLabel('Due date', { exact: true }).fill('2026-12-20')
  await page.getByRole('button', { name: 'Continue to review' }).click()
  await expect(
    page.getByRole('heading', { name: 'Review and create your project' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(
    'Wizard review verification',
  )
  await page.getByRole('button', { name: 'Continue to review' }).click()
  await createProjectReady(page, 'Save as draft')
  await expect(
    page.getByRole('heading', {
      name: 'Wizard review verification',
      exact: true,
    }),
  ).toBeVisible()
  const edit = page
    .getByRole('button', { name: /^Edit / })
    .filter({ has: page.locator('svg') })
    .first()
  await edit.click()
  const drawer = page.getByRole('dialog', { name: 'Item settings' })
  await expect(drawer).toBeVisible()
  await drawer.getByRole('button', { name: 'Close item settings' }).focus()
  await page.keyboard.press('Shift+Tab')
  expect(
    await drawer.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true)
  await page.keyboard.press('Escape')
  await expect(drawer).not.toBeVisible()
  await expect(edit).toBeFocused()
  await noOverflow(page)
})

test('client upload processing and explicit AI acceptance preserve submission choice', async ({
  page,
}, info) => {
  await page.goto('/client/access#token=client-demo')
  await page.getByRole('button', { name: 'Open my project' }).click()
  await page.getByRole('button', { name: 'Continue section' }).first().click()
  await page
    .getByRole('navigation', { name: 'Collection checklist' })
    .getByRole('button', { name: 'Hero photo', exact: false })
    .click()
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XkAAAAASUVORK5CYII=',
    'base64',
  )
  await page.getByLabel('Choose images from library or files').setInputFiles({
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
  await page.getByRole('button', { name: 'Help me draft' }).click()
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
    page.getByRole('heading', { name: 'AI suggested draft', exact: true }),
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
    page.getByRole('link', { name: 'Lamar Dental website', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Scenario', { exact: true }).selectOption('grace')
  await page.getByRole('button', { name: 'Apply scenario' }).click()
  await scenarios.click()
  await nav(page, 'Settings')
  await page
    .getByRole('navigation', { name: 'Settings navigation' })
    .getByRole('link', { name: 'Billing', exact: true })
    .click()
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

test('team invitation drawer, project file upload and handoff screens', async ({
  page,
}, info) => {
  await signIn(page)
  await nav(page, 'Team')
  await page.getByRole('button', { name: 'Invite member' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Invite a team member' }),
  ).toBeVisible()
  await page.getByLabel('Teammate email').fill('new-member@example.test')
  await expect(
    page
      .getByRole('dialog')
      .getByText(/do not grant project access automatically/),
  ).toBeVisible()
  await page.screenshot({
    path: info.outputPath('team-invitation.png'),
    fullPage: true,
  })
  await noOverflow(page)
  await page.getByRole('button', { name: 'Send invitation' }).click()
  await expect(
    page.getByRole('cell', { name: 'new-member@example.test', exact: true }),
  ).toBeVisible()
  await nav(page, 'Projects')
  await page
    .getByRole('link', { name: 'Lamar Dental website', exact: true })
    .click()
  await page.getByRole('link', { name: 'Files', exact: true }).click()
  await page.getByRole('button', { name: 'Upload files' }).click()
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XkAAAAASUVORK5CYII=',
    'base64',
  )
  await page.getByLabel('Choose images from library or files').setInputFiles({
    name: 'agency-photo.png',
    mimeType: 'image/png',
    buffer: png,
  })
  await expect(
    page.getByRole('dialog').getByText('READY', { exact: true }),
  ).toBeVisible({ timeout: 15000 })
  await page
    .getByRole('button', { name: 'Close Upload files', exact: true })
    .click()
  await page.getByRole('button', { name: /agency-photo.png/ }).click()
  await expect(
    page.getByRole('dialog', { name: 'agency-photo.png' }),
  ).toBeVisible()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  expect((await downloading).suggestedFilename()).toBe('agency-photo.png')
  await page.screenshot({
    path: info.outputPath('file-details.png'),
    fullPage: true,
  })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'List view', exact: true }).click()
  await noOverflow(page)
  await page.getByRole('link', { name: 'Completion', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Project completion', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Complete project', exact: true }),
  ).toBeDisabled()
  await page.screenshot({
    path: info.outputPath('completion.png'),
    fullPage: true,
  })
  await noOverflow(page)
})

test('administration boards: settings, usage, reminders and counts-only analytics', async ({
  page,
}, info) => {
  await signIn(page)
  await nav(page, 'Settings')
  await expect(
    page.getByRole('heading', { name: 'Workspace settings', exact: true }),
  ).toBeVisible()
  await noOverflow(page)
  await page.screenshot({
    path: info.outputPath('board13-workspace.png'),
    fullPage: true,
  })
  await page.getByRole('link', { name: 'My account', exact: true }).click()
  await page.getByLabel('Full name', { exact: true }).fill('Alex Morgan')
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Active sessions', exact: true }),
  ).toBeVisible()
  await noOverflow(page)
  await page.screenshot({
    path: info.outputPath('board13-account.png'),
    fullPage: true,
  })
  await page.getByRole('link', { name: 'Usage', exact: true }).click()
  await expect(
    page.getByRole('progressbar', { name: 'Storage usage' }),
  ).toBeVisible()
  await noOverflow(page)
  await page.screenshot({
    path: info.outputPath('board13-usage.png'),
    fullPage: true,
  })
  await nav(page, 'Projects')
  await page
    .getByRole('link', { name: 'Lamar Dental website', exact: true })
    .click()
  await page.getByRole('link', { name: 'Reminders', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Reminder channels', exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: info.outputPath('board11-policy.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Cadence', exact: true }).click()
  await expect(page.getByLabel('Local delivery time').first()).toBeVisible()
  await page.getByRole('button', { name: 'Save policy', exact: true }).click()
  await expect(
    page.getByText('Reminder policy saved.', { exact: true }),
  ).toBeVisible()
  await agencyReadsReady(page)
  await noOverflow(page)
  await page.screenshot({
    path: info.outputPath('board11-cadence.png'),
    fullPage: true,
  })
  await page
    .getByRole('button', { name: 'Email & SMS preview', exact: true })
    .click()
  await page.getByLabel('Contact', { exact: true }).selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(page.locator('.reminder-email-card blockquote')).toBeVisible()
  await page.getByLabel('Channel', { exact: true }).selectOption('SMS')
  await expect(
    page.getByRole('button', { name: 'Send now', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('button', { name: 'Delivery activity', exact: true })
    .click()
  await expect(
    page.getByRole('heading', {
      name: 'Reminder delivery activity',
      exact: true,
    }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Analytics', exact: true }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Submissions and approvals',
      exact: true,
    }),
  ).toBeVisible()
  await noOverflow(page)
  await page.screenshot({
    path: info.outputPath('board12-analytics.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Item friction', exact: true }).click()
  await expect(page.getByText('Insufficient data').first()).toBeVisible()
  await page
    .getByRole('button', { name: 'Counts-only status share', exact: true })
    .click()
  await page
    .getByLabel('Public alias', { exact: true })
    .fill('Agency status update')
  await page
    .getByRole('button', { name: 'Create counts-only share', exact: true })
    .click()
  await expect(
    page.getByRole('link', { name: 'Open counts-only status link' }),
  ).toBeVisible()
  await noOverflow(page)
  await page.screenshot({
    path: info.outputPath('board12-share.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Revoke share', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('link', { name: 'Open counts-only status link' }),
  ).toHaveCount(0)
})

test('daily digest, deletion cancellation and offline recovery', async ({
  page,
}, info) => {
  await signIn(page)
  await nav(page, 'Settings')
  await page.getByRole('link', { name: 'Daily digest', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Next digest preview', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Save digest settings' }).click()
  await expect(
    page.getByText('Daily digest preference saved.', { exact: true }),
  ).toBeVisible()
  await noOverflow(page)
  await page.screenshot({
    path: info.outputPath('board12-digest.png'),
    fullPage: true,
  })
  await page.getByRole('link', { name: 'Data & privacy', exact: true }).click()
  await page.getByRole('button', { name: 'Request workspace deletion' }).click()
  const dialog = page.getByRole('dialog', {
    name: 'Schedule workspace deletion?',
  })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  // Simulate the platform's offline flag as well as its connectivity event.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    window.dispatchEvent(new Event('offline'))
  })
  await expect(
    page.getByText('You’re offline — saves are paused', { exact: true }),
  ).toBeVisible()
  await noOverflow(page)
  await page.screenshot({
    path: info.outputPath('board14-offline.png'),
    fullPage: true,
  })
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    })
    window.dispatchEvent(new Event('online'))
  })
  await expect(
    page.getByText('You’re offline — saves are paused', { exact: true }),
  ).toHaveCount(0)
})

test('settings owns billing and selected templates open project details directly', async ({
  page,
}, info) => {
  await signIn(page)
  await expect(
    page.getByRole('link', { name: 'Billing & usage', exact: true }),
  ).toHaveCount(0)
  await nav(page, 'Settings')
  const settingsNav = page.getByRole('navigation', {
    name: 'Settings navigation',
  })
  await settingsNav.getByRole('link', { name: 'Billing', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Billing', exact: true }),
  ).toBeVisible()
  if ((page.viewportSize()?.width || 1440) >= 768)
    await expect(
      page
        .getByRole('navigation', { name: 'Workspace navigation', exact: true })
        .getByRole('link', { name: 'Settings', exact: true }),
    ).toHaveClass(/active/)
  await settingsNav.getByRole('link', { name: 'Usage', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Usage', exact: true }),
  ).toBeVisible()
  for (const type of ['WEBSITE', 'WEB_APP', 'MOBILE_APP']) {
    await nav(page, 'Templates')
    await page.getByLabel('Project type', { exact: true }).selectOption(type)
    const card = page.locator('.template-library-grid .template-card').first()
    await expect(card).toBeVisible()
    const title = await card.getByRole('heading').innerText()
    const use = card.getByRole('link', { name: 'Use template', exact: true })
    const target = new URL((await use.getAttribute('href'))!, page.url())
    if (type === 'WEBSITE')
      await page.screenshot({
        path: info.outputPath('template-library.png'),
        fullPage: true,
      })
    await use.focus()
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('heading', { name: 'Project details', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', {
        name: 'Choose a template to get started.',
        exact: true,
      }),
    ).toHaveCount(0)
    await expect(page.locator('.wizard-template-summary')).toContainText(title)
    await page
      .getByLabel('Project name', { exact: true })
      .fill(`${type} selected template`)
    await page
      .getByLabel('Customer', { exact: true })
      .selectOption({ label: 'Lamar Dental' })
    await page.getByLabel('Due date', { exact: true }).fill('2026-12-20')
    await page
      .getByRole('button', { name: 'Change template', exact: true })
      .click()
    await expect(
      page.getByRole('heading', {
        name: 'Choose a template to get started.',
        exact: true,
      }),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Use this template', exact: false })
      .click()
    await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(
      `${type} selected template`,
    )
    await noOverflow(page)
    if (type === 'WEBSITE')
      await page.screenshot({
        path: info.outputPath('template-project-details.png'),
        fullPage: true,
      })
    await page
      .getByRole('button', { name: 'Continue to review', exact: false })
      .click()
    await expect(page.locator('.selected-template')).toContainText(title)
    const sent = page.waitForRequest(
      (r) =>
        r.method() === 'POST' && /\/projects$/.test(new URL(r.url()).pathname),
    )
    await createProjectReady(page, 'Create project')
    expect((await sent).postDataJSON()).toMatchObject({
      projectType: type,
      templateVersionId: target.searchParams.get('template'),
    })
    await expect(
      page.getByRole('heading', {
        name: `${type} selected template`,
        exact: true,
      }),
    ).toBeVisible()
  }
})

test('T12 customers, explicit project contacts and preview keep their boundaries', async ({
  page,
}) => {
  await signIn(page)
  await nav(page, 'Projects')
  await page
    .getByRole('link', { name: 'Lamar Dental website', exact: true })
    .click()
  await mainReady(page)
  await agencyReadsReady(page)
  await page.getByRole('link', { name: 'Client access', exact: true }).click()
  await page
    .getByRole('button', { name: 'Edit Lamar Dental', exact: true })
    .click()
  await page
    .getByLabel('Business name', { exact: true })
    .fill('Lamar Dental updated')
  const changed = page.waitForResponse(
    (r) =>
      r.request().method() === 'PATCH' &&
      new URL(r.url()).pathname.includes('/clients/'),
  )
  await page
    .getByRole('button', { name: 'Save customer name', exact: true })
    .click()
  expect((await changed).status()).toBe(200)
  await expect(
    page.getByText('Customer updated.', { exact: true }),
  ).toBeVisible()
  await agencyReadsReady(page)
  await page.getByRole('link', { name: 'Client preview', exact: true }).click()
  await expect(page.getByText(/Read-only owner preview/)).toBeVisible()
  await expect(page.locator('.preview-item').first()).toBeVisible()
  const writes: string[] = []
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname.startsWith('/api/') &&
      request.method() !== 'GET'
    )
      writes.push(request.method())
  })
  for (const button of await page
    .getByRole('navigation', { name: 'Preview sections', exact: true })
    .getByRole('button')
    .all()) {
    await button.click()
    for (const field of await page
      .locator(
        '.preview-item input,.preview-item textarea,.preview-item select',
      )
      .all())
      await expect(field).toBeDisabled()
  }
  expect(writes).toEqual([])
  await noOverflow(page)
})

test('four settings sections retain account workspace billing and privacy flows', async ({
  page,
}) => {
  await signIn(page)
  await nav(page, 'Settings')
  const settings = page.getByRole('navigation', { name: 'Settings navigation' })
  await expect(settings.getByRole('link')).toHaveCount(4)
  await expect(page.getByText('Demo scenarios', { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Save profile', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Daily digest', exact: true }),
  ).toBeVisible()
  const workspace = settings.getByRole('link', { name: /Workspace & Team/ })
  await workspace.focus()
  await expect(workspace).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('button', { name: 'Save workspace', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Transfer workspace ownership' }),
  ).toBeVisible()
  await settings.getByRole('link', { name: /Billing & Usage/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Storage and resource usage' }),
  ).toBeVisible()
  await settings.getByRole('link', { name: /Privacy & Data/ }).click()
  await expect(
    page.getByRole('link', { name: 'Privacy Policy', exact: true }),
  ).toBeVisible()
  await noOverflow(page)
  const path = new URL(page.url()).pathname.replace(/settings$/, 'billing')
  await page.evaluate(async (target) => {
    const modulePath = '/src/app/router/AppRouter.tsx'
    const { router } = await import(modulePath)
    await router.navigate(target)
  }, path + '?view=usage')
  await expect(
    settings.getByRole('link', { name: /Billing & Usage/ }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(
    page.getByRole('heading', { name: 'Storage and resource usage' }),
  ).toBeVisible()
  await noOverflow(page)
})

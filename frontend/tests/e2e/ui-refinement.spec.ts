import { test, expect } from '@playwright/test'
import { mainReady, agencyReadsReady } from './helpers/readiness'
test('shared content editing, stable sidebar and compact settings', async ({
  page,
}, info) => {
  await page.goto('/sign-in')
  await page.getByLabel('Email address').fill('owner@studio.example')
  await page.getByLabel('Password', { exact: true }).fill('ContentDemo!2026')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await mainReady(page)
  await agencyReadsReady(page)
  await page
    .getByRole('link', { name: 'Lamar Dental website', exact: true })
    .first()
    .click()
  const projectNavigation = page.getByRole('navigation', { name: 'Project sections' })
  await expect(projectNavigation.getByRole('link', { name: 'Content' })).toBeVisible()
  await expect(projectNavigation.getByRole('link', { name: 'Files' })).toBeVisible()
  await expect(page.getByLabel('More project views')).toHaveCount(0)
  await page.getByLabel('Project actions', { exact: true }).click()
  await page.getByRole('button', { name: 'Edit project', exact: true }).click()
  const editProject = page.getByRole('dialog', { name: 'Edit project' })
  await expect(editProject.getByLabel('Project name')).toHaveValue('Lamar Dental website')
  await expect(editProject.getByLabel('Due date')).toBeVisible()
  await expect(editProject.getByLabel('Timezone')).toBeVisible()
  await editProject.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(editProject).toHaveCount(0)
  await expect(page.getByText('Counts-only status share', { exact: true })).toHaveCount(0)
  await projectNavigation.getByRole('link', { name: 'Access' }).click()
  await expect(page.getByRole('heading', { name: 'Client access' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Team access' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'View project' })).toHaveCount(0)
  await expect(page.getByLabel('Contact name')).toHaveCount(0)
  await page.getByRole('button', { name: /Invite client|Add contact/ }).click()
  const invitation = page.getByRole('dialog', {
    name: /Invite client|Add client contact/,
  })
  await expect(invitation.getByLabel('Contact name')).toBeVisible()
  await expect(invitation.getByLabel('Email address')).toBeVisible()
  await invitation.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(invitation).toHaveCount(0)
  await projectNavigation.getByRole('link', { name: 'Content' }).click()
  const sections = page.getByRole('navigation', { name: 'Content sections' })
  await expect(sections).toBeVisible()
  const second = sections.getByRole('button').nth(1)
  await second.click()
  const title = await second.getAttribute('title')
  const sidebar = page.locator('.agency-sidebar')
  const color = await sidebar.evaluate(
    (e) =>
      getComputedStyle(e).backgroundImage + getComputedStyle(e).backgroundColor,
  )
  await page.getByRole('button', { name: 'Edit request', exact: true }).click()
  await expect(
    sections.getByRole('button', { name: new RegExp(title!) }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(
    page.getByRole('button', { name: 'Add question', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Add question', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Add question' })
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByText('Advanced settings', { exact: true }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Close question editor' }).click()
  await page.getByRole('button', { name: 'Done editing', exact: true }).click()
  await expect(
    sections.getByRole('button', { name: new RegExp(title!) }),
  ).toHaveAttribute('aria-current', 'page')
  await page.locator('.content-question-toggle').first().click()
  await expect(page.locator('.revision-layout')).toBeVisible()
  expect(
    await sidebar.evaluate(
      (e) =>
        getComputedStyle(e).backgroundImage +
        getComputedStyle(e).backgroundColor,
    ),
  ).toBe(color)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: info.outputPath('content.png'),
    fullPage: true,
  })
  for (const view of [
    'My account',
    'Notifications',
    'Workspace settings',
    'Billing & usage',
    'Privacy & data',
  ]) {
    await page.getByRole('button', { name: 'Profile and settings' }).click()
    await page
      .getByRole('navigation', { name: 'Personal and workspace settings' })
      .getByRole('link', { name: view, exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: view, exact: true }).first(),
    ).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: 'Settings categories' }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  await page.getByRole('button', { name: 'Profile and settings' }).click()
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('button', { name: 'Profile and settings' }),
  ).toBeFocused()
  await page.screenshot({
    path: info.outputPath('settings.png'),
    fullPage: true,
  })
})

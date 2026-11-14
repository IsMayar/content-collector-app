import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { localEdgeOptions } from './localEdge.mjs'

const origin = 'http://127.0.0.1:5173'
const inbox = new URL('../../backend/.local/auth/inbox/', import.meta.url)
const email = `local-smoke-${randomUUID()}@example.test`
const password = `Local!${randomBytes(24).toString('base64url')}`
let browser
let step = 'launch Edge'

try {
  browser = await chromium.launch(localEdgeOptions())
  const page = await browser.newPage({ serviceWorkers: 'block' })
  const post = async (path, status, action) => {
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === '/api/v1/' + path &&
          r.request().method() === 'POST',
      ),
      action(),
    ])
    expect(response.status()).toBe(status)
  }

  step = 'register a disposable account'
  await page.goto(origin + '/sign-up')
  await expect(page.getByLabel('Development environment')).toHaveCount(0)
  await page.getByLabel('Your name').fill('Local Smoke')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password', { exact: true }).fill(password)
  await post('auth/register', 202, () =>
    page.getByRole('button', { name: 'Create account', exact: true }).click(),
  )
  console.log('PASS registration through Vite')

  step = 'receive and consume the real verification link'
  let verification
  await expect
    .poll(
      async () => {
        for (const file of await readdir(inbox)) {
          if (!/^[a-f0-9-]{36}\.txt$/.test(file)) continue
          const [purpose, recipient, link] = (
            await readFile(new URL(file, inbox), 'utf8')
          ).split('\n')
          if (purpose === 'VERIFY_EMAIL' && recipient === email && link) {
            verification = new URL(link)
            return true
          }
        }
        return false
      },
      { timeout: 15000 },
    )
    .toBe(true)
  if (
    verification.origin !== origin ||
    verification.pathname !== '/verify-email'
  ) {
    throw new Error('Unexpected verification origin or path')
  }
  await page.goto(verification.href)
  await post('auth/verify-email', 200, () =>
    page.getByRole('button', { name: 'Verify email', exact: true }).click(),
  )
  console.log('PASS verification delivered by the local outbox worker')

  step = 'sign in and create a workspace'
  await page.goto(origin + '/sign-in')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await post('auth/login', 200, () =>
    page.getByRole('button', { name: 'Sign in', exact: true }).click(),
  )
  await page
    .getByLabel('Workspace name', { exact: true })
    .fill('Local smoke studio')
  await page.getByLabel('Workspace timezone', { exact: true }).fill('UTC')
  await post('workspaces', 201, () =>
    page.getByRole('button', { name: 'Create workspace', exact: true }).click(),
  )
  const picker = page.getByLabel('Workspace', { exact: true })
  await expect(picker).toHaveValue(/.+/)
  const workspace = await picker.inputValue()
  await page.reload()
  await expect(picker).toHaveValue(workspace)
  console.log('PASS sign-in, workspace persistence, and authenticated reload')

  step = 'sign out'
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Sign out of your account?' })
  await post('auth/logout', 204, () =>
    dialog.getByRole('button', { name: 'Sign out', exact: true }).click(),
  )
  await expect(
    page.getByRole('heading', { name: 'Welcome back', exact: true }),
  ).toBeVisible()
  console.log('PASS logout')
} catch (error) {
  // Browser exceptions can contain credentials or capability URLs.
  console.error('Local smoke failed at: ' + step)
  if (step === 'launch Edge') console.error(error.message)
  process.exitCode = 1
} finally {
  await browser?.close()
}

import { expect, type Page } from '@playwright/test'

export async function mainReady(page: Page) {
  // A primary heading is absent from the bootstrap/lazy-loading skeleton.
  await page.locator('main h1').first().waitFor({ state: 'visible' })
}

export async function agencyReadsReady(page: Page) {
  // Wait for the actual invalidated RTK reads, not an assumed delay after a mutation.
  await page.waitForFunction(async () => {
    const modulePath = '/src/app/store/store.ts'
    const { store } = await import(modulePath)
    const state = store.getState() as {
      auth: { status: string }
      agencyApi: { queries: Record<string, { status?: string } | undefined> }
    }
    return (
      state.auth.status !== 'loading' &&
      Object.values(state.agencyApi.queries).every(
        (query) => query?.status !== 'pending',
      )
    )
  })
}

export async function createProjectReady(
  page: Page,
  button: 'Create project' | 'Save as draft',
) {
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/projects$/.test(new URL(response.url()).pathname),
  )
  await page.getByRole('button', { name: button, exact: true }).click()
  const response = await created
  expect(response.status()).toBe(201)
  const { project } = (await response.json()) as { project: { id: string } }
  await page.waitForURL((url) =>
    url.pathname.endsWith('/projects/' + project.id),
  )
  await mainReady(page)
  await agencyReadsReady(page)
  return response
}

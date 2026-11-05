import { test, expect } from '@playwright/test'
test('production PWA caches only fixed public assets and shows honest offline navigation', async ({
  page,
  context,
}) => {
  let signedIn = true
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/logout')) {
      signedIn = false
      return route.fulfill({ status: 204 })
    }
    if (path.endsWith('/auth/csrf'))
      return route.fulfill({ json: { token: 'synthetic-pwa-csrf' } })
    if (signedIn && path.endsWith('/auth/refresh'))
      return route.fulfill({
        json: { accessToken: 'synthetic', expiresIn: 300 },
      })
    if (signedIn && path.endsWith('/me'))
      return route.fulfill({
        json: {
          user: {
            id: 'owner',
            email: 'owner@example.test',
            displayName: 'Owner',
            verified: true,
          },
          memberships: [
            {
              memberId: 'member',
              workspaceId: 'workspace',
              workspaceName: 'Synthetic workspace',
              role: 'OWNER',
            },
          ],
        },
      })
    if (signedIn && path.endsWith('/private-canary'))
      return route.fulfill({ json: { answer: 'private-canary' } })
    return route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } })
  })
  await page.goto('/offline.html')
  await page.evaluate(async () => {
    const unrelated = await caches.open('unrelated-cache')
    await unrelated.put(
      '/manifest.webmanifest',
      new Response('poisoned manifest'),
    )
    const old = await caches.open('collector-public-v1')
    await old.put('/offline.html', new Response('obsolete-canary'))
  })
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: /Get client content/ }),
  ).toBeVisible()
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    await new Promise<void>((resolve) => {
      if (navigator.serviceWorker.controller) resolve()
      else
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => resolve(),
          { once: true },
        )
    })
  })
  const manifest = await page.request.get('/manifest.webmanifest')
  const definition = await manifest.json()
  expect(definition).toMatchObject({
    id: '/',
    name: 'Website Content Collector',
    start_url: '/',
    scope: '/',
    display: 'standalone',
  })
  expect(definition.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192' }),
      expect.objectContaining({ sizes: '512x512' }),
    ]),
  )
  expect(
    await page.evaluate(
      () =>
        document.querySelector('[aria-label="Development environment"]') ===
        null,
    ),
  ).toBe(true)
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .toEqual(['unrelated-cache', 'collector-public-v2'])
  await page.goto('/app/w/workspace/overview')
  await expect(
    page.getByRole('button', { name: 'Sign out', exact: true }),
  ).toBeVisible()
  const canary = await page.evaluate(async () => {
    const response = await fetch('/api/v1/private-canary', {
      headers: { Authorization: 'Bearer synthetic' },
    })
    return response.json()
  })
  expect(canary).toEqual({ answer: 'private-canary' })
  const cacheBeforeLogout = await page.evaluate(async () =>
    (await (await caches.open('collector-public-v2')).keys()).map(
      (request) => request.url,
    ),
  )
  expect(cacheBeforeLogout).toHaveLength(5)
  expect(cacheBeforeLogout.some((url) => url.includes('private-canary'))).toBe(
    false,
  )
  await page.evaluate(async () => {
    const cache = await caches.open('collector-private-old')
    await cache.put('/api/v1/private-canary', new Response('private-canary'))
    await cache.put('/manifest.webmanifest', new Response('poisoned manifest'))
  })
  expect(
    await page.evaluate(async () =>
      (await fetch('/manifest.webmanifest')).json(),
    ),
  ).toMatchObject({ name: 'Website Content Collector' })
  await page.evaluate(() => caches.delete('unrelated-cache'))
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Sign out', exact: true })
    .click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .toEqual(['collector-public-v2'])
  await page.unroute('**/api/v1/**')
  await context.setOffline(true)
  await page.goto('/client/projects/private-offline-canary')
  await expect(
    page.getByRole('heading', { name: 'You’re offline' }),
  ).toBeVisible()
  const urls = await page.evaluate(async () => {
    const cache = await caches.open('collector-public-v2')
    return (await cache.keys()).map((r) => new URL(r.url).pathname).sort()
  })
  expect(urls).toEqual([
    '/icons/collector-192.png',
    '/icons/collector-512.png',
    '/icons/collector.svg',
    '/manifest.webmanifest',
    '/offline.html',
  ])
  expect(urls.some((u) => u.includes('/api/') || u.includes('/client/'))).toBe(
    false,
  )
  expect(
    await page.evaluate(() =>
      fetch('/api/v1/private-canary').then(
        () => true,
        () => false,
      ),
    ),
  ).toBe(false)
  await context.setOffline(false)
})

test('mobile install and offline controls fit a narrow viewport', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.route('**/api/v1/**', (route) =>
    route.fulfill(
      route.request().url().endsWith('/auth/csrf')
        ? { json: { token: 'synthetic-pwa-csrf' } }
        : { status: 401, json: { code: 'UNAUTHENTICATED' } },
    ),
  )
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: /Get client content/ }),
  ).toBeVisible()
  await page.evaluate(() =>
    window.dispatchEvent(
      new Event('beforeinstallprompt', { cancelable: true }),
    ),
  )
  const dismiss = page.getByRole('button', { name: 'Not now' })
  await expect(dismiss).toBeVisible()
  expect((await dismiss.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await dismiss.focus()
  await page.keyboard.press('Enter')
  await expect(dismiss).toHaveCount(0)
  await context.setOffline(true)
  const retry = page.getByRole('button', { name: 'Retry connection' })
  await expect(retry).toBeVisible()
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  )
})

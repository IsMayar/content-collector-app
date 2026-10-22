import { test, expect } from '@playwright/test'
test('production PWA caches only fixed public assets and shows honest offline navigation', async ({
  page,
  context,
}) => {
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({
      status: route.request().url().endsWith('/auth/csrf') ? 200 : 401,
      contentType: 'application/json',
      body: JSON.stringify(
        route.request().url().endsWith('/auth/csrf')
          ? { token: 'synthetic-pwa-csrf' }
          : { code: 'UNAUTHENTICATED', detail: 'Sign in required.' },
      ),
    }),
  )
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: /Great projects/ }),
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
  await page.evaluate(async () => {
    const cache = await caches.open('collector-private-old')
    await cache.put('/api/v1/private-canary', new Response('private-canary'))
    navigator.serviceWorker.controller!.postMessage({
      type: 'CLEAR_PRIVATE_CACHES',
    })
  })
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .toEqual(['collector-public-v1'])
  await context.setOffline(true)
  await page.goto('/client/projects/private-offline-canary')
  await expect(
    page.getByRole('heading', { name: 'A little pause in the connection.' }),
  ).toBeVisible()
  const urls = await page.evaluate(async () => {
    const cache = await caches.open('collector-public-v1')
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
  await context.setOffline(false)
})

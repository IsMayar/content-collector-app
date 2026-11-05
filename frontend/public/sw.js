/* Public assets only. No API responses, navigations, tokens or project content enter Cache Storage. */
const CACHE = 'collector-public-v2'
const PUBLIC = new Map([
  ['/offline.html', ['text/html']],
  ['/manifest.webmanifest', ['application/manifest+json', 'application/json']],
  ['/icons/collector.svg', ['image/svg+xml']],
  ['/icons/collector-192.png', ['image/png']],
  ['/icons/collector-512.png', ['image/png']],
])

async function installPublicAssets() {
  const assets = await Promise.all(
    Array.from(PUBLIC, async ([path, types]) => {
      const response = await fetch(path, {
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
      })
      const type = response.headers.get('Content-Type')?.split(';')[0].trim()
      const policy = response.headers.get('Cache-Control') || ''
      const vary = response.headers.get('Vary') || ''
      if (
        !response.ok ||
        !types.includes(type) ||
        /\b(private|no-store)\b/i.test(policy) ||
        /\b(cookie|authorization)\b|\*/i.test(vary)
      )
        throw new Error('Public asset is unavailable for offline use')
      return [path, response]
    }),
  )
  const cache = await caches.open(CACHE)
  await Promise.all(assets.map(([path, response]) => cache.put(path, response)))
  await self.skipWaiting()
}

async function matchPublic(path) {
  const cache = await caches.open(CACHE)
  return cache.match(path)
}

self.addEventListener('install', (event) => {
  event.waitUntil(installPublicAssets())
})
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('collector-') && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_PRIVATE_CACHES')
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (k) =>
                  k.startsWith('collector-') &&
                  !k.startsWith('collector-public-'),
              )
              .map((k) => caches.delete(k)),
          ),
        ),
    )
})
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin)
    return
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(async () => {
        return (await matchPublic('/offline.html')) || Response.error()
      }),
    )
    return
  }
  if (
    PUBLIC.has(url.pathname) &&
    !url.search &&
    !event.request.headers.has('Authorization')
  ) {
    event.respondWith(
      matchPublic(url.pathname).then((hit) => hit || fetch(event.request)),
    )
  }
})

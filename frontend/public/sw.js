/* Public assets only. No API responses, navigations, tokens or project content enter Cache Storage. */
const CACHE = 'collector-public-v1'
const PUBLIC = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/collector.svg',
  '/icons/collector-192.png',
  '/icons/collector-512.png',
]
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PUBLIC)))
  self.skipWaiting()
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
              .filter((k) => k.startsWith('collector-') && k !== CACHE)
              .map((k) => caches.delete(k)),
          ),
        ),
    )
})
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin)
    return
  if (PUBLIC.includes(url.pathname) && !url.search) {
    event.respondWith(
      caches.match(event.request).then((hit) => hit || fetch(event.request)),
    )
    return
  }
  if (event.request.mode === 'navigate')
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline.html')),
    )
})

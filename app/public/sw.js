// Merzal AI — minimal service worker.
// Makes the app installable (PWA) and speeds up repeat visits: static assets
// are served cache-first; navigations are network-first with an offline shell.
const CACHE = 'merzal-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // App navigations: network-first, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/').then((r) => r || fetch(req))))
    return
  }

  // Static assets on our origin: cache-first, then populate the cache.
  if (url.origin === self.location.origin && /\.(?:js|css|svg|png|woff2?|json|webmanifest)$/.test(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res && res.ok) cache.put(req, res.clone())
        return res
      }),
    )
  }
})

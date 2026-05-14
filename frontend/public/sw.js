// Schräglage Maps service worker.
// Strategy:
//   - Network-first for navigation (HTML) with cache fallback → user always
//     gets the latest UI when online, still loads offline if available.
//   - Stale-while-revalidate for same-origin static assets (JS/CSS/images,
//     icons). Fast paints; background refresh.
//   - Never cache /api/ or /tiles/ — those are large or sensitive to staleness.
// Bump CACHE_VERSION on breaking shell changes to evict old caches on update.

const CACHE_VERSION = 'v1'
const APP_CACHE = `schraeglage-app-${CACHE_VERSION}`
const ASSET_CACHE = `schraeglage-assets-${CACHE_VERSION}`

const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== APP_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

function isBypass(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/tiles/') ||
    url.pathname.startsWith('/photon/')
  )
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (isBypass(url)) return

  // Navigation requests: network-first, fall back to cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(APP_CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('/index.html')))
    )
    return
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.open(ASSET_CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone())
            return res
          })
          .catch(() => cached)
        return cached || network
      })
    )
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

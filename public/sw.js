/* eslint-env serviceworker */
/* GoalSense — service worker (V5)
 * ─────────────────────────────────────────────────────────────────────────
 * Conservative caching strategy:
 *  - Hashed Vite build assets under /assets/ → cache-first (immutable).
 *  - Top-level navigations and HTML → network-first; cached HTML only used
 *    as offline fallback. Never serve a stale shell as if it were fresh.
 *  - API requests (any URL with /api/ or third-party fetch like ESPN) →
 *    network-only. We never cache match data; freshness matters more than
 *    offline tolerance for live football.
 *  - Other static files (manifest, favicons, etc.) → stale-while-revalidate
 *    with a small cap.
 *
 * No push handlers are registered yet. When real backend + token management
 * lands, push/notificationclick handlers can be added here without rewrites.
 */
const SW_VERSION = 'v5-2026-05-26'
const STATIC_CACHE = `gs-static-${SW_VERSION}`
const SHELL_CACHE = `gs-shell-${SW_VERSION}`

// Precache only the absolute minimum: the shell entry. Everything else is
// resolved at runtime so we never pin a partial app in the cache.
const PRECACHE_URLS = ['/', '/index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
  )
  // Activate immediately on install for first-time visitors.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => {
      if (k !== STATIC_CACHE && k !== SHELL_CACHE) return caches.delete(k)
      return undefined
    }))
    await self.clients.claim()
  })())
})

function isApiRequest(url) {
  return url.pathname.startsWith('/api/') ||
    url.hostname.endsWith('site.api.espn.com') ||
    url.hostname.endsWith('api-football-v1.p.rapidapi.com') ||
    url.hostname.endsWith('api.football-data.org')
}

function isHashedAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/assets/')
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'))
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Strategy 1: Live data. Always network. Don't cache match results.
  if (isApiRequest(url)) {
    event.respondWith(fetch(request))
    return
  }

  // Strategy 2: Hashed Vite assets. Cache-first because the URL changes on rebuild.
  if (isHashedAsset(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      try {
        const fresh = await fetch(request)
        if (fresh.ok) {
          const cache = await caches.open(STATIC_CACHE)
          cache.put(request, fresh.clone())
        }
        return fresh
      } catch (e) {
        return cached || Response.error()
      }
    })())
    return
  }

  // Strategy 3: Navigations. Network-first, fall back to cached shell.
  if (isNavigationRequest(request)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request)
        if (fresh.ok) {
          const cache = await caches.open(SHELL_CACHE)
          cache.put('/index.html', fresh.clone()).catch(() => undefined)
        }
        return fresh
      } catch (e) {
        const cached = await caches.match('/index.html')
        if (cached) return cached
        return new Response('Sem conexão.', { status: 503, statusText: 'Service Unavailable', headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      }
    })())
    return
  }

  // Strategy 4: Other GETs (manifest, fonts, icons). Stale-while-revalidate.
  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE)
    const cached = await cache.match(request)
    const networkPromise = fetch(request).then((res) => {
      if (res.ok) cache.put(request, res.clone()).catch(() => undefined)
      return res
    }).catch(() => cached || Response.error())
    return cached || networkPromise
  })())
})

// Allow the page to ask the SW to skip waiting (used after detecting a new
// version). Safe no-op if no message is sent.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

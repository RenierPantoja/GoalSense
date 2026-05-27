/**
 * pwaRegistration — service worker lifecycle helpers.
 * ─────────────────────────────────────────────────────────────────────────────
 * V5 — registers `/sw.js` only in production and only when the browser
 * supports `serviceWorker`. Every operation is wrapped so a failure on the
 * SW side never derails the React app.
 *
 * The SW itself (public/sw.js) is conservative: API requests stay
 * network-only, hashed Vite assets are cache-first, navigations are
 * network-first with a cached shell as the offline fallback.
 */

export type ServiceWorkerStatus =
  | 'unsupported'   // Browser has no `serviceWorker` API.
  | 'inactive'      // Supported but no controller registered yet.
  | 'registering'   // Registration in flight.
  | 'active'        // Registered and controlling the page.
  | 'error'         // Last registration attempt threw.

const SW_URL = '/sw.js'
const SW_SCOPE = '/'

/** True when the runtime exposes the service-worker API. */
export function isServiceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

/**
 * Snapshot the current SW status without doing any side-effect.
 * Useful for the Settings panel that just wants to display state.
 */
export async function getServiceWorkerStatus(): Promise<ServiceWorkerStatus> {
  if (!isServiceWorkerSupported()) return 'unsupported'
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE)
    if (!reg) return 'inactive'
    if (reg.active) return 'active'
    if (reg.installing || reg.waiting) return 'registering'
    return 'inactive'
  } catch {
    return 'error'
  }
}

/**
 * Register the SW. Idempotent — if already registered, just returns the
 * current status. In dev (`import.meta.env.DEV`) we deliberately skip
 * registration so HMR and source maps keep behaving normally.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerStatus> {
  if (!isServiceWorkerSupported()) return 'unsupported'
  // Skip in dev unless the build was explicitly produced with PWA flag.
  // import.meta.env.DEV === true only during `vite dev`.
  // import.meta.env.PROD === true during `vite build` + `vite preview`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (import.meta as any).env
  if (env && env.DEV) return 'inactive'
  try {
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE, type: 'classic' })
    if (reg.active) return 'active'
    return 'registering'
  } catch (err) {
    if (typeof console !== 'undefined') console.warn('[GoalSense] service worker registration failed', err)
    return 'error'
  }
}

/** Best-effort unregister — used by Settings to fully clean up. */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!isServiceWorkerSupported()) return false
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE)
    if (!reg) return false
    return await reg.unregister()
  } catch {
    return false
  }
}

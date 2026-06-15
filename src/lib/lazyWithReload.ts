/**
 * lazyWithReload — resilient dynamic imports across deployments.
 * ─────────────────────────────────────────────────────────────────────────────
 * After a new deploy, an already-open app shell references OLD hashed chunk
 * filenames. Those 404 (or the host returns index.html → MIME "text/html"
 * error). This wraps dynamic imports so the FIRST such failure triggers a
 * one-time full reload to fetch the fresh shell + chunk map. A sessionStorage
 * guard prevents reload loops if the chunk is genuinely broken.
 *
 * No app behaviour changes on the happy path.
 */
import { lazy, type ComponentType } from 'react'

const RELOAD_FLAG = 'goalsense_chunk_reloaded'

function isChunkLoadError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '')
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|expected a javascript-or-wasm module script|Failed to load module script|dynamically imported module/i.test(msg)
}

function alreadyReloaded(): boolean {
  try { return sessionStorage.getItem(RELOAD_FLAG) === '1' } catch { return false }
}
function markReloaded(): void {
  try { sessionStorage.setItem(RELOAD_FLAG, '1') } catch { /* ignore */ }
}
function clearReloaded(): void {
  try { sessionStorage.removeItem(RELOAD_FLAG) } catch { /* ignore */ }
}

/** Run a dynamic import; on a stale-chunk failure, reload once to get the fresh build. */
export function importWithReload<T>(factory: () => Promise<T>): Promise<T> {
  return factory().then(
    (mod) => { clearReloaded(); return mod },
    (err) => {
      if (isChunkLoadError(err) && !alreadyReloaded() && typeof window !== 'undefined') {
        markReloaded()
        window.location.reload()
        // Keep the promise pending while the page reloads.
        return new Promise<T>(() => { /* never resolves */ })
      }
      throw err
    },
  )
}

/** Drop-in replacement for React.lazy that reloads once on stale-chunk errors. */
export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() => importWithReload(factory))
}

/**
 * Global safety net: Vite emits `vite:preloadError` when a preloaded chunk fails
 * to load. Reload once to recover. Registered from main.tsx.
 */
export function registerChunkReloadHandler(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('vite:preloadError', (event) => {
    if (alreadyReloaded()) return
    event.preventDefault?.()
    markReloaded()
    window.location.reload()
  })
}

/**
 * modalPreload — cached dynamic imports for the three Pattern Studio modals.
 * ─────────────────────────────────────────────────────────────────────────────
 * V4.4 — used by both `React.lazy` (the actual component loader) and by the
 * UI-side prefetch helpers triggered on hover/focus of the relevant CTAs.
 *
 * Why a dedicated module:
 *  - Single source of truth for the dynamic import path; no risk of two
 *    different specifiers being treated as separate chunks by Vite.
 *  - Cached promise per modal so multiple prefetch triggers (hover + focus +
 *    actual click) all reuse the same in-flight request and never download
 *    twice.
 *  - Pure module: no `window`, no `document`, no side-effects at import time.
 *    Safe to evaluate during SSR or any environment that runs the bundle.
 */
type CustomModule = typeof import('./CustomPatternModal')
type AutoModule = typeof import('./AutoDiscoveryConfigModal')

import { importWithReload } from '@/lib/lazyWithReload'

let customModalPromise: Promise<CustomModule> | null = null
let autoModalPromise: Promise<AutoModule> | null = null

/** Returns (and caches) the dynamic import of CustomPatternModal. */
export function importCustomPatternModal(): Promise<CustomModule> {
  if (!customModalPromise) {
    customModalPromise = importWithReload(() => import('./CustomPatternModal'))
      .catch((e) => { customModalPromise = null; throw e })
  }
  return customModalPromise
}

/** Returns (and caches) the dynamic import of AutoDiscoveryConfigModal. */
export function importAutoDiscoveryConfigModal(): Promise<AutoModule> {
  if (!autoModalPromise) {
    autoModalPromise = importWithReload(() => import('./AutoDiscoveryConfigModal'))
      .catch((e) => { autoModalPromise = null; throw e })
  }
  return autoModalPromise
}

/** Fire-and-forget prefetch of the CustomPatternModal chunk. */
export function preloadCustomPatternModal(): void {
  void importCustomPatternModal()
}

/** Fire-and-forget prefetch of the AutoDiscoveryConfigModal chunk. */
export function preloadAutoDiscoveryConfigModal(): void {
  void importAutoDiscoveryConfigModal()
}

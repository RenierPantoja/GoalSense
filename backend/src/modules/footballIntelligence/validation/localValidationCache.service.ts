/**
 * Local Validation Cache (B49 / Bloco 6).
 * ─────────────────────────────────────────────────────────────────────────────
 * Per-run, in-memory cache to avoid expensive rebuilds within a single validation run
 * (Package V5, Readiness V7, Influence, governance, etc.). The cache is per-process and
 * is NEVER a source of truth — it only memoizes within a run and is invalidated on
 * domain/lineup/manual/live/mapping changes. Bounded; cleared when the run completes.
 */
import { buildMatchIntelligencePackageV5, type MatchIntelligencePackageV5 } from '../matchIntelligencePackageV5.service.js'
import { buildFundamentalReadinessV7 } from '../fundamentalReadinessEngine.service.js'
import { composeInfluence, type ComposedInfluence } from '../influence/influenceLedger.service.js'

interface RunCache {
  runId: string
  packages: Map<string, MatchIntelligencePackageV5 | null>
  readiness: Map<string, any>
  influence: Map<string, ComposedInfluence | null>
  hits: number
  misses: number
}

const CACHES = new Map<string, RunCache>()

export function getRunCache(runId: string): RunCache {
  let c = CACHES.get(runId)
  if (!c) { c = { runId, packages: new Map(), readiness: new Map(), influence: new Map(), hits: 0, misses: 0 }; CACHES.set(runId, c) }
  return c
}

export async function getOrBuildPackage(runId: string, fixtureId: string): Promise<MatchIntelligencePackageV5 | null> {
  const c = getRunCache(runId)
  if (c.packages.has(fixtureId)) { c.hits++; return c.packages.get(fixtureId) ?? null }
  c.misses++
  const pkg = await buildMatchIntelligencePackageV5(fixtureId).catch(() => null)
  c.packages.set(fixtureId, pkg)
  return pkg
}

export async function getOrBuildReadiness(runId: string, fixtureId: string): Promise<any> {
  const c = getRunCache(runId)
  if (c.readiness.has(fixtureId)) { c.hits++; return c.readiness.get(fixtureId) }
  c.misses++
  const r = await buildFundamentalReadinessV7(fixtureId).catch(() => null)
  c.readiness.set(fixtureId, r)
  return r
}

export async function getOrBuildInfluence(runId: string, fixtureId: string, patternId: string | null = null): Promise<ComposedInfluence | null> {
  const c = getRunCache(runId)
  const key = `${fixtureId}__${patternId ?? 'fixture'}`
  if (c.influence.has(key)) { c.hits++; return c.influence.get(key) ?? null }
  c.misses++
  const inf = await composeInfluence(fixtureId, patternId).catch(() => null)
  c.influence.set(key, inf)
  return inf
}

export function invalidateFixtureCache(runId: string, fixtureId: string, _reason: string): void {
  const c = CACHES.get(runId)
  if (!c) return
  c.packages.delete(fixtureId)
  c.readiness.delete(fixtureId)
  for (const k of [...c.influence.keys()]) if (k.startsWith(`${fixtureId}__`)) c.influence.delete(k)
}

export function getCacheMetrics(runId: string): { hits: number; misses: number } {
  const c = CACHES.get(runId)
  return { hits: c?.hits ?? 0, misses: c?.misses ?? 0 }
}

export function clearRunCache(runId: string): void { CACHES.delete(runId) }

/**
 * Pre-Match Data Store (B40).
 * ─────────────────────────────────────────────────────────────────────────────
 * Persists/reads PreMatchDomainSnapshot + PreMatchAcquisitionRun. Non-fatal; under
 * Noop (Prisma) nothing persists and reads return null/[] (honest). Snapshots carry
 * fetchedAt/freshness/availability + a logical expiresAt; stale snapshots can still
 * be read but are flagged. No secrets, no giant payloads.
 */
import { createHash } from 'node:crypto'
import { env } from '../../env.js'
import { createRepositories } from '../../repositories/index.js'
import type { AcquisitionDomain, DomainFetchResult, Freshness } from './providers/provider.types.js'
import type { PreMatchDomainSnapshot, PreMatchAcquisitionRun } from './preMatchAcquisition.types.js'

export function snapshotId(fixtureId: string, domain: string): string {
  const h = createHash('sha1').update(`${fixtureId}|${domain}`).digest('hex').slice(0, 16)
  return `pms_${h}`
}

function ttlMs(): number { return Math.max(1, Number(env.PRE_MATCH_SNAPSHOT_TTL_HOURS) || 12) * 3600000 }

export function fromFetchResult(fixtureId: string, r: DomainFetchResult): PreMatchDomainSnapshot {
  const now = Date.now()
  return {
    id: snapshotId(fixtureId, r.domain),
    fixtureId, domain: r.domain, provider: r.provider,
    fetchedAt: r.fetchedAt || new Date(now).toISOString(),
    freshness: r.freshness, availability: r.availability, dataQuality: r.dataQuality,
    payloadSummary: (r.payloadSummary || '').slice(0, 280),
    canonicalData: r.canonicalData ?? null,
    limitations: r.limitations ?? [],
    expiresAt: new Date(now + ttlMs()).toISOString(),
  }
}

export async function savePreMatchDomainSnapshot(snapshot: PreMatchDomainSnapshot): Promise<void> {
  try { await createRepositories().intelligence.savePreMatchDomainSnapshot(snapshot) }
  catch (e: any) { console.warn(`[B40] save snapshot failed (non-fatal): ${String(e?.message || e).slice(0, 70)}`) }
}

export async function getPreMatchDomainSnapshot(fixtureId: string, domain: AcquisitionDomain): Promise<PreMatchDomainSnapshot | null> {
  try { return await createRepositories().intelligence.getPreMatchDomainSnapshot(fixtureId, domain) } catch { return null }
}

export async function listPreMatchDomainSnapshots(fixtureId: string, limit = 100): Promise<PreMatchDomainSnapshot[]> {
  try { return await createRepositories().intelligence.listPreMatchDomainSnapshots(fixtureId, limit) } catch { return [] }
}

export function isSnapshotFresh(s: PreMatchDomainSnapshot | null): boolean {
  if (!s || !s.expiresAt) return false
  return new Date(s.expiresAt).getTime() > Date.now()
}

export function effectiveFreshness(s: PreMatchDomainSnapshot | null): Freshness {
  if (!s) return 'unknown'
  return isSnapshotFresh(s) ? s.freshness : 'stale'
}

export async function createAcquisitionRun(run: PreMatchAcquisitionRun): Promise<void> {
  try { await createRepositories().intelligence.createPreMatchAcquisitionRun(run) } catch { /* non-fatal */ }
}
export async function updateAcquisitionRun(id: string, patch: Partial<PreMatchAcquisitionRun>): Promise<void> {
  try { await createRepositories().intelligence.updatePreMatchAcquisitionRun(id, patch) } catch { /* non-fatal */ }
}
export async function listAcquisitionRuns(fixtureId?: string, limit = 50): Promise<PreMatchAcquisitionRun[]> {
  try { return await createRepositories().intelligence.listPreMatchAcquisitionRuns({ fixtureId, limit }) } catch { return [] }
}
export async function getAcquisitionRun(id: string): Promise<PreMatchAcquisitionRun | null> {
  try { return await createRepositories().intelligence.getPreMatchAcquisitionRun(id) } catch { return null }
}

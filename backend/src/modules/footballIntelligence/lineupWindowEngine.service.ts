/**
 * Lineup Window Engine (B40) — manage the critical moment lineups drop.
 * ─────────────────────────────────────────────────────────────────────────────
 * Decides whether to wait for / refresh the lineup and detects the impact of a
 * change. Honest: lineup absent before its window = `too_early`/`not_available_yet`
 * (never a failure); absent AFTER the window with no provider = provider_not_supported
 * or stale. A lineup change can invalidate a prior read → recommend re-evaluation.
 */
import { createRepositories } from '../../repositories/index.js'
import { getPreMatchDomainSnapshot, isSnapshotFresh } from './preMatchDataStore.service.js'
import { getBestProviderForDomain } from './providers/providerRegistry.service.js'
import type { LineupWindowState, LineupWindowStatus, LineupImpact } from './preMatchAcquisition.types.js'

const LIVE = ['1H', '2H', 'HT', 'ET', 'BT', 'P']
const FINISHED = ['FT', 'AET', 'PEN']
const PROBABLE_WINDOW_MIN = 360 // 6h
const CONFIRMED_WINDOW_MIN = 90

export async function getLineupWindowStatus(fixtureId: string): Promise<LineupWindowState> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  const limitations: string[] = ['Escalações não são coletadas pelo backend a menos que um provider esteja configurado.']
  if (!fixture) return { fixtureId, status: 'unknown', minutesToKickoff: null, lineupSnapshotAt: null, shouldWait: false, shouldRefreshNow: false, nextRecommendedCheckAt: null, limitations: ['Fixture não encontrada.'] }

  const now = Date.now()
  const kickoff = fixture.startTime ? new Date(fixture.startTime).getTime() : null
  const minutesToKickoff = kickoff != null ? Math.round((kickoff - now) / 60000) : null
  const confirmedSnap = await getPreMatchDomainSnapshot(fixtureId, 'confirmed_lineups').catch(() => null)
  const providerSupports = !!getBestProviderForDomain('confirmed_lineups') || !!getBestProviderForDomain('probable_lineups')

  let status: LineupWindowStatus
  let shouldWait = false
  let shouldRefreshNow = false
  let nextRecommendedCheckAt: string | null = null

  const hasConfirmed = !!confirmedSnap && (confirmedSnap.availability === 'available' || confirmedSnap.availability === 'partial')

  if (FINISHED.includes(fixture.status) || LIVE.includes(fixture.status)) {
    status = hasConfirmed ? 'confirmed_available' : (providerSupports ? 'stale' : 'provider_not_supported')
  } else if (!providerSupports) {
    status = 'provider_not_supported'
    limitations.push('Nenhum provider de escalação configurado — não é falha, é limitação.')
  } else if (minutesToKickoff == null) {
    status = 'unknown'
  } else if (minutesToKickoff > PROBABLE_WINDOW_MIN) {
    status = 'too_early'; shouldWait = true; nextRecommendedCheckAt = new Date(now + (minutesToKickoff - PROBABLE_WINDOW_MIN) * 60000).toISOString()
  } else if (minutesToKickoff > CONFIRMED_WINDOW_MIN) {
    status = 'probable_expected'; shouldWait = true; nextRecommendedCheckAt = new Date(now + (minutesToKickoff - CONFIRMED_WINDOW_MIN) * 60000).toISOString()
  } else if (hasConfirmed && isSnapshotFresh(confirmedSnap)) {
    status = 'confirmed_available'
  } else if (minutesToKickoff <= CONFIRMED_WINDOW_MIN && minutesToKickoff >= 0) {
    status = 'confirmed_expected_soon'; shouldRefreshNow = true
  } else {
    status = 'unknown'
  }

  return { fixtureId, status, minutesToKickoff, lineupSnapshotAt: confirmedSnap?.fetchedAt ?? null, shouldWait, shouldRefreshNow, nextRecommendedCheckAt, limitations }
}

export async function shouldWaitForLineup(fixtureId: string): Promise<boolean> {
  return (await getLineupWindowStatus(fixtureId)).shouldWait
}
export async function shouldRefreshLineupNow(fixtureId: string): Promise<boolean> {
  return (await getLineupWindowStatus(fixtureId)).shouldRefreshNow
}

/** Detect impact between two lineup snapshots. Honest unknowns when player importance is absent. */
export function detectLineupChangeImpact(previous: unknown | null, current: unknown | null): LineupImpact {
  const limitations = ['Impacto de escalação não inferível sem dados estruturados de jogador (importância unknown).']
  if (!previous || !current) {
    return { keyPlayerMissing: 'unknown', keyPlayerReturned: 'unknown', tacticalShapeChanged: 'unknown', goalkeeperChanged: 'unknown', defenseWeakened: 'unknown', attackWeakened: 'unknown', rotationDetected: 'unknown', analysisImpact: 'uncertain', shouldReevaluatePrecheck: !!current && !previous, shouldWait: false, limitations }
  }
  // We do not have structured lineup payloads in the backend yet → everything unknown.
  return { keyPlayerMissing: 'unknown', keyPlayerReturned: 'unknown', tacticalShapeChanged: 'unknown', goalkeeperChanged: 'unknown', defenseWeakened: 'unknown', attackWeakened: 'unknown', rotationDetected: 'unknown', analysisImpact: 'uncertain', shouldReevaluatePrecheck: true, shouldWait: false, limitations }
}

export async function buildLineupImpactReport(fixtureId: string): Promise<{ window: LineupWindowState; impact: LineupImpact }> {
  const window = await getLineupWindowStatus(fixtureId)
  const snap = await getPreMatchDomainSnapshot(fixtureId, 'confirmed_lineups').catch(() => null)
  const impact = detectLineupChangeImpact(null, snap?.canonicalData ?? null)
  return { window, impact }
}

export async function recomputeReadinessAfterLineup(fixtureId: string): Promise<{ shouldReevaluate: boolean; reason: string }> {
  const w = await getLineupWindowStatus(fixtureId)
  if (w.status === 'confirmed_available') return { shouldReevaluate: true, reason: 'Escalação confirmada disponível — recomputar readiness/precheck.' }
  if (w.shouldWait) return { shouldReevaluate: false, reason: 'Escalação ainda não disponível — aguardar.' }
  return { shouldReevaluate: false, reason: 'Sem mudança de escalação relevante.' }
}

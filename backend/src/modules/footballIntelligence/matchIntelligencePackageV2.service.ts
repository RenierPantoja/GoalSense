/**
 * Match Intelligence Package V2 (B40).
 * ─────────────────────────────────────────────────────────────────────────────
 * Extends the B39 package with acquisition status, persisted domain snapshots,
 * lineup window, player importance, readiness V2, precheck V2, provider reliability,
 * and refresh recommendations. Separates current vs stale; shows what is missing.
 * Never invents data.
 */
import { buildMatchIntelligencePackage, type MatchIntelligencePackage } from './matchIntelligencePackage.service.js'
import { buildFundamentalReadinessV2, type FundamentalReadinessV2 } from './fundamentalReadinessEngine.service.js'
import { runAlertDecisionPrecheckV2, type AlertDecisionPrecheckV2Result } from './alertDecisionPrecheck.service.js'
import { getLineupWindowStatus } from './lineupWindowEngine.service.js'
import { buildFixturePlayerImportance } from './playerImportance.service.js'
import { listPreMatchDomainSnapshots, listAcquisitionRuns, effectiveFreshness } from './preMatchDataStore.service.js'
import { buildProviderStackReport, getBestProviderForDomain } from './providers/providerRegistry.service.js'
import type { LineupWindowState, PlayerImportanceProfile, PreMatchDomainSnapshot } from './preMatchAcquisition.types.js'

const CRITICAL_DOMAINS = ['confirmed_lineups', 'injuries', 'suspensions', 'standings'] as const

export interface MatchIntelligencePackageV2 {
  base: MatchIntelligencePackage
  acquisitionStatus: { lastRunAt: string | null; runs: number }
  domainSnapshots: Array<{ domain: string; provider: string | null; availability: string; freshness: string; fetchedAt: string; stale: boolean }>
  lineupWindow: LineupWindowState | null
  playerImportance: { home: PlayerImportanceProfile[]; away: PlayerImportanceProfile[] }
  readinessV2: FundamentalReadinessV2 | null
  precheckV2: AlertDecisionPrecheckV2Result | null
  missingCriticalDomains: string[]
  lastRefreshAt: string | null
  nextRecommendedRefreshAt: string | null
  providerReliability: { configured: string[]; unconfigured: string[] }
  shouldRefreshNow: boolean
  limitations: string[]
}

export async function buildMatchIntelligencePackageV2(fixtureId: string): Promise<MatchIntelligencePackageV2 | null> {
  const base = await buildMatchIntelligencePackage(fixtureId)
  if (!base) return null

  const [readinessV2, precheckV2, lineupWindow, players, snapshots, runs, stack] = await Promise.all([
    buildFundamentalReadinessV2(fixtureId).catch(() => null),
    runAlertDecisionPrecheckV2(fixtureId).catch(() => null),
    getLineupWindowStatus(fixtureId).catch(() => null),
    buildFixturePlayerImportance(fixtureId).catch(() => ({ home: [], away: [], limitations: [] })),
    listPreMatchDomainSnapshots(fixtureId, 100).catch(() => [] as PreMatchDomainSnapshot[]),
    listAcquisitionRuns(fixtureId, 20).catch(() => []),
    Promise.resolve(buildProviderStackReport()),
  ])

  const domainSnapshots = snapshots.map(s => ({
    domain: s.domain, provider: s.provider, availability: s.availability,
    freshness: effectiveFreshness(s), fetchedAt: s.fetchedAt, stale: effectiveFreshness(s) === 'stale',
  }))

  const missingCriticalDomains = CRITICAL_DOMAINS.filter(d => !getBestProviderForDomain(d))
  const lastRefreshAt = snapshots.length ? snapshots.map(s => s.fetchedAt).sort().slice(-1)[0] : null
  const shouldRefreshNow = !!lineupWindow?.shouldRefreshNow || domainSnapshots.some(s => s.stale)
  const nextRecommendedRefreshAt = lineupWindow?.nextRecommendedCheckAt ?? null

  return {
    base,
    acquisitionStatus: { lastRunAt: (runs[0] as any)?.startedAt ?? null, runs: runs.length },
    domainSnapshots,
    lineupWindow,
    playerImportance: { home: players.home, away: players.away },
    readinessV2,
    precheckV2,
    missingCriticalDomains,
    lastRefreshAt,
    nextRecommendedRefreshAt,
    providerReliability: { configured: stack.configured, unconfigured: stack.unconfigured },
    shouldRefreshNow,
    limitations: [
      'Pacote V2 consolida aquisição + janelas; dados ausentes são marcados, não inventados.',
      ...(missingCriticalDomains.length ? [`Domínios críticos sem provider: ${missingCriticalDomains.join(', ')}.`] : []),
    ],
  }
}

/**
 * Data Coverage Monitor (Phase B30) — honest snapshot/coverage quality.
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads recent live snapshots/fixtures from the repository to report coverage and
 * data quality. `unknown`/missing is explicit and is NEVER counted as a failure.
 * No invented data; empty/honest when there is nothing yet.
 */
import { createRepositories } from '../../repositories/index.js'
import { getSnapshotGuardStatus } from './snapshotWriteGuard.service.js'
import { getProviderUsage } from './providerUsageGuard.service.js'

const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT']

export interface CoverageReport {
  fixturesLive: number
  fixturesWithSnapshot: number
  fixturesWithoutSnapshot: number
  quality: { rich: number; partial: number; poor: number; unknown: number }
  staleSnapshots: number
  lowCoverageLeagues: { league: string; live: number; withSnapshot: number }[]
  snapshotGuard: ReturnType<typeof getSnapshotGuardStatus>
  providerUsage: ReturnType<typeof getProviderUsage>
  limitations: string[]
  generatedAt: string
}

const STALE_MS = 5 * 60 * 1000

export async function getCoverageReport(): Promise<CoverageReport> {
  const repos = createRepositories()
  const limitations: string[] = []
  let fixtures: any[] = []
  try { fixtures = await repos.fixtures.listLive(LIVE_STATUSES, 100) } catch { limitations.push('Não foi possível listar jogos ao vivo (provider/persistência indisponível).') }

  const quality = { rich: 0, partial: 0, poor: 0, unknown: 0 }
  const byLeague = new Map<string, { live: number; withSnapshot: number }>()
  let withSnapshot = 0, stale = 0
  const now = Date.now()

  for (const fx of fixtures) {
    const league = (fx.competition || 'desconhecida') as string
    const lg = byLeague.get(league) || { live: 0, withSnapshot: 0 }
    lg.live++
    let snap: any = null
    try { snap = await repos.liveSnapshots.findLatestByFixture(fx.id) } catch { /* honest: treated as no snapshot */ }
    if (snap) {
      withSnapshot++; lg.withSnapshot++
      const dq = (snap.dataQuality as string) || 'unknown'
      if (dq === 'rich') quality.rich++
      else if (dq === 'partial') quality.partial++
      else if (dq === 'poor') quality.poor++
      else quality.unknown++
      const capturedAt = snap.capturedAt ? new Date(snap.capturedAt).getTime() : null
      if (capturedAt != null && now - capturedAt > STALE_MS) stale++
    }
    byLeague.set(league, lg)
  }

  const lowCoverageLeagues = [...byLeague.entries()]
    .filter(([, v]) => v.live > 0 && v.withSnapshot < v.live)
    .map(([league, v]) => ({ league, live: v.live, withSnapshot: v.withSnapshot }))
    .sort((a, b) => (a.withSnapshot / a.live) - (b.withSnapshot / b.live))
    .slice(0, 10)

  if (fixtures.length === 0) limitations.push('Nenhum jogo ao vivo no momento (cobertura zero é honesta, não é falha).')
  limitations.push('Dados ausentes/unknown são explícitos e nunca contam como falha.')

  return {
    fixturesLive: fixtures.length,
    fixturesWithSnapshot: withSnapshot,
    fixturesWithoutSnapshot: Math.max(0, fixtures.length - withSnapshot),
    quality,
    staleSnapshots: stale,
    lowCoverageLeagues,
    snapshotGuard: getSnapshotGuardStatus(),
    providerUsage: getProviderUsage(),
    limitations,
    generatedAt: new Date().toISOString(),
  }
}

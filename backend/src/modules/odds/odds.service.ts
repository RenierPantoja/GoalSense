import { prisma } from '../../db/client.js'
import { env } from '../../env.js'
import { getConfiguredProvider, getResolvedApiKey, fetchLiveOdds } from '../../providers/odds/oddsProvider.service.js'
import { getCandidateMarketsForAlert } from '../../providers/odds/oddsMarketMapper.js'
import type { NormalizedOddsMarket } from '../../providers/odds/oddsProvider.types.js'

export async function getOddsStatus() {
  const enabled = env.ODDS_ENABLED === 'true'
  const provider = getConfiguredProvider()
  const hasKey = !!getResolvedApiKey()
  return {
    enabled,
    provider,
    configured: enabled && provider !== 'none' && hasKey,
    cacheTtlSeconds: env.ODDS_CACHE_TTL_SECONDS
  }
}

export async function fetchOddsForFixture(fixtureId: string) {
  const status = await getOddsStatus()
  if (!status.enabled) return { success: false, error: 'Odds disabled' }

  const fixture = await prisma.fixture.findUnique({ where: { id: fixtureId } })
  if (!fixture) return { success: false, error: 'Fixture not found' }

  const res = await fetchLiveOdds(fixture.id, fixture.providerFixtureId)
  if (!res.success) return res

  // Save to db
  const snapshots = await Promise.all(
    res.markets.map(m => 
      prisma.oddsSnapshot.create({
        data: {
          fixtureId,
          provider: m.provider,
          bookmaker: m.bookmaker || 'unknown',
          marketType: m.marketType,
          selection: m.selection,
          line: m.line,
          odds: m.odds,
          currency: m.currency,
          capturedAt: new Date(m.capturedAt),
          rawJson: m.raw ? JSON.stringify(m.raw) : null
        }
      })
    )
  )

  return { success: true, count: snapshots.length, markets: res.markets }
}

export async function getOddsForAlert(alertId: string) {
  const status = await getOddsStatus()
  if (!status.enabled) return { enabled: false, available: false, alertId, candidateMarkets: [], markets: [], bestByMarket: {}, stale: false, warnings: [] }

  const alert = await prisma.alert.findUnique({ where: { id: alertId } })
  if (!alert) throw new Error('Alert not found')

  const evidence = alert.evidenceJson ? JSON.parse(alert.evidenceJson) : {}
  const candidateMarkets = getCandidateMarketsForAlert({
    patternType: undefined, // inferred in mapper if not explicitly saved
    patternName: evidence.patternName
  })

  // Get latest snapshots for the fixture
  const cutoff = new Date(Date.now() - env.ODDS_CACHE_TTL_SECONDS * 1000)
  
  const recentSnapshots = await prisma.oddsSnapshot.findMany({
    where: { fixtureId: alert.fixtureId },
    orderBy: { capturedAt: 'desc' },
    take: 100
  })

  if (recentSnapshots.length === 0) {
    return { enabled: true, available: false, alertId, fixtureId: alert.fixtureId, candidateMarkets, markets: [], bestByMarket: {}, stale: false, warnings: [] }
  }

  // Check if they are stale
  const latestCapture = recentSnapshots[0].capturedAt
  const stale = latestCapture < cutoff

  // Filter to candidate markets
  const markets: NormalizedOddsMarket[] = recentSnapshots
    .filter(s => candidateMarkets.includes(s.marketType as any))
    .map(s => ({
      provider: s.provider,
      bookmaker: s.bookmaker,
      marketType: s.marketType as any,
      selection: s.selection,
      line: s.line ?? undefined,
      odds: s.odds,
      currency: s.currency ?? undefined,
      capturedAt: s.capturedAt.toISOString()
    }))

  // Calculate best by market
  const bestByMarket: Record<string, NormalizedOddsMarket> = {}
  for (const m of markets) {
    if (!bestByMarket[m.marketType] || m.odds > bestByMarket[m.marketType].odds) {
      bestByMarket[m.marketType] = m
    }
  }

  // Save to AlertOddsContext if not stale and we have best odds, only once per alert
  if (!stale && markets.length > 0) {
    for (const [marketType, best] of Object.entries(bestByMarket)) {
      const existing = await prisma.alertOddsContext.findFirst({
        where: { alertId, marketType }
      })
      if (!existing) {
        await prisma.alertOddsContext.create({
          data: {
            alertId,
            fixtureId: alert.fixtureId,
            marketType,
            selectedLine: best.line,
            bestOdds: best.odds,
            bookmaker: best.bookmaker || 'unknown',
            provider: best.provider,
            capturedAt: new Date(best.capturedAt)
          }
        })
      }
    }
  }

  return {
    enabled: true,
    available: markets.length > 0,
    alertId,
    fixtureId: alert.fixtureId,
    candidateMarkets,
    markets,
    bestByMarket,
    stale,
    capturedAt: latestCapture.toISOString(),
    warnings: stale ? ['Odds may be outdated'] : []
  }
}

export async function refreshOddsForAlert(alertId: string) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } })
  if (!alert) throw new Error('Alert not found')

  const fetchRes = await fetchOddsForFixture(alert.fixtureId)
  if (!fetchRes.success) throw new Error(fetchRes.error || 'Failed to fetch odds')

  return getOddsForAlert(alertId)
}

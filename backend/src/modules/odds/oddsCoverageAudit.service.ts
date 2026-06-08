/**
 * Odds Coverage Audit — analyzes what markets the provider actually delivers.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase D2.1: QA + market coverage. No EV, no ROI, no betting recommendations.
 * Read-only analysis. Does NOT create deliveries or place bets.
 */
import { prisma } from '../../db/client.js'
import { fetchLiveOdds } from '../../providers/odds/oddsProvider.service.js'
import { inferMarketFromPatternType } from '../../providers/odds/oddsMarketMapper.js'
import type { NormalizedOddsMarket, OddsMarketType } from '../../providers/odds/oddsProvider.types.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export type OddsTiming = 'pre_match' | 'live' | 'unknown'

export interface MarketCoverageReport {
  fixtureId: string
  matchLabel: string
  competition: string
  status: string
  marketsFound: OddsMarketType[]
  bookmakersFound: string[]
  hasMatchWinner: boolean
  hasOverUnderGoals: boolean
  hasBothTeamsScore: boolean
  hasCorners: boolean
  hasCards: boolean
  hasAsianHandicap: boolean
  hasNextGoal: boolean
  unknownMarkets: number
  totalOdds: number
  oddsTiming: OddsTiming
  capturedAt: string | null
  warnings: string[]
}

export interface OddsSnapshotQuality {
  hasBookmaker: boolean
  hasMarketType: boolean
  hasSelection: boolean
  hasValidOdds: boolean
  hasCapturedAt: boolean
  timing: OddsTiming
  quality: 'usable' | 'partial' | 'unusable'
  warnings: string[]
}

export interface AlertMarketCompatibility {
  patternType: string
  candidateMarkets: OddsMarketType[]
  foundMarkets: OddsMarketType[]
  missingMarkets: OddsMarketType[]
  support: 'supported' | 'partially_supported' | 'unsupported'
  reason: string
}

// ─── Snapshot Quality ────────────────────────────────────────────────────────

export function assessOddsSnapshotQuality(market: NormalizedOddsMarket): OddsSnapshotQuality {
  const warnings: string[] = []
  const hasBookmaker = !!market.bookmaker && market.bookmaker !== 'unknown'
  const hasMarketType = !!market.marketType && market.marketType !== 'custom_unknown'
  const hasSelection = !!market.selection
  const hasValidOdds = typeof market.odds === 'number' && market.odds > 0
  const hasCapturedAt = !!market.capturedAt

  if (!hasBookmaker) warnings.push('no_bookmaker')
  if (!hasMarketType) warnings.push('unknown_market_type')
  if (!hasSelection) warnings.push('no_selection')
  if (!hasValidOdds) warnings.push('invalid_odds')
  if (!hasCapturedAt) warnings.push('no_captured_at')

  // The /odds endpoint is pre-match; live odds would need /odds/live
  const timing: OddsTiming = 'pre_match'

  let quality: OddsSnapshotQuality['quality'] = 'usable'
  if (!hasValidOdds || !hasSelection) quality = 'unusable'
  else if (!hasBookmaker || !hasMarketType) quality = 'partial'

  return { hasBookmaker, hasMarketType, hasSelection, hasValidOdds, hasCapturedAt, timing, quality, warnings }
}

// ─── Coverage Report Builder ─────────────────────────────────────────────────

function buildCoverageReport(
  fixture: { id: string; homeName: string; awayName: string; competition: string; status: string },
  markets: NormalizedOddsMarket[],
): MarketCoverageReport {
  const warnings: string[] = []
  const marketTypeSet = new Set<OddsMarketType>()
  const bookmakerSet = new Set<string>()
  let unknownMarkets = 0
  let capturedAt: string | null = null

  for (const m of markets) {
    marketTypeSet.add(m.marketType)
    if (m.bookmaker) bookmakerSet.add(m.bookmaker)
    if (m.marketType === 'custom_unknown') unknownMarkets++
    if (!capturedAt && m.capturedAt) capturedAt = m.capturedAt
  }

  if (markets.length === 0) warnings.push('no_odds_returned')
  if (bookmakerSet.size === 0 && markets.length > 0) warnings.push('no_bookmaker_info')
  if (unknownMarkets > 0) warnings.push(`${unknownMarkets}_unknown_markets`)

  // Live status but pre-match odds endpoint
  const isLive = ['1H', '2H', 'HT', 'ET', 'BT'].includes(fixture.status)
  const oddsTiming: OddsTiming = isLive ? 'unknown' : 'pre_match'
  if (isLive) warnings.push('live_match_but_prematch_odds_endpoint')

  return {
    fixtureId: fixture.id,
    matchLabel: `${fixture.homeName} vs ${fixture.awayName}`,
    competition: fixture.competition,
    status: fixture.status,
    marketsFound: Array.from(marketTypeSet),
    bookmakersFound: Array.from(bookmakerSet),
    hasMatchWinner: marketTypeSet.has('match_winner'),
    hasOverUnderGoals: marketTypeSet.has('over_under_goals'),
    hasBothTeamsScore: marketTypeSet.has('both_teams_score'),
    hasCorners: marketTypeSet.has('corners'),
    hasCards: marketTypeSet.has('cards'),
    hasAsianHandicap: marketTypeSet.has('asian_handicap'),
    hasNextGoal: marketTypeSet.has('next_goal'),
    unknownMarkets,
    totalOdds: markets.length,
    oddsTiming,
    capturedAt,
    warnings,
  }
}

// ─── Alert → Market Compatibility ────────────────────────────────────────────

const ALERT_TYPES = ['goal_pressure', 'late_goal', 'over_trend', 'corner_pressure', 'card_heat', 'favorite_risk', 'underdog_threat']

export function auditAlertMarketCompatibility(report: MarketCoverageReport): AlertMarketCompatibility[] {
  const foundSet = new Set(report.marketsFound)
  const results: AlertMarketCompatibility[] = []

  for (const patternType of ALERT_TYPES) {
    const candidates = inferMarketFromPatternType(patternType)
    const found = candidates.filter(m => foundSet.has(m))
    const missing = candidates.filter(m => !foundSet.has(m))

    let support: AlertMarketCompatibility['support'] = 'unsupported'
    let reason = ''
    if (found.length === candidates.length) {
      support = 'supported'
      reason = 'Todos os mercados candidatos disponíveis'
    } else if (found.length > 0) {
      support = 'partially_supported'
      reason = `${found.length}/${candidates.length} mercados disponíveis`
    } else {
      support = 'unsupported'
      reason = 'Nenhum mercado candidato disponível neste fixture'
    }

    results.push({ patternType, candidateMarkets: candidates, foundMarkets: found, missingMarkets: missing, support, reason })
  }

  return results
}

// ─── Audit Functions ─────────────────────────────────────────────────────────

export async function auditFixtureOddsCoverage(fixtureId: string): Promise<{ report: MarketCoverageReport; compatibility: AlertMarketCompatibility[] } | null> {
  const fixture = await prisma.fixture.findUnique({ where: { id: fixtureId } })
  if (!fixture) return null

  const res = await fetchLiveOdds(fixture.id, fixture.providerFixtureId)
  const markets = res.success ? res.markets : []

  const report = buildCoverageReport(fixture, markets)
  if (!res.success && res.error) report.warnings.push(res.error)

  const compatibility = auditAlertMarketCompatibility(report)
  return { report, compatibility }
}

export async function auditRecentLiveFixturesOddsCoverage(limit: number): Promise<MarketCoverageReport[]> {
  const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'NS']
  const fixtures = await prisma.fixture.findMany({
    where: { status: { in: liveStatuses } },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(limit, 20),
  })

  const reports: MarketCoverageReport[] = []
  for (const fixture of fixtures) {
    try {
      const res = await fetchLiveOdds(fixture.id, fixture.providerFixtureId)
      const markets = res.success ? res.markets : []
      const report = buildCoverageReport(fixture, markets)
      if (!res.success && res.error) report.warnings.push(res.error)
      reports.push(report)
    } catch (err: any) {
      reports.push(buildCoverageReport(fixture, []))
    }
  }
  return reports
}

export function summarizeCoverageReports(reports: MarketCoverageReport[]) {
  const total = reports.length
  const withOdds = reports.filter(r => r.totalOdds > 0).length
  const withMatchWinner = reports.filter(r => r.hasMatchWinner).length
  const withOverUnder = reports.filter(r => r.hasOverUnderGoals).length
  const withBtts = reports.filter(r => r.hasBothTeamsScore).length
  const withCorners = reports.filter(r => r.hasCorners).length
  const withCards = reports.filter(r => r.hasCards).length
  const withAsianHandicap = reports.filter(r => r.hasAsianHandicap).length

  return {
    totalFixtures: total,
    fixturesWithOdds: withOdds,
    coverageByMarket: {
      match_winner: withMatchWinner,
      over_under_goals: withOverUnder,
      both_teams_score: withBtts,
      corners: withCorners,
      cards: withCards,
      asian_handicap: withAsianHandicap,
    },
  }
}

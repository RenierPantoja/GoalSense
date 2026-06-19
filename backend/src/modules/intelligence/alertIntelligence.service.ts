/**
 * Alert Intelligence Service (Phase B17) — server-side overview + search.
 * ─────────────────────────────────────────────────────────────────────────────
 * Joins the B12 memory (ledger + outcomes + failures + learning events) by
 * alertId and computes filtered, period-aware metrics + a searchable list — so
 * the Alertas 2.0 UI stops doing fragile client-side math. Deterministic, honest:
 * `unknown`/`expired` are not failures; `confirmed_partial` is partial usefulness.
 * Read-only; no alerts/Telegram/pattern changes.
 */
import { createRepositories } from '../../repositories/index.js'
import type { AlertResult, DataQuality } from './contracts/intelligence.types.js'
import type { ContextBreakdownSample } from './contracts/learning.types.js'
import {
  newDistribution, addResult, resolvedCount, usefulCount, usefulRate, failedRate,
  unknownRate, sampleQualityOf, avg,
} from './learning/learningStats.util.js'
import { minuteWindowOf, minuteWindowLabel } from './learning/minuteWindow.util.js'
import { contextKey, normalizeKeyPart } from './learning/contextKey.util.js'

export interface AlertIntelFilters {
  dateFrom?: string | null
  dateTo?: string | null
  patternId?: string
  league?: string
  team?: string
  result?: string
  status?: string
  severity?: string
  patternName?: string
  dataQuality?: string
  provider?: string
  minuteWindow?: string
  failureReason?: string
  minConfidence?: number
  maxConfidence?: number
  hasFailureAnalysis?: boolean
  hasLearningEvent?: boolean
  q?: string
}

export interface JoinedAlert {
  alertId: string
  patternId: string
  radarName: string
  league: string
  home: string
  away: string
  minute: number | null
  window: string
  windowLabel: string
  scoreState: { home: number; away: number }
  signalType: string
  confidence: number | null
  signalQuality: DataQuality
  provider: string
  competitionType: string | null
  importanceLabel: string | null
  createdAt: string
  result: AlertResult
  resolutionType: string | null
  timeToResolutionMinutes: number | null
  dataQualityAtResolution: DataQuality | null
  outcomeReason: string | null
  failureReason: string | null
  hasFailureAnalysis: boolean
  learningEventCount: number
  severity: string
  fixtureId: string
  resolvedAt: string | null
  hasOutcome: boolean
}

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}
function nameHit(filter: string | undefined, value: string): boolean {
  if (!filter) return true
  const f = norm(filter), v = norm(value)
  return !f || f === v || (f.length >= 3 && v.includes(f)) || (v.length >= 3 && f.includes(v))
}

/** Load + join all alert memory once. Capped by the repository read caps. */
export async function loadJoinedAlerts(): Promise<JoinedAlert[]> {
  const repos = createRepositories()
  const [ledger, outcomes, failures, learningEvents] = await Promise.all([
    repos.intelligence.listAllSignalLedgerEntries(),
    repos.intelligence.listAllAlertOutcomes(),
    repos.intelligence.listAllFailureAnalyses(),
    repos.intelligence.listRecentLearningEvents(2000),
  ])
  const outcomeByAlert = new Map<string, any>(outcomes.filter((o: any) => o.alertId).map((o: any) => [o.alertId, o]))
  const failureByAlert = new Map<string, any>(failures.filter((f: any) => f.alertId).map((f: any) => [f.alertId, f]))
  const learningCountByAlert = new Map<string, number>()
  for (const e of learningEvents as any[]) {
    if (e.alertId) learningCountByAlert.set(e.alertId, (learningCountByAlert.get(e.alertId) || 0) + 1)
  }

  const out: JoinedAlert[] = []
  for (const e of ledger as any[]) {
    if (!e.alertId) continue
    const outcome = outcomeByAlert.get(e.alertId) || null
    const failure = failureByAlert.get(e.alertId) || null
    const window = minuteWindowOf(e.minute, null)
    const signalQuality: DataQuality = (e.evidence?.providerQuality as DataQuality)
      || (outcome?.dataQualityAtResolution as DataQuality) || 'unknown'
    out.push({
      alertId: e.alertId,
      patternId: e.patternId || 'unknown',
      radarName: e.radarName || e.patternId || 'unknown',
      league: e.leagueName || 'unknown',
      home: e.homeTeam || 'unknown',
      away: e.awayTeam || 'unknown',
      minute: e.minute ?? null,
      window,
      windowLabel: minuteWindowLabel(window),
      scoreState: e.scoreState || { home: 0, away: 0 },
      signalType: e.signalType || 'unknown',
      confidence: typeof e.confidenceAtSignal === 'number' ? e.confidenceAtSignal : null,
      signalQuality: (['rich', 'partial', 'poor', 'unknown'] as const).includes(signalQuality) ? signalQuality : 'unknown',
      provider: e.dataAvailability?.liveScore?.source || 'unknown',
      competitionType: e.matchContext?.competitionType ?? null,
      importanceLabel: e.matchContext?.importanceLabel ?? null,
      createdAt: e.createdAt || '',
      result: (outcome?.result as AlertResult) || 'pending',
      resolutionType: outcome?.resolutionType ?? null,
      timeToResolutionMinutes: typeof outcome?.timeToResolutionMinutes === 'number' ? outcome.timeToResolutionMinutes : null,
      dataQualityAtResolution: (outcome?.dataQualityAtResolution as DataQuality) ?? null,
      outcomeReason: outcome?.outcomeReason ?? null,
      failureReason: failure?.failureReason ?? null,
      hasFailureAnalysis: !!failure,
      learningEventCount: learningCountByAlert.get(e.alertId) || 0,
      severity: e.severity || 'attention',
      fixtureId: e.fixtureId || '',
      resolvedAt: outcome?.resolvedAt ?? null,
      hasOutcome: !!outcome,
    })
  }
  return out
}

export function applyFilters(rows: JoinedAlert[], f: AlertIntelFilters): JoinedAlert[] {
  const q = f.q ? norm(f.q) : ''
  return rows.filter(r => {
    if (f.dateFrom && r.createdAt < f.dateFrom) return false
    if (f.dateTo && r.createdAt > f.dateTo) return false
    if (f.patternId && r.patternId !== f.patternId) return false
    if (!nameHit(f.league, r.league)) return false
    if (f.team && !(nameHit(f.team, r.home) || nameHit(f.team, r.away))) return false
    const resultFilter = f.result || f.status
    if (resultFilter && r.result !== resultFilter) return false
    if (f.severity && r.severity !== f.severity) return false
    if (f.patternName && !nameHit(f.patternName, r.radarName)) return false
    if (f.dataQuality && r.signalQuality !== f.dataQuality) return false
    if (f.provider && r.provider !== f.provider) return false
    if (f.minuteWindow && r.window !== f.minuteWindow) return false
    if (f.failureReason && r.failureReason !== f.failureReason) return false
    if (f.hasFailureAnalysis && !r.hasFailureAnalysis) return false
    if (f.hasLearningEvent && r.learningEventCount <= 0) return false
    if (f.minConfidence != null && (r.confidence ?? 0) < f.minConfidence) return false
    if (f.maxConfidence != null && (r.confidence ?? 100) > f.maxConfidence) return false
    if (q && !norm(`${r.home} ${r.away} ${r.league} ${r.radarName}`).includes(q)) return false
    return true
  })
}

// ─── Overview ──────────────────────────────────────────────────────────────────

interface Acc { dist: ReturnType<typeof newDistribution>; confSum: number; confN: number; ttrSum: number; ttrN: number }
function newAcc(): Acc { return { dist: newDistribution(), confSum: 0, confN: 0, ttrSum: 0, ttrN: 0 } }
function accAdd(a: Acc, r: JoinedAlert): void {
  addResult(a.dist, r.result)
  if (r.confidence != null) { a.confSum += r.confidence; a.confN++ }
  if (r.timeToResolutionMinutes != null) { a.ttrSum += r.timeToResolutionMinutes; a.ttrN++ }
}
function sample(key: string, label: string, a: Acc): ContextBreakdownSample {
  const resolved = resolvedCount(a.dist)
  return { contextKey: key, label, sampleSize: a.dist.total, usefulRate: usefulRate(a.dist), failedRate: failedRate(a.dist), unknownRate: unknownRate(a.dist), sampleQuality: sampleQualityOf(resolved) }
}
function topSamples(map: Map<string, { acc: Acc; label: string }>, metric: 'useful' | 'failed' | 'unknown', n = 6): ContextBreakdownSample[] {
  return [...map.entries()].map(([k, v]) => sample(k, v.label, v.acc))
    .sort((x, y) => {
      const xv = (metric === 'useful' ? x.usefulRate : metric === 'failed' ? x.failedRate : x.unknownRate) ?? -1
      const yv = (metric === 'useful' ? y.usefulRate : metric === 'failed' ? y.failedRate : y.unknownRate) ?? -1
      if (yv !== xv) return yv - xv
      return y.sampleSize - x.sampleSize
    }).slice(0, n)
}

export async function buildAlertOverview(filters: AlertIntelFilters) {
  const all = await loadJoinedAlerts()
  const rows = applyFilters(all, filters)
  const repos = createRepositories()

  const dist = newDistribution()
  let confSum = 0, confN = 0, ttrSum = 0, ttrN = 0
  const byPattern = new Map<string, { acc: Acc; label: string }>()
  const byLeague = new Map<string, { acc: Acc; label: string }>()
  const byTeam = new Map<string, { acc: Acc; label: string }>()
  const byWindow = new Map<string, { acc: Acc; label: string }>()
  const byQuality = new Map<string, { acc: Acc; label: string }>()
  const byProvider = new Map<string, { acc: Acc; label: string }>()
  const failureReasons = new Map<string, number>()

  const bump = (map: Map<string, { acc: Acc; label: string }>, key: string, label: string, r: JoinedAlert) => {
    let s = map.get(key); if (!s) { s = { acc: newAcc(), label }; map.set(key, s) }; accAdd(s.acc, r)
  }

  for (const r of rows) {
    addResult(dist, r.result)
    if (r.confidence != null) { confSum += r.confidence; confN++ }
    if (r.timeToResolutionMinutes != null) { ttrSum += r.timeToResolutionMinutes; ttrN++ }
    bump(byPattern, contextKey.pattern(r.patternId), r.radarName, r)
    bump(byLeague, contextKey.competition(r.league), r.league, r)
    bump(byTeam, contextKey.team(r.home), r.home, r); bump(byTeam, contextKey.team(r.away), r.away, r)
    bump(byWindow, contextKey.minuteWindow(r.window), r.windowLabel, r)
    bump(byQuality, contextKey.dataQuality(r.signalQuality), `Qualidade: ${r.signalQuality}`, r)
    bump(byProvider, contextKey.provider(r.provider), `Provider: ${r.provider}`, r)
    if (r.result === 'failed' && r.failureReason) failureReasons.set(r.failureReason, (failureReasons.get(r.failureReason) || 0) + 1)
  }

  const latestRun = await repos.intelligence.getLatestLearningAggregationRun().catch(() => null)
  const recentEvents = (await repos.intelligence.listRecentLearningEvents(12).catch(() => []))
    .map((e: any) => ({ id: e.id, type: e.type, message: e.message, createdAt: e.createdAt }))

  return {
    filters,
    totalAlerts: dist.total,
    pending: dist.pending,
    confirmed: dist.confirmed,
    confirmedPartial: dist.confirmedPartial,
    failed: dist.failed,
    unknown: dist.unknown,
    expired: dist.expired,
    usefulSignals: usefulCount(dist),
    usefulRate: usefulRate(dist),
    failedRate: failedRate(dist),
    unknownRate: unknownRate(dist),
    avgConfidence: avg(confSum, confN),
    avgTimeToResolutionMinutes: avg(ttrSum, ttrN),
    sampleQuality: sampleQualityOf(resolvedCount(dist)),
    byPattern: topSamples(byPattern, 'useful'),
    byLeague: topSamples(byLeague, 'useful'),
    byTeam: topSamples(byTeam, 'useful'),
    byMinuteWindow: topSamples(byWindow, 'useful'),
    byDataQuality: topSamples(byQuality, 'useful', 8),
    byProvider: topSamples(byProvider, 'useful', 8),
    topFailureReasons: [...failureReasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    highUnknownContexts: topSamples(byLeague, 'unknown').filter(s => (s.unknownRate ?? 0) >= 0.4),
    latestLearningEvents: recentEvents,
    latestAggregationRun: latestRun ? { status: (latestRun as any).status, finishedAt: (latestRun as any).finishedAt } : null,
    generatedAt: new Date().toISOString(),
  }
}

// ─── Search (normalized + paginated) ───────────────────────────────────────────

export interface AlertSearchItem {
  id: string
  alertId: string
  source: 'backend' | 'ledger' | 'legacy' | 'unknown'
  fixtureId: string | null
  patternId: string | null
  patternName: string
  fixtureLabel: string
  leagueName: string
  homeTeam: string
  awayTeam: string
  minute: number | null
  scoreState: { home: number; away: number }
  severity: string
  confidence: number | null
  result: AlertResult
  status: AlertResult
  dataQuality: DataQuality
  provider: string
  createdAt: string
  resolvedAt: string | null
  hasLedger: boolean
  hasOutcome: boolean
  hasFailureAnalysis: boolean
  learningEventCount: number
  failureReason: string | null
  summaryReason: string | null
  canOpenAnalysis: boolean
  limitations: string[]
}

export function toSearchItem(r: JoinedAlert): AlertSearchItem {
  const limitations: string[] = []
  if (!r.hasOutcome) limitations.push('sem resultado registrado')
  if (r.result === 'unknown' || r.result === 'expired') limitations.push('sem dados suficientes')
  return {
    id: r.alertId,
    alertId: r.alertId,
    source: 'ledger', // every searchable row comes from the Signal Ledger
    fixtureId: r.fixtureId || null,
    patternId: r.patternId || null,
    patternName: r.radarName,
    fixtureLabel: `${r.home} vs ${r.away}`,
    leagueName: r.league,
    homeTeam: r.home,
    awayTeam: r.away,
    minute: r.minute,
    scoreState: r.scoreState,
    severity: r.severity,
    confidence: r.confidence,
    result: r.result,
    status: r.result,
    dataQuality: r.signalQuality,
    provider: r.provider,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
    hasLedger: true,
    hasOutcome: r.hasOutcome,
    hasFailureAnalysis: r.hasFailureAnalysis,
    learningEventCount: r.learningEventCount,
    failureReason: r.failureReason,
    summaryReason: r.outcomeReason ?? null,
    canOpenAnalysis: true,
    limitations,
  }
}

export interface SearchOptions { limit: number; cursor?: number; sortBy?: 'createdAt' | 'confidence' | 'minute'; sortDirection?: 'asc' | 'desc' }

export async function searchAlerts(filters: AlertIntelFilters, opts: SearchOptions) {
  const all = await loadJoinedAlerts()
  const filtered = applyFilters(all, filters)
  const sortBy = opts.sortBy || 'createdAt'
  const dir = opts.sortDirection === 'asc' ? 1 : -1
  filtered.sort((a, b) => {
    let cmp = 0
    if (sortBy === 'confidence') cmp = (a.confidence ?? -1) - (b.confidence ?? -1)
    else if (sortBy === 'minute') cmp = (a.minute ?? -1) - (b.minute ?? -1)
    else cmp = (a.createdAt || '').localeCompare(b.createdAt || '')
    if (cmp !== 0) return cmp * dir
    return (a.alertId || '').localeCompare(b.alertId || '') * dir // stable tiebreak
  })
  const limit = Math.min(Math.max(1, opts.limit || 50), 100)
  const start = Number.isFinite(opts.cursor) && (opts.cursor as number) > 0 ? (opts.cursor as number) : 0
  const page = filtered.slice(start, start + limit)
  const appliedFilters = Object.entries(filters)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${v}`)
  return {
    items: page.map(toSearchItem),
    total: filtered.length,
    totalApprox: filtered.length,
    nextCursor: start + limit < filtered.length ? start + limit : null,
    hasMore: start + limit < filtered.length,
    appliedFilters,
  }
}

/** Rows for CSV export (capped). Reuses the same filters as search. */
export async function exportAlerts(filters: AlertIntelFilters, max: number): Promise<AlertSearchItem[]> {
  const all = await loadJoinedAlerts()
  const filtered = applyFilters(all, filters).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  return filtered.slice(0, Math.min(max, filtered.length)).map(toSearchItem)
}

export { normalizeKeyPart }

/**
 * Learning Aggregator (Phase B13) — deterministic context-performance aggregation.
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads the B12 memory (ledger + outcomes + failures), joins by alertId and
 * materializes Pattern / Competition / Team / context profiles + conservative
 * recommendations. No ML, no auto-tuning of patterns, no confidence changes, no
 * invented data. `unknown` is never a failure; `confirmed_partial` counts as
 * partial usefulness. Everything is recomputed from raw records (idempotent).
 */
import { createRepositories } from '../../../repositories/index.js'
import type { AlertResult, DataQuality } from '../contracts/intelligence.types.js'
import type {
  OutcomeDistribution, DataQualityBreakdown, LearningStatsBase, ContextBreakdownSample,
  PatternLearningProfile, CompetitionLearningProfile, TeamLearningProfile,
  SignalContextStats, LearningAggregationRun, LearningOverview, MinuteWindow,
} from '../contracts/learning.types.js'
import {
  newDistribution, addResult, resolvedCount, usefulCount, usefulRate, failedRate,
  unknownRate, sampleQualityOf, avg, mergeDistribution,
} from './learningStats.util.js'
import { minuteWindowOf, minuteWindowLabel } from './minuteWindow.util.js'
import { contextKey, normalizeKeyPart, scoreStateLabel } from './contextKey.util.js'
import { recommendationsForPattern, recommendationsForCompetition, recommendationsForTeam } from './learningRecommendation.service.js'

const ALL_QUALITIES: DataQuality[] = ['rich', 'partial', 'poor', 'unknown']

interface JoinedRecord {
  patternId: string
  radarName: string
  league: string
  home: string
  away: string
  window: MinuteWindow
  competitionType: string | null
  importanceLabel: string | null
  provider: string
  signalQuality: DataQuality
  scoreLabel: string
  confidence: number | null
  result: AlertResult
  timeToResolution: number | null
  failureReason: string | null
}

interface Acc {
  dist: OutcomeDistribution
  confSum: number; confN: number
  ttrSum: number; ttrN: number
  byQuality: Map<DataQuality, OutcomeDistribution>
}
function newAcc(): Acc {
  return { dist: newDistribution(), confSum: 0, confN: 0, ttrSum: 0, ttrN: 0, byQuality: new Map() }
}
function accAdd(acc: Acc, r: JoinedRecord): void {
  addResult(acc.dist, r.result)
  if (r.confidence != null) { acc.confSum += r.confidence; acc.confN++ }
  if (r.timeToResolution != null) { acc.ttrSum += r.timeToResolution; acc.ttrN++ }
  const q = acc.byQuality.get(r.signalQuality) || newDistribution()
  addResult(q, r.result)
  acc.byQuality.set(r.signalQuality, q)
}
function qualityBreakdown(acc: Acc): DataQualityBreakdown {
  const out = {} as DataQualityBreakdown
  for (const q of ALL_QUALITIES) out[q] = acc.byQuality.get(q) || newDistribution()
  return out
}

function finalizeBase(
  scopeType: LearningStatsBase['scopeType'], scopeKey: string, label: string, acc: Acc,
  source: 'observed' | 'heuristic', idPrefix: string,
): LearningStatsBase {
  const d = acc.dist
  const resolved = resolvedCount(d)
  return {
    id: `${idPrefix}_${normalizeKeyPart(scopeKey)}`.slice(0, 120),
    scopeType, scopeKey, label,
    sampleSize: d.total,
    resolvedCount: resolved,
    usefulCount: usefulCount(d),
    confirmedCount: d.confirmed,
    confirmedPartialCount: d.confirmedPartial,
    failedCount: d.failed,
    unknownCount: d.unknown,
    pendingCount: d.pending,
    expiredCount: d.expired,
    usefulRate: usefulRate(d),
    failedRate: failedRate(d),
    unknownRate: unknownRate(d),
    avgConfidenceAtSignal: avg(acc.confSum, acc.confN),
    avgTimeToResolutionMinutes: avg(acc.ttrSum, acc.ttrN),
    dataQualityBreakdown: qualityBreakdown(acc),
    sampleQuality: sampleQualityOf(resolved),
    source,
    lastUpdatedAt: new Date().toISOString(),
  }
}

function toSample(contextKeyStr: string, label: string, acc: Acc): ContextBreakdownSample {
  const d = acc.dist
  const resolved = resolvedCount(d)
  return {
    contextKey: contextKeyStr, label,
    sampleSize: d.total,
    usefulRate: usefulRate(d), failedRate: failedRate(d), unknownRate: unknownRate(d),
    sampleQuality: sampleQualityOf(resolved),
  }
}

function topBy(map: Map<string, { acc: Acc; label: string }>, metric: 'useful' | 'failed', n = 3): ContextBreakdownSample[] {
  const samples = [...map.entries()].map(([k, v]) => toSample(k, v.label, v.acc))
    .filter(s => resolvedFromSample(s) >= 1)
  samples.sort((a, b) => {
    const av = (metric === 'useful' ? a.usefulRate : a.failedRate) ?? -1
    const bv = (metric === 'useful' ? b.usefulRate : b.failedRate) ?? -1
    if (bv !== av) return bv - av
    return b.sampleSize - a.sampleSize
  })
  return samples.slice(0, n)
}
function resolvedFromSample(s: ContextBreakdownSample): number {
  // usefulRate is null only when resolved === 0
  return s.usefulRate == null && s.failedRate == null && s.unknownRate == null ? 0 : s.sampleSize
}

// ─── Build joined records ──────────────────────────────────────────────────────

function buildJoined(
  ledger: any[], outcomeByAlert: Map<string, any>, failureByAlert: Map<string, any>,
): JoinedRecord[] {
  const out: JoinedRecord[] = []
  for (const e of ledger) {
    if (!e.patternId) continue
    const alertId = e.alertId
    const outcome = alertId ? outcomeByAlert.get(alertId) : null
    const failure = alertId ? failureByAlert.get(alertId) : null
    const result: AlertResult = (outcome?.result as AlertResult) || 'pending'
    const signalQuality: DataQuality = (e.evidence?.providerQuality as DataQuality)
      || (outcome?.dataQualityAtResolution as DataQuality) || 'unknown'
    const provider = e.dataAvailability?.liveScore?.source || 'unknown'
    out.push({
      patternId: e.patternId,
      radarName: e.radarName || e.patternId,
      league: e.leagueName || 'unknown',
      home: e.homeTeam || 'unknown',
      away: e.awayTeam || 'unknown',
      window: minuteWindowOf(e.minute, null),
      competitionType: e.matchContext?.competitionType ?? null,
      importanceLabel: e.matchContext?.importanceLabel ?? null,
      provider,
      signalQuality: ALL_QUALITIES.includes(signalQuality) ? signalQuality : 'unknown',
      scoreLabel: scoreStateLabel(e.scoreState),
      confidence: typeof e.confidenceAtSignal === 'number' ? e.confidenceAtSignal : null,
      result,
      timeToResolution: typeof outcome?.timeToResolutionMinutes === 'number' ? outcome.timeToResolutionMinutes : null,
      failureReason: failure?.failureReason ?? null,
    })
  }
  return out
}

function topReasons(counter: Map<string, number>, n = 5): { reason: string; count: number }[] {
  return [...counter.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, n)
}
function bump(counter: Map<string, number>, key: string | null): void {
  if (!key) return
  counter.set(key, (counter.get(key) || 0) + 1)
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface AggregationOptions { dryRun?: boolean; patternId?: string }

export async function aggregateAll(opts: AggregationOptions = {}): Promise<LearningAggregationRun> {
  const dryRun = !!opts.dryRun
  const repos = createRepositories()
  const run: LearningAggregationRun = {
    id: `run_${Date.now().toString(36)}`,
    startedAt: new Date().toISOString(), finishedAt: null, status: 'running',
    ledgerEntriesScanned: 0, outcomesScanned: 0, failuresScanned: 0,
    patternProfiles: 0, competitionProfiles: 0, teamProfiles: 0, contextStats: 0,
    recommendations: 0, learningEventsCreated: 0, dryRun, notes: [],
  }
  if (!dryRun) await repos.intelligence.createLearningAggregationRun(run)

  try {
    let ledger = await repos.intelligence.listAllSignalLedgerEntries()
    const outcomes = await repos.intelligence.listAllAlertOutcomes()
    const failures = await repos.intelligence.listAllFailureAnalyses()
    if (opts.patternId) ledger = ledger.filter((e: any) => e.patternId === opts.patternId)

    run.ledgerEntriesScanned = ledger.length
    run.outcomesScanned = outcomes.length
    run.failuresScanned = failures.length

    const outcomeByAlert = new Map<string, any>(outcomes.filter((o: any) => o.alertId).map((o: any) => [o.alertId, o]))
    const failureByAlert = new Map<string, any>(failures.filter((f: any) => f.alertId).map((f: any) => [f.alertId, f]))
    const joined = buildJoined(ledger, outcomeByAlert, failureByAlert)

    // ── Pattern accumulators ──
    const patternAccs = new Map<string, { acc: Acc; radarName: string; byCompetition: Map<string, { acc: Acc; label: string }>; byMinute: Map<string, { acc: Acc; label: string }>; failures: Map<string, number> }>()
    const competitionAccs = new Map<string, { acc: Acc; type: string | null; byPattern: Map<string, { acc: Acc; label: string }>; byMinute: Map<string, { acc: Acc; label: string }> }>()
    const teamAccs = new Map<string, { acc: Acc; label: string; home: OutcomeDistribution; away: OutcomeDistribution; homeUseful: Acc; awayUseful: Acc; failures: Map<string, number> }>()
    const contextAccs = new Map<string, { acc: Acc; label: string; source: 'observed' | 'heuristic' }>()

    const ctxBump = (key: string, label: string, source: 'observed' | 'heuristic', r: JoinedRecord) => {
      let c = contextAccs.get(key)
      if (!c) { c = { acc: newAcc(), label, source }; contextAccs.set(key, c) }
      accAdd(c.acc, r)
    }
    const subBump = (map: Map<string, { acc: Acc; label: string }>, key: string, label: string, r: JoinedRecord) => {
      let s = map.get(key)
      if (!s) { s = { acc: newAcc(), label }; map.set(key, s) }
      accAdd(s.acc, r)
    }

    for (const r of joined) {
      // pattern
      let p = patternAccs.get(r.patternId)
      if (!p) { p = { acc: newAcc(), radarName: r.radarName, byCompetition: new Map(), byMinute: new Map(), failures: new Map() }; patternAccs.set(r.patternId, p) }
      accAdd(p.acc, r)
      subBump(p.byCompetition, contextKey.competition(r.league), r.league, r)
      subBump(p.byMinute, contextKey.minuteWindow(r.window), minuteWindowLabel(r.window), r)
      if (r.result === 'failed') bump(p.failures, r.failureReason || 'unknown')

      // competition
      let c = competitionAccs.get(r.league)
      if (!c) { c = { acc: newAcc(), type: r.competitionType, byPattern: new Map(), byMinute: new Map() }; competitionAccs.set(r.league, c) }
      accAdd(c.acc, r)
      subBump(c.byPattern, contextKey.pattern(r.patternId), r.radarName, r)
      subBump(c.byMinute, contextKey.minuteWindow(r.window), minuteWindowLabel(r.window), r)

      // teams (home + away)
      for (const [team, side] of [[r.home, 'home'], [r.away, 'away']] as const) {
        let t = teamAccs.get(team)
        if (!t) { t = { acc: newAcc(), label: team, home: newDistribution(), away: newDistribution(), homeUseful: newAcc(), awayUseful: newAcc(), failures: new Map() }; teamAccs.set(team, t) }
        accAdd(t.acc, r)
        if (side === 'home') { addResult(t.home, r.result); accAdd(t.homeUseful, r) }
        else { addResult(t.away, r.result); accAdd(t.awayUseful, r) }
        if (r.result === 'failed') bump(t.failures, r.failureReason || 'unknown')
      }

      // generic context stats
      ctxBump(contextKey.competitionType(r.competitionType || 'unknown'), `Tipo: ${r.competitionType || 'desconhecido'}`, 'heuristic', r)
      ctxBump(contextKey.importance(r.importanceLabel || 'unknown'), `Importância: ${r.importanceLabel || 'desconhecida'}`, 'heuristic', r)
      ctxBump(contextKey.dataQuality(r.signalQuality), `Qualidade: ${r.signalQuality}`, 'observed', r)
      ctxBump(contextKey.minuteWindow(r.window), minuteWindowLabel(r.window), 'observed', r)
      ctxBump(contextKey.provider(r.provider), `Provider: ${r.provider}`, 'observed', r)
      ctxBump(contextKey.scoreState(r.scoreLabel), `Placar: ${r.scoreLabel}`, 'observed', r)
    }

    // ── Materialize profiles ──
    const patternProfiles: PatternLearningProfile[] = []
    for (const [patternId, p] of patternAccs) {
      const base = finalizeBase('pattern', patternId, p.radarName, p.acc, 'observed', 'plp')
      patternProfiles.push({
        ...base, scopeType: 'pattern', radarName: p.radarName,
        bestCompetitions: topBy(p.byCompetition, 'useful'),
        worstCompetitions: topBy(p.byCompetition, 'failed'),
        bestMinuteWindows: topBy(p.byMinute, 'useful'),
        worstMinuteWindows: topBy(p.byMinute, 'failed'),
        topFailureReasons: topReasons(p.failures),
      })
    }

    const competitionProfiles: CompetitionLearningProfile[] = []
    for (const [league, c] of competitionAccs) {
      const base = finalizeBase('competition', league, league, c.acc, c.type ? 'heuristic' : 'observed', 'clp')
      competitionProfiles.push({
        ...base, scopeType: 'competition', competitionType: c.type,
        mostUsefulPatterns: topBy(c.byPattern, 'useful'),
        mostFailingPatterns: topBy(c.byPattern, 'failed'),
        strongMinuteWindows: topBy(c.byMinute, 'useful'),
      })
    }

    const teamProfiles: TeamLearningProfile[] = []
    for (const [team, t] of teamAccs) {
      const base = finalizeBase('team', team, t.label, t.acc, 'observed', 'tlp')
      teamProfiles.push({
        ...base, scopeType: 'team', home: t.home, away: t.away,
        homeUsefulRate: usefulRate(t.home), awayUsefulRate: usefulRate(t.away),
        topFailureReasons: topReasons(t.failures),
      })
    }

    const contextStats: SignalContextStats[] = []
    for (const [key, c] of contextAccs) {
      const base = finalizeBase('context', key, c.label, c.acc, c.source, 'ctx')
      contextStats.push({ ...base, scopeType: 'context' })
    }

    // ── Persist (unless dry-run) ──
    if (!dryRun) {
      for (const p of patternProfiles) await repos.intelligence.upsertPatternLearningProfile(p)
      for (const c of competitionProfiles) await repos.intelligence.upsertCompetitionLearningProfile(c)
      for (const t of teamProfiles) await repos.intelligence.upsertTeamLearningProfile(t)
      for (const s of contextStats) await repos.intelligence.upsertSignalContextStats(s)
    }

    // ── Recommendations + learning events ──
    const recs = [
      ...patternProfiles.flatMap(recommendationsForPattern),
      ...competitionProfiles.flatMap(recommendationsForCompetition),
      ...teamProfiles.flatMap(recommendationsForTeam),
    ]
    let learningEventsCreated = 0
    if (!dryRun) {
      for (const rec of recs) await repos.intelligence.createLearningRecommendation(rec)
      // Deterministic learning events (dedup by id) for the strongest signals only.
      for (const rec of recs) {
        if (rec.strength === 'low') continue // avoid spam from weak/small-sample recs
        try {
          await repos.intelligence.createLearningEvent({
            id: `lrn_agg_${rec.id}`,
            type: rec.type === 'high_unknown_rate' || rec.type === 'data_quality_warning' ? 'provider_data_gap'
              : rec.type === 'competition_strength_observed' ? 'competition_context_observed'
              : rec.type === 'team_context_strength_observed' ? 'scope_effect_observed'
              : 'possible_threshold_issue',
            fixtureId: null, alertId: null, patternId: rec.patternId,
            contextKey: rec.scopeKey, message: rec.message, evidenceRef: rec.id,
            confidence: rec.strength, createdAt: new Date().toISOString(),
          })
          learningEventsCreated++
        } catch { /* never block aggregation */ }
      }
    }

    run.patternProfiles = patternProfiles.length
    run.competitionProfiles = competitionProfiles.length
    run.teamProfiles = teamProfiles.length
    run.contextStats = contextStats.length
    run.recommendations = recs.length
    run.learningEventsCreated = learningEventsCreated
    run.status = 'completed'
    run.finishedAt = new Date().toISOString()
    if (joined.length === 0) run.notes.push('No ledger entries to aggregate yet.')
    if (dryRun) run.notes.push('Dry-run: nothing persisted.')
    if (!dryRun) await repos.intelligence.updateLearningAggregationRun(run.id, run)
    return run
  } catch (e: any) {
    run.status = 'failed'
    run.finishedAt = new Date().toISOString()
    run.notes.push(`Aggregation error: ${e?.message || e}`)
    if (!dryRun) { try { await repos.intelligence.updateLearningAggregationRun(run.id, run) } catch { /* ignore */ } }
    return run
  }
}

export async function aggregatePattern(patternId: string, opts: { dryRun?: boolean } = {}): Promise<LearningAggregationRun> {
  return aggregateAll({ ...opts, patternId })
}

export async function getLearningOverview(): Promise<LearningOverview> {
  const repos = createRepositories()
  const [patterns, contextStats, recentEvents, latestRun] = await Promise.all([
    repos.intelligence.listPatternLearningProfiles(500),
    repos.intelligence.listSignalContextStats(1000),
    repos.intelligence.listRecentLearningEvents(20),
    repos.intelligence.getLatestLearningAggregationRun(),
  ])

  let totalAlertsTracked = 0, resolvedAlerts = 0, pendingAlerts = 0, usefulSignals = 0, failedSignals = 0, unknownSignals = 0
  const failureCounter = new Map<string, number>()
  for (const p of patterns) {
    totalAlertsTracked += p.sampleSize
    resolvedAlerts += p.resolvedCount
    pendingAlerts += p.pendingCount
    usefulSignals += p.usefulCount
    failedSignals += p.failedCount
    unknownSignals += p.unknownCount + p.expiredCount
    for (const fr of p.topFailureReasons) failureCounter.set(fr.reason, (failureCounter.get(fr.reason) || 0) + fr.count)
  }

  // Only rank patterns with a meaningful resolved sample as "by useful rate".
  const topPatternsByUsefulRate: ContextBreakdownSample[] = patterns
    .filter(p => p.sampleQuality !== 'insufficient')
    .map(p => ({ contextKey: p.scopeKey, label: p.radarName, sampleSize: p.sampleSize, usefulRate: p.usefulRate, failedRate: p.failedRate, unknownRate: p.unknownRate, sampleQuality: p.sampleQuality }))
    .sort((a, b) => (b.usefulRate ?? -1) - (a.usefulRate ?? -1))
    .slice(0, 5)

  const highUnknownContexts: ContextBreakdownSample[] = contextStats
    .filter(s => s.sampleQuality !== 'insufficient' && (s.unknownRate ?? 0) >= 0.4)
    .map(s => ({ contextKey: s.scopeKey, label: s.label, sampleSize: s.sampleSize, usefulRate: s.usefulRate, failedRate: s.failedRate, unknownRate: s.unknownRate, sampleQuality: s.sampleQuality }))
    .sort((a, b) => (b.unknownRate ?? 0) - (a.unknownRate ?? 0))
    .slice(0, 5)

  return {
    totalAlertsTracked, resolvedAlerts, pendingAlerts, usefulSignals, failedSignals, unknownSignals,
    topPatternsByUsefulRate, highUnknownContexts,
    mostCommonFailureReasons: topReasons(failureCounter),
    recentLearningEvents: recentEvents.map((e: any) => ({ id: e.id, type: e.type, message: e.message, createdAt: e.createdAt })),
    latestAggregationRun: latestRun,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Backtest Engine (Phase B14) — read-only pattern simulation over history.
 * ─────────────────────────────────────────────────────────────────────────────
 * Re-evaluates a pattern against already-recorded snapshots using the SAME pure
 * evaluator as the live worker. Creates NO alerts, sends NO Telegram, touches NO
 * production counters/profiles. Persists only its own backtest run + results.
 */
import { createRepositories } from '../../../repositories/index.js'
import { env } from '../../../env.js'
import { linkSnapshotsToSource } from '../evidence/evidenceLineage.service.js'
import type { LinkSnapshotInput } from '../evidence/evidenceLineage.types.js'
import { evaluateCondition, evaluatePatternAgainstInput } from '../../command/commandEvaluation.service.js'
import { evaluatePatternScope, parseScopeExtended, parseScopeFilter } from '../../command/backendScopeFilter.service.js'
import { orderSnapshotsChronologically, snapshotsAfter, type RawSnapshot } from './utils/replayTimeline.util.js'
import { backtestRunId, backtestSignalResultId } from './utils/backtestId.util.js'
import { buildBacktestInput, contextForFixture, type BacktestFixtureView } from './backtestEvaluationAdapter.service.js'
import { estimateOutcome } from './backtestOutcome.service.js'
import { buildBacktestSummary } from './backtestSummary.service.js'
import type {
  BacktestRun, BacktestSignalResult, BacktestDataCoverage, BacktestLimitation, BacktestEvidenceStrength,
} from './backtest.types.js'
import type { DataQuality } from '../contracts/intelligence.types.js'
import type { NormalizedConfig } from './utils/backtestGuards.util.js'

const DEFAULT_USER = 'default'
const HISTORICAL_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT', 'FT', 'AET', 'PEN', 'P']
const SNAPSHOTS_PER_FIXTURE = 200

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}
function matchesAny(list: string[] | undefined, value: string): boolean {
  if (!list || list.length === 0) return true // no filter → pass
  const v = norm(value)
  return list.some(x => { const n = norm(x); return n === v || (n.length >= 4 && v.includes(n)) || (v.length >= 4 && n.includes(v)) })
}
function newCoverage(): BacktestDataCoverage {
  return { fixturesFound: 0, fixturesWithSnapshots: 0, fixturesWithoutSnapshots: 0, snapshotsEvaluated: 0, richDataCount: 0, partialDataCount: 0, poorDataCount: 0, unknownDataCount: 0, notEvaluableCount: 0, providerBreakdown: {} }
}
function bumpQuality(cov: BacktestDataCoverage, q: DataQuality): void {
  if (q === 'rich') cov.richDataCount++
  else if (q === 'partial') cov.partialDataCount++
  else if (q === 'poor') cov.poorDataCount++
  else cov.unknownDataCount++
}

/** Evaluate a pattern over one fixture's ordered snapshots → a signal result. */
export function evaluateFixture(
  pattern: { id: string; name: string; conditions: any[]; minConfidence: number; severity: string; requireRichData?: boolean; signalType?: string },
  fixture: BacktestFixtureView,
  snapshots: RawSnapshot[],
  evaluationMode: 'strict' | 'diagnostic',
  cov: BacktestDataCoverage,
): BacktestSignalResult {
  const context = contextForFixture(fixture.competition)
  const ctxBlock = { competitionType: context.competitionType, stage: context.stage, isKnockout: context.isKnockout, importance: context.importance, importanceLabel: context.importanceLabel }
  const evalPattern = {
    id: pattern.id, name: pattern.name, conditions: pattern.conditions,
    minConfidence: pattern.minConfidence, severity: pattern.severity,
    requireRichData: evaluationMode === 'strict' ? pattern.requireRichData : false,
    action: 'register_alert', status: 'active',
  }

  const ordered = orderSnapshotsChronologically(snapshots)
  let triggerIndex = -1
  let triggerEval: ReturnType<typeof evaluatePatternAgainstInput> | null = null
  let triggerInput: any = null
  // Track the "closest" snapshot (highest matchRatio) for explaining non-triggers.
  let bestIdx = -1, bestMatched = -1, bestInput: any = null

  for (let i = 0; i < ordered.length; i++) {
    const snap = ordered[i]
    const input = buildBacktestInput(fixture, {
      minute: snap.minute ?? null, scoreHome: snap.scoreHome ?? 0, scoreAway: snap.scoreAway ?? 0,
      penaltyHome: snap.penaltyHome ?? null, penaltyAway: snap.penaltyAway ?? null, status: snap.status ?? null,
      statsJson: snap.statsJson ?? null, eventsJson: snap.eventsJson ?? null,
      dataQuality: (snap.dataQuality as string) || 'poor', provider: (snap.provider as string) || 'unknown',
      capturedAt: snap.capturedAt ?? new Date().toISOString(),
    }, context)
    cov.snapshotsEvaluated++
    bumpQuality(cov, (input.dataQuality as DataQuality) || 'unknown')
    cov.providerBreakdown[input.provider] = (cov.providerBreakdown[input.provider] || 0) + 1

    const res = evaluatePatternAgainstInput(evalPattern, input)
    if (res.matchedConditions > bestMatched) { bestMatched = res.matchedConditions; bestIdx = i; bestInput = input }
    if (res.shouldAlert) { triggerIndex = i; triggerEval = res; triggerInput = input; break }
  }

  const passedFailed = (input: any) => {
    const passed: string[] = []; const missing: string[] = []
    for (const c of pattern.conditions) { (evaluateCondition(c, input) ? passed : missing).push(c.type) }
    return { passed, missing }
  }

  if (triggerIndex >= 0 && triggerEval && triggerInput) {
    const { passed, missing } = passedFailed(triggerInput)
    const post = snapshotsAfter(ordered, triggerIndex)
    const guess = estimateOutcome({
      patternName: pattern.name, signalType: pattern.signalType,
      triggerMinute: triggerInput.minute, triggerScore: triggerInput.score, postSnapshots: post,
    })
    // B35: inline snapshot evidence (exact only when a real snapshot id exists).
    const trigSnap: any = ordered[triggerIndex]
    const outSnap: any = (guess.outcome !== 'not_evaluable' && post.length > 0) ? post[post.length - 1] : null
    const trigId = trigSnap?.id ? String(trigSnap.id) : null
    const outId = outSnap?.id ? String(outSnap.id) : null
    const trigStrength: BacktestEvidenceStrength = trigId ? 'exact' : 'unknown'
    const outStrength: BacktestEvidenceStrength = outId ? 'exact' : (post.length > 0 ? 'window_inferred' : 'unknown')
    return {
      fixtureId: fixture.id, fixtureLabel: `${fixture.homeName} vs ${fixture.awayName}`,
      leagueName: fixture.competition, homeTeam: fixture.homeName, awayTeam: fixture.awayName,
      minute: triggerInput.minute, scoreState: triggerInput.score,
      wouldTrigger: true, confidenceAtTrigger: triggerEval.confidence,
      matchedConditions: passed, missingConditions: missing, blockedReasons: triggerEval.blockers,
      dataQuality: (triggerInput.dataQuality as DataQuality) || 'unknown', matchContext: ctxBlock,
      estimatedOutcome: guess.outcome, outcomeReason: guess.reason, evidence: guess.evidence,
      triggerSnapshotId: trigId,
      triggerSnapshotCapturedAt: trigSnap?.capturedAt ?? null,
      triggerSnapshotMinute: typeof trigSnap?.minute === 'number' ? trigSnap.minute : null,
      triggerEvidenceStrength: trigStrength,
      triggerEvidenceLimitations: trigId ? [] : ['trigger_snapshot_id_missing'],
      outcomeSnapshotId: outId,
      outcomeSnapshotCapturedAt: outSnap?.capturedAt ?? null,
      outcomeSnapshotMinute: typeof outSnap?.minute === 'number' ? outSnap.minute : null,
      outcomeEvidenceStrength: outStrength,
      outcomeEvidenceLimitations: outId ? [] : (post.length > 0 ? ['outcome_snapshot_id_missing'] : ['no_post_trigger_snapshot']),
      evidenceSummary: `trigger:${trigStrength} · outcome:${outStrength}`,
    }
  }

  // Never triggered — explain using the closest snapshot.
  const refInput = bestInput || (ordered.length > 0 ? buildBacktestInput(fixture, {
    minute: ordered[ordered.length - 1].minute ?? null, scoreHome: ordered[ordered.length - 1].scoreHome ?? 0,
    scoreAway: ordered[ordered.length - 1].scoreAway ?? 0, penaltyHome: null, penaltyAway: null,
    status: ordered[ordered.length - 1].status ?? null, statsJson: ordered[ordered.length - 1].statsJson ?? null,
    eventsJson: ordered[ordered.length - 1].eventsJson ?? null, dataQuality: 'poor', provider: 'unknown',
    capturedAt: new Date().toISOString(),
  }, context) : null)
  const { passed, missing } = refInput ? passedFailed(refInput) : { passed: [], missing: pattern.conditions.map((c: any) => c.type) }
  const refRes = refInput ? evaluatePatternAgainstInput(evalPattern, refInput) : null
  void bestIdx
  return {
    fixtureId: fixture.id, fixtureLabel: `${fixture.homeName} vs ${fixture.awayName}`,
    leagueName: fixture.competition, homeTeam: fixture.homeName, awayTeam: fixture.awayName,
    minute: refInput?.minute ?? null, scoreState: refInput?.score ?? { home: 0, away: 0 },
    wouldTrigger: false, confidenceAtTrigger: refRes?.confidence ?? null,
    matchedConditions: passed, missingConditions: missing, blockedReasons: refRes?.blockers ?? [],
    dataQuality: (refInput?.dataQuality as DataQuality) || 'unknown', matchContext: ctxBlock,
    estimatedOutcome: 'not_evaluable', outcomeReason: 'Radar não dispararia neste jogo com os dados disponíveis',
    evidence: null,
    triggerSnapshotId: null, triggerSnapshotCapturedAt: null, triggerSnapshotMinute: null,
    triggerEvidenceStrength: 'unknown', triggerEvidenceLimitations: ['no_trigger'],
    outcomeSnapshotId: null, outcomeSnapshotCapturedAt: null, outcomeSnapshotMinute: null,
    outcomeEvidenceStrength: 'unknown', outcomeEvidenceLimitations: ['no_trigger'],
    evidenceSummary: 'trigger:unknown · outcome:unknown',
  }
}

export async function runPatternBacktest(config: NormalizedConfig): Promise<BacktestRun> {
  const repos = createRepositories()
  const now = new Date().toISOString()
  const pattern = await repos.patterns.findById(config.patternId, DEFAULT_USER)

  const run: BacktestRun = {
    id: backtestRunId(), patternId: config.patternId, patternName: pattern?.name || config.patternId,
    userId: DEFAULT_USER, status: 'running', mode: 'pattern_backtest', config,
    summary: null, dataCoverage: null, limitations: [], createdAt: now, startedAt: now, completedAt: null, error: null,
  }
  if (!config.dryRun) await repos.intelligence.createBacktestRun(run)

  try {
    if (!pattern) {
      run.status = 'failed'; run.error = 'Pattern not found'; run.completedAt = new Date().toISOString()
      if (!config.dryRun) await repos.intelligence.updateBacktestRun(run.id, run)
      return run
    }
    const conditions = safeParse<any[]>(pattern.conditionsJson, [])
    const extended = parseScopeExtended(pattern.extendedJson)
    const scopeFilter = parseScopeFilter(pattern.scopeFilterJson)
    const patternView = {
      id: pattern.id, name: pattern.name, conditions, minConfidence: pattern.minConfidence ?? 50,
      severity: pattern.severity || 'attention', requireRichData: pattern.requireRichData,
      signalType: conditions.find((c: any) => !['is_live', 'is_pre_live', 'minute_between', 'is_final_phase', 'favorite_involved'].includes(c.type))?.type,
    }

    // ── Resolve candidate fixtures ──
    let candidates: any[] = []
    if (config.fixtures && config.fixtures.length > 0) {
      for (const fid of config.fixtures.slice(0, config.maxFixtures)) {
        const fx = await repos.fixtures.findById(fid)
        if (fx) candidates.push(fx)
      }
    } else {
      const all = await repos.fixtures.listLive(HISTORICAL_STATUSES, 1000)
      candidates = all.filter((fx: any) => {
        if (config.dateFrom && (fx.startTime || '') < config.dateFrom) return false
        if (config.dateTo && (fx.startTime || '') > config.dateTo) return false
        if (!matchesAny(config.leagues, fx.competition || '')) return false
        if (config.teams && config.teams.length > 0 && !(matchesAny(config.teams, fx.homeName || '') || matchesAny(config.teams, fx.awayName || ''))) return false
        const scope = evaluatePatternScope({
          scope: pattern.scope, onlyLive: pattern.onlyLive, onlyPreMatch: pattern.onlyPreMatch,
          scopeFilter, matches: extended.matches, excludeLeagues: extended.excludeLeagues,
          excludeTeams: extended.excludeTeams, excludeMatches: extended.excludeMatches,
          favoriteTeams: extended.favoriteTeams, favoriteLeagues: extended.favoriteLeagues,
        }, { competition: fx.competition || '', homeName: fx.homeName || '', awayName: fx.awayName || '', canonicalKey: fx.canonicalKey || '' })
        return scope.inScope
      }).slice(0, config.maxFixtures)
    }

    const coverage = newCoverage()
    coverage.fixturesFound = candidates.length
    const results: BacktestSignalResult[] = []
    const evidenceLinks: LinkSnapshotInput[] = []
    const lineageOn = String(env.ENABLE_EVIDENCE_LINEAGE).toLowerCase() === 'true'

    for (const fx of candidates) {
      const fixtureView: BacktestFixtureView = {
        id: fx.id, canonicalKey: fx.canonicalKey || fx.id, homeName: fx.homeName || 'unknown',
        awayName: fx.awayName || 'unknown', competition: fx.competition || 'unknown', status: fx.status || 'NS',
      }
      const snaps = await repos.liveSnapshots.listRecent({ fixtureId: fx.id, limit: SNAPSHOTS_PER_FIXTURE })
      if (!snaps || snaps.length === 0) {
        coverage.fixturesWithoutSnapshots++
        coverage.notEvaluableCount++
        results.push({
          fixtureId: fx.id, fixtureLabel: `${fixtureView.homeName} vs ${fixtureView.awayName}`,
          leagueName: fixtureView.competition, homeTeam: fixtureView.homeName, awayTeam: fixtureView.awayName,
          minute: null, scoreState: { home: 0, away: 0 }, wouldTrigger: false, confidenceAtTrigger: null,
          matchedConditions: [], missingConditions: conditions.map((c: any) => c.type), blockedReasons: ['Sem snapshots históricos'],
          dataQuality: 'unknown', matchContext: null, estimatedOutcome: 'not_evaluable',
          outcomeReason: 'Sem snapshots para este jogo — não avaliável', evidence: null,
        })
        continue
      }
      coverage.fixturesWithSnapshots++
      const result = evaluateFixture(patternView, fixtureView, snaps as RawSnapshot[], config.evaluationMode, coverage)
      results.push(result)
      // B33: EXACT evidence links — these snapshot docs were the actual backtest input.
      if (lineageOn && !config.dryRun) {
        const resultId = backtestSignalResultId(run.id, fx.id)
        for (const s of (snaps as any[]).slice(0, 30)) {
          if (!s?.id) continue
          evidenceLinks.push({
            snapshotId: String(s.id), fixtureId: fx.id, provider: s.provider ?? null,
            capturedAt: s.capturedAt ?? null, minute: typeof s.minute === 'number' ? s.minute : null,
            linkStrength: 'exact', source: 'backtest_result', sourceId: resultId, sourceType: 'BacktestSignalResult',
            patternId: run.patternId ?? null, backtestRunId: run.id, evidenceKind: 'backtest_evaluation',
            reason: 'Snapshot consumido diretamente pela avaliação de backtest.',
          })
        }
      }
    }

    const summary = buildBacktestSummary(results, coverage)
    run.summary = summary
    run.dataCoverage = coverage
    run.limitations = deriveLimitations(coverage, summary)
    run.status = 'completed'
    run.completedAt = new Date().toISOString()

    if (!config.dryRun) {
      for (const r of results) {
        try { await repos.intelligence.createBacktestSignalResult({ ...r, runId: run.id, id: backtestSignalResultId(run.id, r.fixtureId) } as any) } catch { /* never block */ }
      }
      await repos.intelligence.updateBacktestRun(run.id, run)
      if (lineageOn && evidenceLinks.length > 0) { void linkSnapshotsToSource(evidenceLinks) }
    }
    return run
  } catch (e: any) {
    run.status = 'failed'; run.error = e?.message || String(e); run.completedAt = new Date().toISOString()
    if (!config.dryRun) { try { await repos.intelligence.updateBacktestRun(run.id, run) } catch { /* ignore */ } }
    return run
  }
}

function deriveLimitations(cov: BacktestDataCoverage, summary: any): BacktestLimitation[] {
  const out: BacktestLimitation[] = []
  if (cov.fixturesFound === 0) out.push({ code: 'no_fixtures_in_scope', message: 'Nenhum jogo no escopo/intervalo informado.' })
  if (cov.fixturesWithSnapshots === 0 && cov.fixturesFound > 0) out.push({ code: 'no_snapshots', message: 'Nenhum jogo no escopo possui snapshots históricos.' })
  if (cov.notEvaluableCount > 0 && cov.notEvaluableCount >= cov.fixturesFound * 0.5) out.push({ code: 'no_post_trigger_data', message: 'Metade ou mais dos jogos não tem dados suficientes (sem snapshots/pós-gatilho).' })
  if ((cov.poorDataCount + cov.unknownDataCount) > (cov.richDataCount + cov.partialDataCount)) out.push({ code: 'poor_data_quality', message: 'Predomínio de snapshots com qualidade baixa/desconhecida.' })
  if (summary.sampleQuality === 'insufficient' || summary.sampleQuality === 'low') out.push({ code: 'small_sample', message: `Amostra ${summary.sampleQuality}: trate os resultados como indício inicial.` })
  return out
}

function safeParse<T>(s: string | null | undefined, fb: T): T { if (!s) return fb; try { return JSON.parse(s) as T } catch { return fb } }

/**
 * Replay Engine (Phase B14) — read-only, explainable match replay.
 * ─────────────────────────────────────────────────────────────────────────────
 * Walks a fixture's recorded snapshots as if live and explains, minute by minute,
 * why the radar would or wouldn't have fired. Creates NO alerts, NO production
 * ledger, sends NO Telegram. Persists only its own replay run (deterministic id).
 */
import { createRepositories } from '../../../repositories/index.js'
import { evaluateCondition, evaluatePatternAgainstInput } from '../../command/commandEvaluation.service.js'
import { orderSnapshotsChronologically, snapshotsAfter, type RawSnapshot } from './utils/replayTimeline.util.js'
import { replayRunId } from './utils/backtestId.util.js'
import { buildBacktestInput, contextForFixture, type BacktestFixtureView } from './backtestEvaluationAdapter.service.js'
import { estimateOutcome } from './backtestOutcome.service.js'
import type { ReplayRun, ReplayDecisionPoint } from './backtest.types.js'
import type { DataQuality } from '../contracts/intelligence.types.js'

const DEFAULT_USER = 'default'

function explain(minute: number | null, wouldTrigger: boolean, missing: string[], blockers: string[]): string {
  const m = minute == null ? "?'" : `${minute}'`
  if (wouldTrigger) return `${m}: todas as condições bateram — o radar teria disparado.`
  if (blockers.length > 0) return `${m}: bloqueado (${blockers[0]}).`
  if (missing.length > 0) return `${m}: faltou ${missing.slice(0, 3).join(', ')}.`
  return `${m}: condições parcialmente atendidas.`
}

export async function replayFixture(patternId: string, fixtureId: string, opts: { persist?: boolean } = {}): Promise<ReplayRun> {
  const repos = createRepositories()
  const persist = opts.persist !== false
  const now = new Date().toISOString()
  const pattern = await repos.patterns.findById(patternId, DEFAULT_USER)
  const fixture = await repos.fixtures.findById(fixtureId)

  const base: ReplayRun = {
    id: replayRunId(patternId, fixtureId), patternId, patternName: pattern?.name || patternId,
    fixtureId, fixtureLabel: fixture ? `${fixture.homeName} vs ${fixture.awayName}` : fixtureId,
    leagueName: fixture?.competition || 'unknown', firstTriggerMinute: null, wouldTrigger: false,
    timeline: [], estimatedOutcome: 'not_evaluable', outcomeReason: '', snapshotsEvaluated: 0, notes: [], createdAt: now,
  }

  if (!pattern) { base.notes.push('Pattern não encontrado'); return base }
  if (!fixture) { base.notes.push('Fixture não encontrada'); return base }

  const snaps = await repos.liveSnapshots.listRecent({ fixtureId, limit: 300 })
  if (!snaps || snaps.length === 0) {
    base.notes.push('Sem snapshots históricos para esta partida — replay não disponível')
    return base
  }

  const conditions = safeParse<any[]>(pattern.conditionsJson, [])
  const signalType = conditions.find((c: any) => !['is_live', 'is_pre_live', 'minute_between', 'is_final_phase', 'favorite_involved'].includes(c.type))?.type
  const evalPattern = {
    id: pattern.id, name: pattern.name, conditions, minConfidence: pattern.minConfidence ?? 50,
    severity: pattern.severity || 'attention', requireRichData: false, action: 'register_alert', status: 'active',
  }
  const fixtureView: BacktestFixtureView = {
    id: fixture.id, canonicalKey: fixture.canonicalKey || fixture.id, homeName: fixture.homeName || 'unknown',
    awayName: fixture.awayName || 'unknown', competition: fixture.competition || 'unknown', status: fixture.status || 'NS',
  }
  const context = contextForFixture(fixtureView.competition)
  const ordered = orderSnapshotsChronologically(snaps as RawSnapshot[])
  const timeline: ReplayDecisionPoint[] = []
  let triggerIndex = -1
  let triggerInput: any = null

  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i]
    const input = buildBacktestInput(fixtureView, {
      minute: s.minute ?? null, scoreHome: s.scoreHome ?? 0, scoreAway: s.scoreAway ?? 0,
      penaltyHome: s.penaltyHome ?? null, penaltyAway: s.penaltyAway ?? null, status: s.status ?? null,
      statsJson: s.statsJson ?? null, eventsJson: s.eventsJson ?? null,
      dataQuality: (s.dataQuality as string) || 'poor', provider: (s.provider as string) || 'unknown',
      capturedAt: s.capturedAt ?? now,
    }, context)
    const res = evaluatePatternAgainstInput(evalPattern, input)
    const passed: string[] = []; const missing: string[] = []
    for (const c of conditions) { (evaluateCondition(c, input) ? passed : missing).push(c.type) }
    const point: ReplayDecisionPoint = {
      minute: input.minute, status: input.status, score: input.score,
      passedConditions: passed, missingConditions: missing, blockers: res.blockers,
      wouldTrigger: res.shouldAlert, confidence: res.confidence,
      dataQuality: (input.dataQuality as DataQuality) || 'unknown',
      explanation: explain(input.minute, res.shouldAlert, missing, res.blockers),
    }
    timeline.push(point)
    if (res.shouldAlert && triggerIndex < 0) { triggerIndex = i; triggerInput = input }
  }

  base.snapshotsEvaluated = ordered.length
  base.timeline = timeline
  base.wouldTrigger = triggerIndex >= 0
  base.firstTriggerMinute = triggerIndex >= 0 ? (triggerInput?.minute ?? null) : null

  if (triggerIndex >= 0 && triggerInput) {
    const guess = estimateOutcome({
      patternName: pattern.name, signalType, triggerMinute: triggerInput.minute,
      triggerScore: triggerInput.score, postSnapshots: snapshotsAfter(ordered, triggerIndex),
    })
    base.estimatedOutcome = guess.outcome
    base.outcomeReason = guess.reason
  } else {
    base.outcomeReason = 'Radar não dispararia nesta partida com os dados disponíveis'
  }

  if (persist) { try { await repos.intelligence.createReplayRun(base) } catch { /* read-only intent; never block */ } }
  return base
}

function safeParse<T>(s: string | null | undefined, fb: T): T { if (!s) return fb; try { return JSON.parse(s) as T } catch { return fb } }

/**
 * Backtest & Replay — canonical types (Phase B14).
 * ─────────────────────────────────────────────────────────────────────────────
 * Honest, read-only simulation contracts. A backtest re-evaluates a pattern over
 * already-recorded snapshots; it NEVER creates alerts, sends Telegram, touches
 * production counters/profiles or invents history. `unknown`/`not_evaluable` are
 * never failures; `confirmed_partial` counts as partial usefulness.
 */
import type { DataQuality } from '../contracts/intelligence.types.js'
import type { ContextBreakdownSample, SampleQuality } from '../contracts/learning.types.js'

export type BacktestEstimatedOutcome =
  | 'confirmed' | 'confirmed_partial' | 'failed' | 'unknown' | 'not_evaluable'

export type BacktestRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type BacktestMode = 'pattern_backtest' | 'replay'
export type BacktestEvaluationMode = 'strict' | 'diagnostic'

export interface BacktestConditionResult {
  type: string
  passed: boolean
  params: Record<string, unknown>
}

export interface BacktestTimelinePoint {
  minute: number | null
  status: string
  score: { home: number; away: number }
  passedConditions: string[]
  missingConditions: string[]
  blockers: string[]
  wouldTrigger: boolean
  confidence: number
  dataQuality: DataQuality
  explanation: string
}

export interface BacktestOutcomeGuess {
  outcome: BacktestEstimatedOutcome
  reason: string
  windowMinutes: number
  evidence: {
    postSnapshots: number
    goalsInWindow: number
    cornersInWindow: number
    cardsInWindow: number
    hasTimedEvents: boolean
    hasStats: boolean
    warnings: string[]
  }
}

export interface BacktestSignalResult {
  fixtureId: string
  fixtureLabel: string
  leagueName: string
  homeTeam: string
  awayTeam: string
  minute: number | null
  scoreState: { home: number; away: number }
  wouldTrigger: boolean
  confidenceAtTrigger: number | null
  matchedConditions: string[]
  missingConditions: string[]
  blockedReasons: string[]
  dataQuality: DataQuality
  matchContext: {
    competitionType: string; stage: string; isKnockout: boolean
    importance: number; importanceLabel: string
  } | null
  estimatedOutcome: BacktestEstimatedOutcome
  outcomeReason: string
  evidence: BacktestOutcomeGuess['evidence'] | null
}

export interface BacktestDataCoverage {
  fixturesFound: number
  fixturesWithSnapshots: number
  fixturesWithoutSnapshots: number
  snapshotsEvaluated: number
  richDataCount: number
  partialDataCount: number
  poorDataCount: number
  unknownDataCount: number
  notEvaluableCount: number
  providerBreakdown: Record<string, number>
}

export interface BacktestSummary {
  fixturesAnalyzed: number
  signalsTriggered: number
  confirmed: number
  confirmedPartial: number
  failed: number
  unknown: number
  notEvaluable: number
  usefulRate: number | null
  failedRate: number | null
  unknownRate: number | null
  avgConfidence: number | null
  avgTriggerMinute: number | null
  bestMinuteWindows: ContextBreakdownSample[]
  worstMinuteWindows: ContextBreakdownSample[]
  bestCompetitions: ContextBreakdownSample[]
  weakContexts: ContextBreakdownSample[]
  commonMissingConditions: { condition: string; count: number }[]
  commonBlockedReasons: { reason: string; count: number }[]
  sampleQuality: SampleQuality
  dataCoverage: BacktestDataCoverage
}

export interface BacktestLimitation {
  code:
    | 'no_snapshots' | 'sparse_snapshots' | 'no_post_trigger_data' | 'poor_data_quality'
    | 'no_fixtures_in_scope' | 'small_sample' | 'provider_gap'
  message: string
}

export interface BacktestRunConfig {
  patternId: string
  dateFrom?: string | null
  dateTo?: string | null
  leagues?: string[]
  teams?: string[]
  fixtures?: string[]
  includeUnknown?: boolean
  maxFixtures?: number
  evaluationMode?: BacktestEvaluationMode
  useExistingSnapshotsOnly: true
  dryRun?: boolean
}

export interface BacktestRun {
  id: string
  patternId: string
  patternName: string
  userId: string
  status: BacktestRunStatus
  mode: BacktestMode
  config: BacktestRunConfig
  summary: BacktestSummary | null
  dataCoverage: BacktestDataCoverage | null
  limitations: BacktestLimitation[]
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  error: string | null
}

// ─── Replay ──────────────────────────────────────────────────────────────────

export type ReplayDecisionPoint = BacktestTimelinePoint

export interface ReplayTimeline {
  points: ReplayDecisionPoint[]
}

export interface ReplayRun {
  id: string
  patternId: string
  patternName: string
  fixtureId: string
  fixtureLabel: string
  leagueName: string
  firstTriggerMinute: number | null
  wouldTrigger: boolean
  timeline: ReplayDecisionPoint[]
  estimatedOutcome: BacktestEstimatedOutcome
  outcomeReason: string
  snapshotsEvaluated: number
  notes: string[]
  createdAt: string
}


/** A BacktestSignalResult as persisted (carries its own id + parent run id). */
export type PersistedBacktestSignalResult = BacktestSignalResult & { id: string; runId: string }

/**
 * Frontend mirror of the B14 backtest/replay contracts (Phase B15).
 * Kept in sync with backend/src/modules/intelligence/backtest/backtest.types.ts.
 * Only the fields the UI consumes are typed; everything optional/loose stays safe.
 */

export type BacktestEstimatedOutcome =
  | 'confirmed' | 'confirmed_partial' | 'failed' | 'unknown' | 'not_evaluable'

/** UI-only derived status that also covers "did not trigger". */
export type ResultDisplayStatus = BacktestEstimatedOutcome | 'no_trigger'

export type BacktestRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type DataQuality = 'rich' | 'partial' | 'poor' | 'unknown'
export type SampleQuality = 'insufficient' | 'low' | 'moderate' | 'strong'

export interface BacktestRunConfig {
  patternId: string
  dateFrom?: string | null
  dateTo?: string | null
  leagues?: string[]
  teams?: string[]
  fixtures?: string[]
  includeUnknown?: boolean
  maxFixtures?: number
  evaluationMode?: 'strict' | 'diagnostic'
  useExistingSnapshotsOnly?: true
  dryRun?: boolean
}

export interface ContextBreakdownSample {
  contextKey: string
  label: string
  sampleSize: number
  usefulRate: number | null
  failedRate: number | null
  unknownRate: number | null
  sampleQuality: SampleQuality
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
  code: string
  message: string
}

export interface BacktestRun {
  id: string
  patternId: string
  patternName: string
  status: BacktestRunStatus
  mode: 'pattern_backtest' | 'replay'
  config: BacktestRunConfig
  summary: BacktestSummary | null
  dataCoverage: BacktestDataCoverage | null
  limitations: BacktestLimitation[]
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  error: string | null
}

export interface BacktestSignalResult {
  id?: string
  runId?: string
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
  evidence: {
    postSnapshots: number; goalsInWindow: number; cornersInWindow: number
    cardsInWindow: number; hasTimedEvents: boolean; hasStats: boolean; warnings: string[]
  } | null
}

export interface ReplayDecisionPoint {
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

/** Derive the UI display status for a result row. */
export function displayStatusOf(r: BacktestSignalResult): ResultDisplayStatus {
  if (!r.wouldTrigger) return 'no_trigger'
  return r.estimatedOutcome
}

export const OUTCOME_LABEL: Record<ResultDisplayStatus, string> = {
  confirmed: 'Confirmado',
  confirmed_partial: 'Parcial',
  failed: 'Falhou',
  unknown: 'Sem dados',
  not_evaluable: 'Não avaliável',
  no_trigger: 'Não dispararia',
}

/** Neutral, honest tones — no aggressive win/loss green/red. */
export const OUTCOME_TONE: Record<ResultDisplayStatus, { text: string; bg: string; border: string; dot: string }> = {
  confirmed: { text: 'text-emerald-200/90', bg: 'bg-emerald-500/[0.08]', border: 'border-emerald-400/20', dot: 'bg-emerald-400/80' },
  confirmed_partial: { text: 'text-teal-200/90', bg: 'bg-teal-500/[0.08]', border: 'border-teal-400/20', dot: 'bg-[#2DD4BF]/80' },
  failed: { text: 'text-rose-200/85', bg: 'bg-rose-500/[0.06]', border: 'border-rose-400/15', dot: 'bg-rose-400/70' },
  unknown: { text: 'text-amber-100/75', bg: 'bg-amber-500/[0.05]', border: 'border-amber-400/15', dot: 'bg-amber-300/60' },
  not_evaluable: { text: 'text-white/55', bg: 'bg-white/[0.03]', border: 'border-white/[0.08]', dot: 'bg-white/30' },
  no_trigger: { text: 'text-white/45', bg: 'bg-white/[0.02]', border: 'border-white/[0.06]', dot: 'bg-white/20' },
}

export const SAMPLE_QUALITY_LABEL: Record<SampleQuality, string> = {
  insufficient: 'Amostra insuficiente', low: 'Amostra baixa', moderate: 'Amostra moderada', strong: 'Amostra robusta',
}

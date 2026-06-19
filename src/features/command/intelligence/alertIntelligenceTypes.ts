/**
 * Frontend mirror of the B12/B13 intelligence contracts consumed by Alertas 2.0.
 * Only the fields the UI reads are typed; everything stays optional/loose-safe.
 */

export type AlertResult = 'pending' | 'confirmed' | 'confirmed_partial' | 'failed' | 'unknown' | 'expired'
export type DataQuality = 'rich' | 'partial' | 'poor' | 'unknown'
export type SampleQuality = 'insufficient' | 'low' | 'moderate' | 'strong'
export type Confidence = 'low' | 'medium' | 'high'

export interface SignalEvidenceSnapshot {
  evaluatedConditions: string[]
  passedConditions: string[]
  failedConditions: string[]
  signalConditions: string[]
  eligibilityConditions: string[]
  blockers: string[]
  confidenceBreakdown: Record<string, number> | null
  liveStatsUsed: Record<string, number> | null
  scoreState: { home: number; away: number }
  minuteState: number | null
  recentEvents: Array<{ minute: number; type: string; side?: string }> | null
  scopeReason: string | null
  matchContextReason: string | null
  providerQuality: DataQuality
  missingData: string[]
}

export interface SignalLedgerEntry {
  id: string
  alertId: string | null
  patternId: string | null
  radarName: string
  fixtureId: string
  fixtureLabel: string
  leagueName: string
  homeTeam: string
  awayTeam: string
  minute: number | null
  scoreState: { home: number; away: number }
  signalStatus: string
  signalType: string
  confidenceAtSignal: number | null
  severity: string
  evidence: SignalEvidenceSnapshot | null
  scopeDecision: { reason: string } | null
  matchContext: {
    competitionType: string; stage: string; isKnockout: boolean
    importance: number; importanceLabel: string
  } | null
  dataAvailability: Record<string, { available: boolean; source: string | null; quality: DataQuality; unavailableReason?: string }>
  createdAt: string
  updatedAt: string
}

export interface AlertOutcomeRecord {
  id: string
  alertId: string
  fixtureId: string
  patternId: string | null
  result: AlertResult
  resolutionType: string | null
  resolutionMinute: number | null
  timeToResolutionMinutes: number | null
  outcomeReason: string
  whatConfirmed: string[]
  whatFailed: string[]
  missingForConfirmation: string[]
  dataQualityAtResolution: DataQuality
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
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

export interface PatternLearningProfile {
  id: string
  scopeKey: string
  label: string
  radarName: string
  sampleSize: number
  resolvedCount: number
  usefulCount: number
  confirmedCount: number
  confirmedPartialCount: number
  failedCount: number
  unknownCount: number
  pendingCount: number
  expiredCount: number
  usefulRate: number | null
  failedRate: number | null
  unknownRate: number | null
  avgConfidenceAtSignal: number | null
  avgTimeToResolutionMinutes: number | null
  sampleQuality: SampleQuality
  bestCompetitions: ContextBreakdownSample[]
  worstCompetitions: ContextBreakdownSample[]
  bestMinuteWindows: ContextBreakdownSample[]
  worstMinuteWindows: ContextBreakdownSample[]
  topFailureReasons: { reason: string; count: number }[]
  lastUpdatedAt: string
}

export interface SignalFailureAnalysis {
  id: string
  alertId: string
  patternId: string | null
  failureReason: string
  contributingFactors: string[]
  suggestedReview: string | null
  confidenceInDiagnosis: Confidence
  createdAt: string
}

export interface LearningEvent {
  id: string
  type: string
  fixtureId: string | null
  alertId: string | null
  patternId: string | null
  contextKey: string
  message: string
  evidenceRef: string | null
  confidence: Confidence
  createdAt: string
}

export interface LearningRecommendation {
  id: string
  type: string
  scopeType: string
  scopeKey: string
  patternId: string | null
  message: string
  strength: Confidence
  evidence: { sampleSize: number; context: string; sampleQuality: SampleQuality }
  createdAt: string
}

export interface LearningOverview {
  totalAlertsTracked: number
  resolvedAlerts: number
  pendingAlerts: number
  usefulSignals: number
  failedSignals: number
  unknownSignals: number
  topPatternsByUsefulRate: ContextBreakdownSample[]
  highUnknownContexts: ContextBreakdownSample[]
  mostCommonFailureReasons: { reason: string; count: number }[]
  recentLearningEvents: Array<{ id: string; type: string; message: string; createdAt: string }>
  latestAggregationRun: { status: string; finishedAt: string | null } | null
  generatedAt: string
}

// ─── Shared display helpers (neutral, honest tones) ────────────────────────────

export const RESULT_LABEL: Record<AlertResult, string> = {
  pending: 'Pendente', confirmed: 'Confirmado', confirmed_partial: 'Parcial',
  failed: 'Falhou', unknown: 'Sem dados', expired: 'Expirado',
}

export const RESULT_TONE: Record<AlertResult, { text: string; bg: string; border: string; dot: string }> = {
  pending: { text: 'text-amber-200/85', bg: 'bg-amber-500/[0.07]', border: 'border-amber-400/18', dot: 'bg-amber-300/70' },
  confirmed: { text: 'text-emerald-200/90', bg: 'bg-emerald-500/[0.08]', border: 'border-emerald-400/20', dot: 'bg-emerald-400/80' },
  confirmed_partial: { text: 'text-teal-200/90', bg: 'bg-teal-500/[0.08]', border: 'border-teal-400/20', dot: 'bg-[#2DD4BF]/80' },
  failed: { text: 'text-rose-200/85', bg: 'bg-rose-500/[0.06]', border: 'border-rose-400/15', dot: 'bg-rose-400/70' },
  unknown: { text: 'text-white/60', bg: 'bg-white/[0.03]', border: 'border-white/[0.08]', dot: 'bg-white/35' },
  expired: { text: 'text-white/50', bg: 'bg-white/[0.025]', border: 'border-white/[0.06]', dot: 'bg-white/25' },
}

export const SAMPLE_QUALITY_LABEL: Record<SampleQuality, string> = {
  insufficient: 'Amostra insuficiente', low: 'Amostra baixa', moderate: 'Amostra moderada', strong: 'Amostra robusta',
}

export function pct(v: number | null | undefined): string { return v == null ? '—' : `${Math.round(v * 100)}%` }

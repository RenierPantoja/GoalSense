/**
 * Automatic Engine — canonical types (Phase B19).
 * ─────────────────────────────────────────────────────────────────────────────
 * The Auto Engine scans live fixtures and produces explainable, ranked
 * OPPORTUNITIES (not alerts). Deterministic, honest: no ML, no odds, no bets, no
 * promises. `unknown`/missing data is never a failure; `confirmed_partial` stays
 * partial usefulness; scores are signal-quality, NOT probabilities.
 */
import type { DataQuality, SampleQuality } from '../contracts/learning.types.js'

export type OpportunityType =
  | 'late_goal_pressure'
  | 'first_half_goal_pressure'
  | 'corners_pressure'
  | 'cards_pressure'
  | 'comeback_pressure'
  | 'dominant_home_pressure'
  | 'dominant_away_pressure'
  | 'pattern_similarity'
  | 'unknown'

export type OpportunityStatus = 'candidate' | 'watch' | 'strong' | 'blocked' | 'ignored'
export type ConfidenceBand = 'low' | 'medium' | 'high' | 'insufficient_data'

export type AutoSignalBlockReason =
  | 'auto_engine_disabled'
  | 'not_live'
  | 'data_poor'
  | 'provider_stale'
  | 'missing_required_data'
  | 'sample_quality_insufficient'
  | 'historically_weak'
  | 'recent_manual_alert'
  | 'duplicate_opportunity'
  | 'max_opportunities_per_fixture'
  | 'score_below_minimum'
  | 'too_much_unknown'
  | 'no_evidence'

export interface AutoSignalScore {
  baseScore: number
  liveContextScore: number
  patternLearningScore: number
  competitionScore: number
  teamContextScore: number
  minuteWindowScore: number
  dataQualityScore: number
  riskPenalty: number
  finalScore: number
  scoringNotes: string[]
}

export interface AutoSignalEvidence {
  liveStatsUsed: Record<string, number> | null
  minute: number | null
  scoreState: { home: number; away: number }
  recentOffensiveEvents: number
  passedSignals: string[]
  missingData: string[]
  dataQuality: DataQuality
  provider: string
}

export interface AutoSignalContextFit {
  competitionType: string | null
  importanceLabel: string | null
  minuteWindow: string
  matchedLearningContexts: string[]
  sampleQuality: SampleQuality
  source: 'observed' | 'heuristic' | 'limited'
  notes: string[]
}

export interface AutoSignalRiskGateResult {
  allowed: boolean
  blockReasons: AutoSignalBlockReason[]
  penalties: { reason: string; amount: number }[]
  warnings: string[]
  finalDecision: 'allow' | 'reduce' | 'block'
}

export interface AutoSignalExplanation {
  headline: string
  whyNow: string[]
  evidenceUsed: string[]
  historicalContext: string[]
  risks: string[]
  relatedPatternNote: string | null
}

export interface AutoOpportunity {
  id: string
  runId: string
  fixtureId: string
  fixtureLabel: string
  leagueName: string
  homeTeam: string
  awayTeam: string
  minute: number | null
  scoreState: { home: number; away: number }
  opportunityType: OpportunityType
  status: OpportunityStatus
  score: number
  confidenceBand: ConfidenceBand
  scoreBreakdown: AutoSignalScore
  evidence: AutoSignalEvidence
  contextFit: AutoSignalContextFit
  riskGate: AutoSignalRiskGateResult
  relatedPatternIds: string[]
  learningProfileRefs: string[]
  dataAvailability: Record<string, boolean>
  explanation: AutoSignalExplanation
  createdAt: string
  updatedAt: string
}

export interface AutoEngineRunConfig {
  maxFixtures: number
  minSampleQuality: SampleQuality
  minScore: number
  maxOppsPerFixture: number
  write: boolean
  dryRun: boolean
}

export interface AutoEngineRun {
  id: string
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'completed' | 'failed' | 'skipped'
  enabled: boolean
  write: boolean
  config: AutoEngineRunConfig
  fixturesScanned: number
  opportunitiesFound: number
  strong: number
  watch: number
  candidate: number
  blocked: number
  blockReasons: Record<string, number>
  notes: string[]
}

export interface AutoEngineOverview {
  enabled: boolean
  writeEnabled: boolean
  schedulerEnabled: boolean
  toAlertsEnabled: boolean
  lastRun: AutoEngineRun | null
  opportunitiesTotal: number
  strong: number
  watch: number
  candidate: number
  blocked: number
  topOpportunityTypes: { type: string; count: number }[]
  dataQualityBreakdown: Record<string, number>
  blockReasons: Record<string, number>
  limitations: string[]
  latestOpportunities: AutoOpportunity[]
  generatedAt: string
}

/**
 * Auto Engine Learning & Calibration — canonical types (Phase B24).
 * ─────────────────────────────────────────────────────────────────────────────
 * A SEPARATE, observational learning namespace built from the closed B22/B23 loop
 * (manually-promoted alerts + their honest outcomes). Never auto-tunes the engine,
 * never rewrites opportunity scores, never touches manual-pattern learning. Rates
 * are over resolved promoted alerts only; `unknown` is never a failure;
 * `confirmed_partial` is partial-useful; score is signal-quality, not probability.
 */
import type { OpportunityType, ConfidenceBand } from './autoEngine.types.js'
import type { SampleQuality } from '../contracts/learning.types.js'
import type { Confidence } from '../contracts/intelligence.types.js'

export type AutoPromotedResult = 'pending' | 'confirmed' | 'confirmed_partial' | 'failed' | 'unknown' | 'expired'

export type ScoreBucketLabel = '0-20' | '21-40' | '41-60' | '61-80' | '81-100'

export interface AutoScoreCalibrationBucket {
  label: ScoreBucketLabel
  minScore: number
  maxScore: number
  /** Resolved sample inside the bucket. */
  sampleSize: number
  usefulRate: number | null
  failedRate: number | null
  unknownRate: number | null
  calibrationNote: string
}

export interface AutoScoreCalibrationProfile {
  buckets: AutoScoreCalibrationBucket[]
  overallNote: string
}

export type RiskGateInterpretation =
  | 'useful_blocker' | 'too_conservative_possible' | 'insufficient_sample' | 'noisy_context' | 'unknown'

export interface AutoRiskGateProfile {
  blockReason: string
  /** How many scanned opportunities were blocked for this reason. */
  timesSeen: number
  /** Of those, how many were later promoted (blocked → promoted is rare by design). */
  laterPromotedCount: number
  promotedUsefulRate: number | null
  promotedUnknownRate: number | null
  interpretation: RiskGateInterpretation
  note: string
}

export interface AutoDataQualityProfile {
  dataQuality: string
  sampleSize: number
  usefulRate: number | null
  failedRate: number | null
  unknownRate: number | null
  note: string
}

export interface AutoContextProfileSample {
  key: string
  label: string
  sampleSize: number
  usefulRate: number | null
  unknownRate: number | null
  sampleQuality: SampleQuality
}

export interface AutoOpportunityTypeProfile {
  opportunityType: OpportunityType
  sampleSize: number
  confirmed: number
  confirmedPartial: number
  failed: number
  unknown: number
  usefulRate: number | null
  failedRate: number | null
  unknownRate: number | null
  avgScore: number | null
  avgOriginalScore: number | null
  avgTimeToResolutionMinutes: number | null
  bestMinuteWindows: AutoContextProfileSample[]
  weakMinuteWindows: AutoContextProfileSample[]
  topBlockReasonsBeforePromotion: { reason: string; count: number }[]
  topUnknownReasons: { reason: string; count: number }[]
  sampleQuality: SampleQuality
  recommendationStrength: Confidence
}

export type AutoEngineLearningRecommendationType =
  | 'opportunity_type_positive_signal'
  | 'opportunity_type_high_unknown'
  | 'score_bucket_insufficient_sample'
  | 'score_bucket_overestimating_possible'
  | 'data_quality_limitation'
  | 'risk_gate_observation'
  | 'insufficient_sample'

export interface AutoEngineLearningRecommendation {
  id: string
  type: AutoEngineLearningRecommendationType
  scopeKey: string
  message: string
  strength: Confidence
  evidence: { sampleSize: number; context: string; sampleQuality: SampleQuality }
  createdAt: string
}

export interface AutoEngineLearningProfile {
  id: string
  generatedAt: string
  source: 'auto_engine_promoted_alerts'
  /** Resolved promoted alerts used for the rates. */
  sampleSize: number
  promotedAlertsTotal: number
  confirmed: number
  confirmedPartial: number
  failed: number
  unknown: number
  expired: number
  usefulRate: number | null
  failedRate: number | null
  unknownRate: number | null
  sampleQuality: SampleQuality
  opportunityTypeProfiles: AutoOpportunityTypeProfile[]
  scoreCalibration: AutoScoreCalibrationProfile
  riskGateProfile: AutoRiskGateProfile[]
  dataQualityProfile: AutoDataQualityProfile[]
  leagueProfiles: AutoContextProfileSample[]
  teamProfiles: AutoContextProfileSample[]
  minuteWindowProfiles: AutoContextProfileSample[]
  recommendations: AutoEngineLearningRecommendation[]
  limitations: string[]
}

export interface AutoEngineLearningRun {
  id: string
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'completed' | 'failed'
  source: 'auto_engine_promoted_alerts'
  outcomeSummariesScanned: number
  outcomeLinksScanned: number
  opportunitiesJoined: number
  sampleSize: number
  profileGenerated: boolean
  recommendations: number
  learningEventsCreated: number
  dryRun: boolean
  notes: string[]
}

export interface AutoEngineCalibrationOverview {
  hasData: boolean
  sampleSize: number
  promotedAlertsTotal: number
  usefulRate: number | null
  failedRate: number | null
  unknownRate: number | null
  sampleQuality: SampleQuality
  topCalibratedOpportunityType: { opportunityType: OpportunityType; usefulRate: number | null; sampleSize: number } | null
  highestUnknownOpportunityType: { opportunityType: OpportunityType; unknownRate: number | null; sampleSize: number } | null
  scoreCalibration: AutoScoreCalibrationProfile | null
  topRecommendations: AutoEngineLearningRecommendation[]
  lastRunAt: string | null
  limitations: string[]
  generatedAt: string
}

/** PURE join record (one per resolved promoted opportunity). */
export interface JoinedPromotedOutcome {
  opportunityId: string
  opportunityType: OpportunityType
  score: number
  originalScore: number
  confidenceBand: ConfidenceBand
  league: string
  homeTeam: string
  awayTeam: string
  minute: number | null
  dataQuality: string
  warnings: string[]
  result: AutoPromotedResult
  timeToResolutionMinutes: number | null
  unknownReason: string | null
}

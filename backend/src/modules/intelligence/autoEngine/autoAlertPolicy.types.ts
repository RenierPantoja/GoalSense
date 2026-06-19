/**
 * Auto Alert Policy Engine — canonical types (Phase B25).
 * ─────────────────────────────────────────────────────────────────────────────
 * An EXPLICIT, auditable policy layer that decides whether an AutoOpportunity may
 * become a monitored alert. Shadow-first: by default it only RECORDS what it WOULD
 * do. Auto-creation requires every flag + the policy mode + all critical gates.
 * Never odds, never Telegram, never bet. Opportunity ≠ alert; score ≠ probability.
 */
import type { OpportunityType, ConfidenceBand } from './autoEngine.types.js'
import type { SampleQuality } from '../contracts/learning.types.js'

export type AutoAlertPolicyMode = 'disabled' | 'shadow_only' | 'suggest_manual' | 'auto_create_monitored'

export type AutoAlertPolicyDecision =
  | 'blocked'
  | 'shadow_would_create'
  | 'suggest_manual_review'
  | 'auto_created'
  | 'skipped_duplicate'
  | 'skipped_policy_disabled'
  | 'skipped_engine_disabled'

export type GateSeverity = 'info' | 'warning' | 'critical'

export interface AutoAlertPolicyGate {
  name: string
  passed: boolean
  severity: GateSeverity
  reason: string
  evidence: string | null
}

export interface AutoAlertPolicy {
  id: string
  name: string
  enabled: boolean
  mode: AutoAlertPolicyMode
  opportunityTypes: OpportunityType[]        // empty = any
  minScore: number
  minSampleQuality: SampleQuality
  allowedConfidenceBands: ConfidenceBand[]   // empty = any
  allowedDataQuality: string[]               // e.g. ['rich','partial']
  allowedLeagues: string[]                   // empty = any
  blockedLeagues: string[]
  allowedTeams: string[]                     // empty = any
  blockedTeams: string[]
  minuteWindows: string[]                    // empty = any
  maxPerFixture: number
  maxPerRun: number
  requireCalibration: boolean
  requireNoCriticalBlockers: boolean
  requireLearningProfile: boolean
  allowUnknownData: boolean
  allowPoorData: boolean
  createdAt: string
  updatedAt: string
  createdByUserId: string | null
}

/** Calibration snapshot the guard used (from B24), honest about absence. */
export interface AutoAlertCalibrationSnapshot {
  hasTypeProfile: boolean
  sampleQuality: SampleQuality | null
  usefulRate: number | null
  unknownRate: number | null
  failedRate: number | null
  scoreBucketInsufficient: boolean
}

export interface AutoAlertScoreSnapshot {
  score: number
  confidenceBand: ConfidenceBand
  status: string
  opportunityType: OpportunityType
}

export interface AutoAlertRiskGateSnapshot {
  allowed: boolean
  blockReasons: string[]
  warnings: string[]
}

export interface AutoAlertPolicyEvaluation {
  id: string
  policyId: string
  policyName: string
  opportunityId: string
  runId: string | null
  fixtureId: string
  evaluatedAt: string
  mode: AutoAlertPolicyMode
  decision: AutoAlertPolicyDecision
  gates: AutoAlertPolicyGate[]
  scoreSnapshot: AutoAlertScoreSnapshot
  calibrationSnapshot: AutoAlertCalibrationSnapshot
  riskGateSnapshot: AutoAlertRiskGateSnapshot
  reasons: string[]
  limitations: string[]
  promotedAlertId: string | null
  source: 'auto_alert_policy'
}

/** Lightweight audit trail entry (decision history is the evaluations themselves). */
export interface AutoAlertPolicyAuditTrail {
  evaluationId: string
  policyId: string
  opportunityId: string
  decision: AutoAlertPolicyDecision
  at: string
}

export interface AutoAlertPolicyCreateResult {
  created: boolean
  alertId: string | null
  ledgerId: string | null
  reason: string | null
}

export interface AutoAlertPolicyRun {
  policyId: string
  runId: string | null
  evaluated: number
  blocked: number
  shadowWouldCreate: number
  suggestedManual: number
  autoCreated: number
  skipped: number
}

export interface AutoAlertPolicyOverview {
  flags: {
    policyEnabled: boolean
    shadowMode: boolean
    createEnabled: boolean
    telegramEnabled: boolean
    toAlertsEnabled: boolean
    configEnabled: boolean
  }
  policies: number
  enabledPolicies: number
  totalEvaluations: number
  blocked: number
  shadowWouldCreate: number
  suggestedManual: number
  autoCreated: number
  skipped: number
  topBlockReasons: { reason: string; count: number }[]
  topBlockedOpportunityTypes: { opportunityType: string; count: number }[]
  mostRestrictivePolicies: { policyId: string; name: string; blocked: number }[]
  lastEvaluationAt: string | null
  limitations: string[]
  generatedAt: string
}

/** Shadow decision projection (UI/learning convenience). */
export interface AutoAlertPolicyShadowDecision {
  opportunityId: string
  policyId: string
  decision: AutoAlertPolicyDecision
  wouldCreate: boolean
  reasons: string[]
  evaluatedAt: string
}

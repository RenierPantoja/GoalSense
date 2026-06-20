/**
 * Fundamental Memory — Contracts (B45 / Bloco 2).
 * ─────────────────────────────────────────────────────────────────────────────
 * Deep historical club / matchup / context memory so the GoalSense does not analyze
 * each game "as if for the first time". Inviolable rules encoded in the types:
 *   - reliability ≠ probability of winning; it is data-confidence only;
 *   - no sample → `insufficient_history` (never a tendency, never a negative datum);
 *   - small sample never becomes a strong conclusion;
 *   - old / different-context history is `outdated` / down-weighted;
 *   - absence is never zero ("sem histórico" ≠ "0 gols"); empty only when confirmed;
 *   - internalMemory (GoalSense's own observations) is SEPARATE from providerMemory.
 */

/** Confidence of the SAMPLE behind a memory finding — never a win probability. */
export type SampleQuality =
  | 'strong'           // enough recent, in-context evidence to lean on
  | 'usable'           // some evidence; advisory only
  | 'weak'             // too small / too old to conclude
  | 'insufficient'     // effectively no usable evidence
  | 'misleading_risk'  // sample exists but is biased/old/mixed-context → risky to use
  | 'unknown'          // could not evaluate

export interface SampleQualityAssessment {
  quality: SampleQuality
  sampleSize: number
  recentSampleSize: number
  outdatedSampleSize: number
  contextMatchedSampleSize: number
  reliability: 'high' | 'medium' | 'low' | 'insufficient'
  canConclude: boolean
  warnings: string[]
  limitations: string[]
}

/** Where a memory datum came from. internal = GoalSense observations; provider = external. */
export type MemoryOrigin = 'goalsense_internal_memory' | 'provider_memory' | 'manual_memory' | 'mixed'

export interface MemoryProvenance {
  origin: MemoryOrigin
  internalSampleSize: number
  providerSampleSize: number
  manualSampleSize: number
  note: string
}

/** Home/away split — counts only; absence stays absent (no zero-filling). */
export interface TeamHomeAwayProfile {
  homeSample: number
  awaySample: number
  homeConfirmed: number
  homeFailed: number
  awayConfirmed: number
  awayFailed: number
  homeQuality: SampleQuality
  awayQuality: SampleQuality
  note: string
}

/** Goal behavior derived from internal observations — never invented when absent. */
export interface GoalBehaviorProfile {
  observed: boolean
  sample: number
  tendencyNote: string
  quality: SampleQuality
  limitations: string[]
}

/** Card/discipline behavior — same discipline as goals; absence never becomes "0 cards". */
export interface CardBehaviorProfile {
  observed: boolean
  sample: number
  tendencyNote: string
  quality: SampleQuality
  limitations: string[]
}

/** Per-pattern history for a club (confirmed/failed/unknown/not_evaluable kept distinct). */
export interface PatternHistoryProfile {
  patternKey: string
  patternName: string
  triggered: number
  confirmed: number
  confirmedPartial: number
  failed: number
  unknown: number
  notEvaluable: number
  quality: SampleQuality
  status: 'supported' | 'mixed' | 'weak_sample' | 'not_enough_data' | 'contradicted'
  note: string
}

/** Behavior by a single context key (knockout, high-importance, minute window, etc.). */
export interface ContextBehaviorProfile {
  contextKey: string
  contextLabel: string
  sample: number
  confirmed: number
  failed: number
  unknown: number
  quality: SampleQuality
  classification: 'strong_context' | 'usable_context' | 'misleading_context' | 'stay_out_context' | 'not_enough_data'
  note: string
}

/** The full fundamental memory profile for ONE club. */
export interface TeamFundamentalMemoryProfile {
  id: string
  teamId: string
  teamName: string
  builtAt: string
  recencyWindowDays: number
  provenance: MemoryProvenance
  overallSample: SampleQualityAssessment
  homeAway: TeamHomeAwayProfile
  goals: GoalBehaviorProfile
  cards: CardBehaviorProfile
  patternHistory: PatternHistoryProfile[]
  contextBehaviors: ContextBehaviorProfile[]
  competitionsObserved: string[]
  memoryState: 'insufficient_history' | 'developing' | 'usable' | 'mature'
  limitations: string[]
  source: MemoryOrigin
}

/** Fundamental memory for a specific MATCHUP (two clubs). */
export interface MatchupFundamentalMemoryProfile {
  id: string
  homeTeamId: string
  awayTeamId: string
  homeTeamName: string
  awayTeamName: string
  builtAt: string
  matchesFound: number
  relevantMatches: number
  outdatedMatches: number
  provenance: MemoryProvenance
  sample: SampleQualityAssessment
  recurringObservations: string[]
  brokenObservations: string[]
  matchupState: 'insufficient_data' | 'developing' | 'usable' | 'mature'
  maturity: 'low' | 'medium' | 'high' | 'insufficient_data'
  limitations: string[]
  source: MemoryOrigin
}

/** Aggregated memory for a competition. */
export interface CompetitionMemoryProfile {
  id: string
  competitionKey: string
  competitionName: string
  builtAt: string
  sample: SampleQualityAssessment
  confirmed: number
  failed: number
  unknown: number
  behaviorNotes: string[]
  state: 'insufficient_history' | 'developing' | 'usable' | 'mature'
  limitations: string[]
  source: MemoryOrigin
}

/** Memory of how a PATTERN behaves under a CONTEXT (pattern × context grid cell). */
export interface HistoricalPatternContextProfile {
  id: string
  patternKey: string
  patternName: string
  contextKey: string
  contextLabel: string
  builtAt: string
  sample: SampleQualityAssessment
  confirmed: number
  confirmedPartial: number
  failed: number
  unknown: number
  notEvaluable: number
  classification: 'confirmed_strong' | 'confirmed_partial_useful' | 'mixed' | 'failed_context' | 'not_evaluable' | 'not_enough_data'
  recommendation: 'use_with_confidence' | 'use_with_caution' | 'monitor_only' | 'stay_out' | 'insufficient'
  note: string
  limitations: string[]
  source: MemoryOrigin
}

/**
 * A "taboo" / historical constraint candidate (e.g. "this club never scores away in
 * knockouts"). Detected honestly — small samples or insufficient H2H NEVER become a
 * taboo; old findings are `outdated`; superstition-shaped findings are flagged.
 */
export type TabooStatus =
  | 'candidate'           // detected, not yet evaluated
  | 'supported'           // enough recent in-context evidence
  | 'weak_sample'         // too few cases to assert
  | 'outdated'            // evidence too old
  | 'contradicted'        // later evidence breaks it
  | 'superstition_risk'   // pattern smells like superstition / overfitting
  | 'not_enough_data'     // effectively no evidence

export interface TabooCandidate {
  id: string
  scopeType: 'team' | 'matchup' | 'competition'
  scopeKey: string
  scopeLabel: string
  contextKey: string
  description: string
  builtAt: string
  sample: SampleQualityAssessment
  supportingCases: number
  contradictingCases: number
  status: TabooStatus
  isUsableConstraint: boolean
  note: string
  limitations: string[]
  source: MemoryOrigin
}

/** A scenario similar to the current fixture — retrieval, NOT prediction. */
export interface SimilarMatchScenario {
  fixtureId: string
  matchedOn: string[]
  similarityScore: number       // 0..1 retrieval similarity, NOT a probability of outcome
  similarityQuality: SampleQuality
  observedOutcome: 'confirmed' | 'confirmed_partial' | 'failed' | 'unknown' | 'not_evaluable' | 'no_alert'
  contextSummary: string
  usefulnessNote: string
  limitations: string[]
}

export interface SimilarScenarioResult {
  fixtureId: string
  scenarios: SimilarMatchScenario[]
  totalConsidered: number
  usableScenarios: number
  note: string
  limitations: string[]
  source: MemoryOrigin
}

/** Audit of a memory build run (manual-first; scheduler off by default). */
export interface MemoryBuildRun {
  id: string
  scope: 'today' | 'fixture' | 'team' | 'matchup' | 'pattern_context' | 'taboos' | 'similar_scenarios'
  targetKey: string | null
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  startedAt: string
  finishedAt: string | null
  teamsBuilt: number
  matchupsBuilt: number
  patternContextsBuilt: number
  taboosEvaluated: number
  notes: string[]
  error: string | null
}

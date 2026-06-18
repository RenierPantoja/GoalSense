/**
 * Signal Explainability — builds the "mental snapshot" of why a signal fired.
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure functions. No persistence, no provider calls. Turns the evaluation
 * context the worker already computed into a structured, honest evidence record:
 * which conditions were evaluated/passed/failed, what data was used and, crucially,
 * what data was MISSING. Never invents live stats or events.
 */
import type { SignalEvidenceSnapshot, DataQuality } from '../contracts/intelligence.types.js'

/** Condition types that only gate WHEN a match is evaluated (eligibility). */
const ELIGIBILITY_TYPES = new Set<string>(['is_live', 'is_pre_live', 'minute_between', 'is_final_phase'])
const CONTEXT_TYPES = new Set<string>(['favorite_involved'])

export function classifyConditionKind(type: string): 'eligibility' | 'context' | 'signal' {
  if (ELIGIBILITY_TYPES.has(type)) return 'eligibility'
  if (CONTEXT_TYPES.has(type)) return 'context'
  return 'signal'
}

/** Flatten a LiveMatchStats-like object to a numeric map, dropping undefined/null. */
export function flattenStats(stats: Record<string, unknown> | null | undefined): Record<string, number> | null {
  if (!stats) return null
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(stats)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
  }
  return Object.keys(out).length > 0 ? out : null
}

export interface EvidenceBuildInput {
  conditionTypes: string[]
  passedConditionTypes: string[]
  failedConditionTypes: string[]
  blockers: string[]
  confidence: number
  momentumSource: string | null
  liveStats: Record<string, number> | null
  score: { home: number; away: number }
  minute: number | null
  recentEvents: Array<{ minute: number; type: string; side?: string }> | null
  scopeReason: string | null
  matchContextReason: string | null
  providerQuality: DataQuality
  missingData: string[]
}

export function buildEvidenceSnapshot(i: EvidenceBuildInput): SignalEvidenceSnapshot {
  const signalConditions = i.conditionTypes.filter(t => classifyConditionKind(t) === 'signal')
  const eligibilityConditions = i.conditionTypes.filter(t => classifyConditionKind(t) === 'eligibility')

  // Confidence breakdown is descriptive only — mirrors the worker's additive model.
  const confidenceBreakdown: Record<string, number> = { total: i.confidence }

  return {
    evaluatedConditions: i.conditionTypes,
    passedConditions: i.passedConditionTypes,
    failedConditions: i.failedConditionTypes,
    signalConditions,
    eligibilityConditions,
    blockers: i.blockers,
    confidenceBreakdown,
    liveStatsUsed: i.liveStats,
    scoreState: i.score,
    minuteState: i.minute,
    recentEvents: i.recentEvents,
    scopeReason: i.scopeReason,
    matchContextReason: i.matchContextReason,
    providerQuality: i.providerQuality,
    missingData: i.missingData,
  }
}

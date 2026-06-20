/**
 * Backtest/Replay evidence identity + fingerprints (Phase B36) — pure.
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic, operational fingerprints (NOT cryptographic security) used to
 * compare a reprocessed result against the original. Never invents data; a patch
 * is only allowed when the comparison matches.
 */
import { createHash } from 'node:crypto'
import type {
  BacktestSignalResult, BacktestResultFingerprint, BacktestTriggerIdentity,
  BacktestOutcomeIdentity, ReplayStepIdentity, ReplayDecisionPoint,
} from '../backtest.types.js'

export const EVALUATION_VERSION = 'b36.1'

function sha(s: string): string { return createHash('sha1').update(s).digest('hex').slice(0, 16) }

export function conditionFingerprint(conditions: any[]): string {
  try {
    const norm = (conditions || []).map(c => ({ t: c?.type, p: c?.params ?? c })).sort((a, b) => String(a.t).localeCompare(String(b.t)))
    return sha(JSON.stringify(norm))
  } catch { return sha('na') }
}

export function buildTriggerIdentity(p: {
  patternId: string; patternName: string; signalType: string | null; conditions: any[]
  triggerMinute: number | null; fixtureId: string; competitionId: string | null; teamContext: string | null
  snapshotId: string | null; snapshotCapturedAt: string | null
}): BacktestTriggerIdentity {
  const condFp = conditionFingerprint(p.conditions)
  const conditionKey = (p.conditions || []).map(c => c?.type).filter(Boolean).join('+') || 'none'
  const evaluationFingerprint = sha([p.patternId, p.fixtureId, p.triggerMinute ?? 'na', condFp, p.snapshotId ?? 'na'].join('|'))
  return {
    patternId: p.patternId, patternName: p.patternName, signalType: p.signalType,
    conditionKey, conditionFingerprint: condFp, triggerMinute: p.triggerMinute, fixtureId: p.fixtureId,
    competitionId: p.competitionId, teamContext: p.teamContext,
    evaluatedAtSnapshotId: p.snapshotId, evaluatedAtSnapshotCapturedAt: p.snapshotCapturedAt,
    evaluationFingerprint,
    limitations: p.snapshotId ? [] : ['trigger_snapshot_id_missing'],
  }
}

export function buildOutcomeIdentity(p: {
  outcomeType: string; windowStartMinute: number | null; windowEndMinute: number | null
  snapshotId: string | null; snapshotCapturedAt: string | null; goals: number; corners: number; cards: number
}): BacktestOutcomeIdentity {
  const outcomeFingerprint = sha([p.outcomeType, p.windowStartMinute ?? 'na', p.windowEndMinute ?? 'na', p.snapshotId ?? 'na', p.goals, p.corners, p.cards].join('|'))
  return {
    outcomeType: p.outcomeType, outcomeWindowStartMinute: p.windowStartMinute, outcomeWindowEndMinute: p.windowEndMinute,
    outcomeSnapshotId: p.snapshotId, outcomeSnapshotCapturedAt: p.snapshotCapturedAt, outcomeFingerprint,
    limitations: p.snapshotId ? [] : ['outcome_snapshot_id_missing'],
  }
}

export function buildResultFingerprint(r: {
  fixtureId: string; patternId: string; triggerMinute: number | null; triggerSnapshotId: string | null
  outcomeStatus: BacktestSignalResult['estimatedOutcome']; outcomeSnapshotId: string | null
  wouldTrigger: boolean; notEvaluableReason: string | null
}): BacktestResultFingerprint {
  const resultStatus = r.wouldTrigger ? 'triggered' : 'no_trigger'
  const hash = sha([r.fixtureId, r.patternId, r.triggerMinute ?? 'na', r.outcomeStatus, resultStatus, EVALUATION_VERSION].join('|'))
  return {
    fixtureId: r.fixtureId, patternId: r.patternId, triggerMinute: r.triggerMinute,
    triggerSnapshotId: r.triggerSnapshotId, outcomeStatus: r.outcomeStatus, outcomeSnapshotId: r.outcomeSnapshotId,
    resultStatus, notEvaluableReason: r.notEvaluableReason, evaluationVersion: EVALUATION_VERSION, hash,
  }
}

export interface CompareResult { match: boolean; mismatches: string[]; canRecoverExact: boolean }

/**
 * Compare an original persisted result with a freshly re-evaluated one. Returns
 * whether a patch is allowed. A patch needs identical fixture/pattern/status and a
 * trigger minute within `toleranceMinutes`, plus a REAL trigger snapshot id derived.
 */
export function compareBacktestResult(
  original: Partial<BacktestSignalResult> & { fixtureId: string; patternId?: string },
  derived: BacktestSignalResult & { patternId?: string },
  toleranceMinutes = 0,
): CompareResult {
  const mismatches: string[] = []
  if (original.fixtureId !== derived.fixtureId) mismatches.push('fixtureId')
  if ((original.patternId ?? null) != null && derived.patternId != null && original.patternId !== derived.patternId) mismatches.push('patternId')
  if (!!original.wouldTrigger !== !!derived.wouldTrigger) mismatches.push('wouldTrigger')
  if ((original.estimatedOutcome ?? 'not_evaluable') !== derived.estimatedOutcome) mismatches.push('estimatedOutcome')
  const om = original.minute ?? null
  const dm = derived.minute ?? null
  if (om != null && dm != null) { if (Math.abs(om - dm) > toleranceMinutes) mismatches.push('triggerMinute') }
  else if (om !== dm) mismatches.push('triggerMinute')
  const canRecoverExact = !!derived.triggerSnapshotId
  return { match: mismatches.length === 0, mismatches, canRecoverExact }
}

/** Build the inline evidence patch from a matched derived result (only fields to set). */
export function buildEvidencePatch(derived: BacktestSignalResult, reprocessRunId: string): Partial<BacktestSignalResult> {
  return {
    triggerSnapshotId: derived.triggerSnapshotId ?? null,
    triggerSnapshotCapturedAt: derived.triggerSnapshotCapturedAt ?? null,
    triggerSnapshotMinute: derived.triggerSnapshotMinute ?? null,
    triggerEvidenceStrength: derived.triggerEvidenceStrength,
    triggerEvidenceLimitations: derived.triggerEvidenceLimitations ?? [],
    outcomeSnapshotId: derived.outcomeSnapshotId ?? null,
    outcomeSnapshotCapturedAt: derived.outcomeSnapshotCapturedAt ?? null,
    outcomeSnapshotMinute: derived.outcomeSnapshotMinute ?? null,
    outcomeEvidenceStrength: derived.outcomeEvidenceStrength,
    outcomeEvidenceLimitations: derived.outcomeEvidenceLimitations ?? [],
    evidenceSummary: derived.evidenceSummary ?? null,
    triggerIdentity: derived.triggerIdentity ?? null,
    outcomeIdentity: derived.outcomeIdentity ?? null,
    resultFingerprint: derived.resultFingerprint ?? null,
    evidenceReprocessStatus: 'patched',
    evidenceReprocessRunId: reprocessRunId,
    evidenceReprocessLimitations: [],
  }
}

export function buildReplayStepIdentity(point: ReplayDecisionPoint, stepIndex: number, fixtureId: string): ReplayStepIdentity {
  const scoreFingerprint = sha([point.score?.home ?? 0, point.score?.away ?? 0, point.status].join('|'))
  const eventFingerprint = sha([point.passedConditions?.join(','), point.missingConditions?.join(','), point.blockers?.join(',')].join('|'))
  const fingerprint = sha([fixtureId, stepIndex, point.minute ?? 'na', scoreFingerprint, eventFingerprint, point.snapshotId ?? 'na'].join('|'))
  return {
    stepIndex, fixtureId, minute: point.minute ?? null, status: point.status,
    scoreFingerprint, eventFingerprint, snapshotId: point.snapshotId ?? null, fingerprint,
    limitations: point.snapshotId ? [] : ['step_snapshot_id_missing'],
  }
}

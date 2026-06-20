/**
 * Evidence Lineage — pure helpers (Phase B33). No I/O, smoke-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic link ids (idempotency), strength normalization, and the
 * protection contribution of a link. HONEST: an inferred link never becomes
 * exact; `unknown` never authorizes a delete.
 */
import { createHash } from 'node:crypto'
import type {
  EvidenceLinkStrength, EvidenceLinkSource, EvidenceSnapshotReference, LinkSnapshotInput,
} from './evidenceLineage.types.js'

/** Deterministic id so the same (target, source, kind) link is written once. */
export function evidenceLinkId(input: LinkSnapshotInput): string {
  const target = input.snapshotId ? `s:${input.snapshotId}` : `f:${input.fixtureId}@${input.minute ?? 'na'}`
  const key = [target, input.source, input.sourceId ?? 'na', input.evidenceKind].join('|')
  const h = createHash('sha1').update(key).digest('hex').slice(0, 16)
  return `esr_${h}`
}

const STRENGTH_RANK: Record<EvidenceLinkStrength, number> = {
  exact: 4, strong_inferred: 3, window_inferred: 2, weak_inferred: 1, unknown: 0,
}

/** Higher rank wins. An exact link must never be downgraded by an inferred one. */
export function strongerLink(a: EvidenceLinkStrength, b: EvidenceLinkStrength): EvidenceLinkStrength {
  return STRENGTH_RANK[a] >= STRENGTH_RANK[b] ? a : b
}

/** A link with no real snapshotId can never be `exact`. Enforced at the boundary. */
export function normalizeLinkStrength(input: LinkSnapshotInput): EvidenceLinkStrength {
  if (input.linkStrength === 'exact' && !input.snapshotId) return 'strong_inferred'
  return input.linkStrength
}

export function isExactLink(ref: { linkStrength: EvidenceLinkStrength; snapshotId: string | null }): boolean {
  return ref.linkStrength === 'exact' && !!ref.snapshotId
}

/** Does this link authorize precise protection (vs falling back to protect-first)? */
export function linkProtects(ref: { linkStrength: EvidenceLinkStrength }): boolean {
  // Any non-unknown link protects; only `unknown` does NOT authorize delete on its
  // own (the protect-first fallback still applies elsewhere).
  return ref.linkStrength !== 'unknown'
}

/** Map a link source to a protection reason string (for the protection index). */
export function sourceToProtectionReason(source: EvidenceLinkSource): string {
  switch (source) {
    case 'signal_ledger':
    case 'alert_outcome':
    case 'failure_analysis':
      return 'linked_to_alert'
    case 'backtest_run':
    case 'backtest_result':
      return 'linked_to_backtest'
    case 'replay_run':
    case 'replay_step':
      return 'linked_to_replay'
    case 'learning_event':
      return 'linked_to_learning'
    case 'promoted_alert':
    case 'auto_opportunity':
    case 'auto_opportunity_outcome':
    case 'auto_alert_policy_evaluation':
      return 'linked_to_promoted_alert'
    case 'manual_feedback':
      return 'manual_protection'
    case 'retention_backfill':
    default:
      return 'unknown_dependency'
  }
}

/** Build a full reference record from an input (id + normalized strength + defaults). */
export function buildReference(input: LinkSnapshotInput, now: string): EvidenceSnapshotReference {
  const linkStrength = normalizeLinkStrength(input)
  return {
    id: evidenceLinkId(input),
    snapshotId: input.snapshotId ?? null,
    fixtureId: input.fixtureId,
    provider: input.provider ?? null,
    capturedAt: input.capturedAt ?? null,
    minute: input.minute ?? null,
    linkStrength,
    source: input.source,
    sourceId: input.sourceId ?? null,
    sourceType: input.sourceType ?? null,
    alertId: input.alertId ?? null,
    patternId: input.patternId ?? null,
    opportunityId: input.opportunityId ?? null,
    backtestRunId: input.backtestRunId ?? null,
    replayRunId: input.replayRunId ?? null,
    learningEventId: input.learningEventId ?? null,
    outcomeId: input.outcomeId ?? null,
    policyEvaluationId: input.policyEvaluationId ?? null,
    reason: input.reason,
    evidenceKind: input.evidenceKind,
    createdAt: now,
    createdBy: input.createdBy ?? null,
    limitations: input.limitations ?? [],
    validationSessionId: input.validationSessionId ?? null,
  }
}

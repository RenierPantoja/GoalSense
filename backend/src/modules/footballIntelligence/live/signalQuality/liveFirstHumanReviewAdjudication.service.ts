/**
 * Live-First Human Review Adjudication — B72
 * ─────────────────────────────────────────────────────────────────────────────
 * Applies CONSERVATIVE adjudications to human review queue items. Observe only:
 * adjudication never changes policy, threshold, score, confidence, or runtime.
 * It only organizes the queue (marks items reviewed) and records a decision.
 *
 * Conservative defaults (small-sample posture):
 *   - duplicate_of_existing_pattern  → real repetition (duplicate cluster).
 *   - insufficient_evidence          → missing critical context / insufficient evidence.
 *   - confirmed_useful_signal        → ONLY when strong evidence AND outcome aligned.
 *   - confirmed_noise                → ONLY when clearly noise (high noise + noisy grade + contradicted).
 *   - needs_more_samples             → default for everything else (e.g. pattern_watch).
 *
 * Reviewer private notes are stored locally and NEVER published to public summaries.
 */
import { createRepositories } from '../../../../repositories/index.js'
import type { HumanReviewItem } from './signalQualityCampaign.types.js'
import type { HumanReviewTriageResult, HumanReviewTriageBucket } from './humanReviewTriage.types.js'
import type {
  HumanReviewAdjudicationDecision,
  HumanReviewAdjudicationRecord,
  HumanReviewAdjudicationSummary,
  AdjudicatedBy,
} from './humanReviewAdjudication.types.js'

interface ParsedEvidence {
  evidence: string
  noise: string
  alignment: string
  grade: string
}

function parseEvidence(summary: string): ParsedEvidence {
  const get = (key: string) => {
    const m = new RegExp(`${key}=([a-z_]+)`, 'i').exec(summary || '')
    return m ? m[1].toLowerCase() : ''
  }
  return { evidence: get('evidence'), noise: get('noise'), alignment: get('alignment'), grade: get('grade') }
}

export interface ConservativeDecision {
  decision: HumanReviewAdjudicationDecision
  rationale: string
  conservativeDefaultApplied: boolean
}

/**
 * Decide a conservative adjudication for an item, optionally using its triage bucket.
 * Pure function — no persistence, no runtime effect.
 */
export function decideConservativeAdjudication(
  item: HumanReviewItem,
  bucket: HumanReviewTriageBucket | null,
): ConservativeDecision {
  const ev = parseEvidence(item.evidenceSummary)
  const reason = (item.reason || '').toLowerCase()
  const hasMissingContext =
    bucket === 'insufficient_data_bucket' ||
    ev.evidence === 'insufficient' ||
    /missing|insufficient/i.test(reason) ||
    item.limitations.some(l => /missing/i.test(l))

  // 1. Real repetition.
  if (bucket === 'duplicate_cluster' || /duplicate/i.test(reason)) {
    return { decision: 'duplicate_of_existing_pattern', rationale: 'Repetition of an existing signal pattern (duplicate cluster).', conservativeDefaultApplied: true }
  }
  // 2. Confirmed useful — ONLY strong evidence AND outcome aligned.
  if (ev.evidence === 'strong' && ev.alignment === 'aligned') {
    return { decision: 'confirmed_useful_signal', rationale: 'Strong evidence with aligned outcome.', conservativeDefaultApplied: false }
  }
  // 3. Insufficient evidence / missing critical context.
  if (hasMissingContext) {
    return { decision: 'insufficient_evidence', rationale: 'Missing critical context; evidence insufficient to judge.', conservativeDefaultApplied: true }
  }
  // 4. Confirmed noise — ONLY clearly noise.
  if (ev.noise === 'high' && ev.grade === 'noisy_monitor_only' && ev.alignment === 'contradicted') {
    return { decision: 'confirmed_noise', rationale: 'High noise, noisy grade, and contradicted outcome — clearly noise.', conservativeDefaultApplied: false }
  }
  // 5. Conservative default.
  return { decision: 'needs_more_samples', rationale: 'Sample still small; defer until more windows accumulate.', conservativeDefaultApplied: true }
}

const EMPTY_BY_DECISION: Record<HumanReviewAdjudicationDecision, number> = {
  needs_more_samples: 0,
  insufficient_evidence: 0,
  duplicate_of_existing_pattern: 0,
  confirmed_noise: 0,
  confirmed_useful_signal: 0,
}

/** Map an adjudication decision to the resulting (non-runtime) queue status. */
function statusForDecision(decision: HumanReviewAdjudicationDecision): HumanReviewItem['status'] {
  if (decision === 'needs_more_samples') return 'needs_more_data'
  if (decision === 'insufficient_evidence') return 'needs_more_data'
  return 'reviewed'
}

export function buildAdjudicationSummary(
  records: HumanReviewAdjudicationRecord[],
  pendingBefore: number,
  pendingAfter: number,
): HumanReviewAdjudicationSummary {
  const byDecision = { ...EMPTY_BY_DECISION }
  for (const r of records) byDecision[r.decision] = (byDecision[r.decision] || 0) + 1
  return {
    id: `hra_${Date.now()}`,
    generatedAt: new Date().toISOString(),
    totalAdjudicated: records.length,
    pendingBefore,
    pendingAfter,
    byDecision,
    needsMoreSamples: byDecision.needs_more_samples,
    insufficientEvidence: byDecision.insufficient_evidence,
    duplicateOfExistingPattern: byDecision.duplicate_of_existing_pattern,
    confirmedNoise: byDecision.confirmed_noise,
    confirmedUsefulSignal: byDecision.confirmed_useful_signal,
    conservativeDefaultsApplied: records.filter(r => r.conservativeDefaultApplied).length,
    reviewerPrivateNotesExposed: false,
    limitations: [
      'Observe only; adjudication never changes policy, threshold, score, confidence, or runtime.',
      'Conservative posture: small sample defaults to needs_more_samples / insufficient_evidence.',
      'Reviewer private notes are stored locally and never published.',
    ],
  }
}

/**
 * Adjudicate a single item explicitly (human decision). Stores a private note locally,
 * marks the item (queue status only), and returns the record. No runtime effect.
 */
export async function adjudicateHumanReviewItem(params: {
  itemId: string
  decision: HumanReviewAdjudicationDecision
  reviewerNotesPrivate?: string | null
  rationale?: string
  adjudicatedBy?: AdjudicatedBy
}): Promise<HumanReviewAdjudicationRecord | null> {
  const repos = createRepositories()
  const items = await repos.intelligence.listHumanReviewItems(2000).catch(() => [])
  const item = items.find(i => i.id === params.itemId)
  if (!item) return null

  const triageResults = await repos.intelligence.listHumanReviewTriageResults(2000).catch(() => [])
  const tr = triageResults.find((t: HumanReviewTriageResult) => t.itemId === item.id)
  const bucket = tr?.bucket ?? null

  const record: HumanReviewAdjudicationRecord = {
    id: `hra_${item.id}_${Date.now()}`,
    itemId: item.id,
    caseId: item.caseId,
    fixtureId: item.fixtureId,
    signalKind: item.signalKind,
    bucket,
    decision: params.decision,
    rationale: (params.rationale || 'Human adjudication.').slice(0, 200),
    reviewerNotesPrivate: params.reviewerNotesPrivate ?? null,
    priorityBefore: item.priority,
    conservativeDefaultApplied: false,
    adjudicatedBy: params.adjudicatedBy ?? 'human',
    runtimeImpact: 'none',
    createdAt: new Date().toISOString(),
  }
  await repos.intelligence.saveHumanReviewAdjudication(record).catch(() => {})
  await repos.intelligence.saveHumanReviewItem({
    ...item,
    status: statusForDecision(params.decision),
    reviewedAt: new Date().toISOString(),
  }).catch(() => {})
  return record
}

/**
 * Apply conservative adjudication to all pending items that require human review.
 * Persists records + summary, marks items (queue status only). No runtime effect.
 */
export async function runConservativeAdjudication(): Promise<HumanReviewAdjudicationSummary> {
  const repos = createRepositories()
  const items = await repos.intelligence.listHumanReviewItems(2000).catch(() => [])
  const triageResults = await repos.intelligence.listHumanReviewTriageResults(2000).catch(() => [])
  const bucketByItem = new Map<string, HumanReviewTriageBucket>()
  for (const t of triageResults) bucketByItem.set(t.itemId, t.bucket)

  const pendingBefore = items.filter(i => i.status === 'pending').length

  // Adjudicate items that the triage marked as requiring human review (or still pending).
  const requiresReview = new Set(triageResults.filter((t: HumanReviewTriageResult) => t.requiresHumanReview).map(t => t.itemId))
  const targets = items.filter(i => i.status === 'pending' && (requiresReview.has(i.id) || requiresReview.size === 0))

  const records: HumanReviewAdjudicationRecord[] = []
  for (const item of targets) {
    const bucket = bucketByItem.get(item.id) ?? null
    const decision = decideConservativeAdjudication(item, bucket)
    const record: HumanReviewAdjudicationRecord = {
      id: `hra_${item.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      itemId: item.id,
      caseId: item.caseId,
      fixtureId: item.fixtureId,
      signalKind: item.signalKind,
      bucket,
      decision: decision.decision,
      rationale: decision.rationale,
      reviewerNotesPrivate: null,
      priorityBefore: item.priority,
      conservativeDefaultApplied: decision.conservativeDefaultApplied,
      adjudicatedBy: 'system_conservative_default',
      runtimeImpact: 'none',
      createdAt: new Date().toISOString(),
    }
    await repos.intelligence.saveHumanReviewAdjudication(record).catch(() => {})
    await repos.intelligence.saveHumanReviewItem({
      ...item,
      status: statusForDecision(decision.decision),
      reviewedAt: new Date().toISOString(),
    }).catch(() => {})
    records.push(record)
  }

  const after = await repos.intelligence.listHumanReviewItems(2000).catch(() => [])
  const pendingAfter = after.filter(i => i.status === 'pending').length

  const summary = buildAdjudicationSummary(records, pendingBefore, pendingAfter)
  await repos.intelligence.saveHumanReviewAdjudicationSummary(summary).catch(() => {})
  return summary
}

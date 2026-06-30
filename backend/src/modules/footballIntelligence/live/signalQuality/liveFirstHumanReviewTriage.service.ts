/**
 * Live-First Human Review Triage — B71
 * ─────────────────────────────────────────────────────────────────────────────
 * Organizes the human review queue into buckets, deduplicates, and prioritizes.
 * Observe only: never deletes original data, never changes policy/threshold/score
 * or classification. Critical cases never disappear — only their bucket changes.
 */
import { createRepositories } from '../../../../repositories/index.js'
import type { HumanReviewItem, HumanReviewPriority } from './signalQualityCampaign.types.js'
import type {
  HumanReviewTriageResult,
  HumanReviewTriageSummary,
  HumanReviewTriageBucket,
  HumanReviewTriageDecision,
  HumanReviewTriageReason,
} from './humanReviewTriage.types.js'

function clusterKey(item: HumanReviewItem): string {
  // Items sharing fixture + signalKind + reason are considered the same pattern.
  return `${item.fixtureId}::${item.signalKind}::${item.reason}`
}

function patternKey(item: HumanReviewItem): string {
  return `${item.signalKind}::${item.reason}`
}

interface TriageClassification {
  bucket: HumanReviewTriageBucket
  decision: HumanReviewTriageDecision
  reason: HumanReviewTriageReason
  priorityAfter: HumanReviewPriority
  requiresHumanReview: boolean
}

function classifyItem(item: HumanReviewItem, isDuplicate: boolean): TriageClassification {
  const reasonText = item.reason.toLowerCase()
  const evidence = (item.evidenceSummary || '').toLowerCase()

  // Duplicate clustering takes precedence for non-critical items.
  const isCritical = item.priority === 'critical' || reasonText.includes('misleading') || reasonText.includes('contradicted')

  if (isCritical) {
    return { bucket: 'critical_review', decision: 'escalate_high_priority', reason: 'strong_contradiction', priorityAfter: 'critical', requiresHumanReview: true }
  }
  if (isDuplicate) {
    return { bucket: 'duplicate_cluster', decision: 'group_as_duplicate', reason: 'duplicate_signal', priorityAfter: 'low', requiresHumanReview: false }
  }
  if (item.priority === 'high') {
    return { bucket: 'high_value_review', decision: 'keep_for_review', reason: 'weak_alert_candidate', priorityAfter: 'high', requiresHumanReview: true }
  }
  if (reasonText.includes('partially aligned') || reasonText.includes('partial')) {
    return { bucket: 'pattern_watch', decision: 'keep_for_review', reason: 'partial_alignment', priorityAfter: 'medium', requiresHumanReview: true }
  }
  if (item.limitations.some(l => /stats|possession|shots|timeline/i.test(l)) || evidence.includes('insufficient')) {
    return { bucket: 'insufficient_data_bucket', decision: 'wait_for_more_data', reason: 'missing_critical_context', priorityAfter: 'low', requiresHumanReview: false }
  }
  if (evidence.includes('alignment=pending') || evidence.includes('alignment=not_evaluable') || reasonText.includes('outcome')) {
    return { bucket: 'pending_outcome', decision: 'wait_for_more_data', reason: 'no_outcome_yet', priorityAfter: 'low', requiresHumanReview: false }
  }
  if (item.signalKind === 'pressure_shift' && evidence.includes('noise=high')) {
    return { bucket: 'low_value_noise', decision: 'downgrade_to_monitor_only', reason: 'single_snapshot_pressure', priorityAfter: 'low', requiresHumanReview: false }
  }
  if (evidence.includes('noise=high')) {
    return { bucket: 'pattern_watch', decision: 'keep_for_review', reason: 'high_noise_risk', priorityAfter: 'medium', requiresHumanReview: false }
  }
  return { bucket: 'monitor_only', decision: 'downgrade_to_monitor_only', reason: 'low_sample', priorityAfter: 'low', requiresHumanReview: false }
}

export function detectDuplicateReviewItems(items: HumanReviewItem[]): Map<string, HumanReviewItem[]> {
  const clusters = new Map<string, HumanReviewItem[]>()
  for (const item of items) {
    const key = clusterKey(item)
    const arr = clusters.get(key) || []
    arr.push(item); clusters.set(key, arr)
  }
  return clusters
}

export function clusterSimilarReviewItems(items: HumanReviewItem[]): Map<string, string> {
  // Returns itemId -> clusterId for items that belong to a multi-member cluster.
  const clusters = detectDuplicateReviewItems(items)
  const itemToCluster = new Map<string, string>()
  let n = 0
  for (const [key, arr] of clusters.entries()) {
    if (arr.length > 1) {
      const clusterId = `cluster_${n++}`
      for (const it of arr) itemToCluster.set(it.id, clusterId)
      void key
    }
  }
  return itemToCluster
}

export function triageHumanReviewQueue(items: HumanReviewItem[]): HumanReviewTriageResult[] {
  const itemToCluster = clusterSimilarReviewItems(items)
  const seenClusterFirst = new Set<string>()
  const results: HumanReviewTriageResult[] = []

  for (const item of items) {
    const clusterId = itemToCluster.get(item.id) || null
    // The first member of a cluster is kept (or escalated if critical); the rest are duplicates.
    let isDuplicate = false
    if (clusterId) {
      if (seenClusterFirst.has(clusterId)) isDuplicate = true
      else seenClusterFirst.add(clusterId)
    }
    const cls = classifyItem(item, isDuplicate)
    results.push({
      itemId: item.id,
      caseId: item.caseId,
      fixtureId: item.fixtureId,
      signalKind: item.signalKind,
      bucket: cls.bucket,
      decision: cls.decision,
      reason: cls.reason,
      priorityBefore: item.priority,
      priorityAfter: cls.priorityAfter,
      clusterId,
      requiresHumanReview: cls.requiresHumanReview,
      suggestedQuestion: item.suggestedReviewQuestion,
      limitations: ['Triage organizes the queue only; no policy/threshold/score/classification change.'],
      createdAt: new Date().toISOString(),
    })
  }
  return results
}

export function prioritizeReviewItems(results: HumanReviewTriageResult[]): HumanReviewTriageResult[] {
  const order: Record<HumanReviewPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  return [...results].sort((a, b) => order[a.priorityAfter] - order[b.priorityAfter])
}

export function downgradeLowValueItems(results: HumanReviewTriageResult[]): HumanReviewTriageResult[] {
  // Already encoded in classify; this is an explicit, auditable pass-through.
  return results
}

export function buildHumanReviewTriageSummary(results: HumanReviewTriageResult[]): HumanReviewTriageSummary {
  const inBucket = (b: HumanReviewTriageBucket) => results.filter(r => r.bucket === b).length
  const reasonCounts = new Map<HumanReviewTriageReason, number>()
  for (const r of results) reasonCounts.set(r.reason, (reasonCounts.get(r.reason) || 0) + 1)
  const topReviewReasons = Array.from(reasonCounts.entries()).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 5)

  const dupPatterns = new Map<string, number>()
  for (const r of results) if (r.clusterId) dupPatterns.set(`${r.signalKind}::${r.reason}`, (dupPatterns.get(`${r.signalKind}::${r.reason}`) || 0) + 1)
  const topDuplicatePatterns = Array.from(dupPatterns.entries()).map(([pattern, count]) => ({ pattern, count })).sort((a, b) => b.count - a.count).slice(0, 5)

  const distinctClusters = new Set(results.filter(r => r.clusterId).map(r => r.clusterId)).size
  const requires = prioritizeReviewItems(results.filter(r => r.requiresHumanReview))

  return {
    id: `hrt_${Date.now()}`,
    generatedAt: new Date().toISOString(),
    totalItems: results.length,
    requiresHumanReview: requires.length,
    monitorOnly: inBucket('monitor_only'),
    duplicateClusters: distinctClusters,
    criticalReview: inBucket('critical_review'),
    highValueReview: inBucket('high_value_review'),
    patternWatch: inBucket('pattern_watch'),
    insufficientDataBucket: inBucket('insufficient_data_bucket'),
    pendingOutcome: inBucket('pending_outcome'),
    lowValueNoise: inBucket('low_value_noise'),
    dismissedLowValue: results.filter(r => r.decision === 'dismiss_low_value').length,
    topReviewReasons,
    topDuplicatePatterns,
    suggestedHumanReviewBatch: requires.slice(0, 10).map(r => ({
      caseId: r.caseId,
      fixtureId: r.fixtureId,
      signalKind: r.signalKind,
      bucket: r.bucket,
      priorityAfter: r.priorityAfter,
      suggestedQuestion: r.suggestedQuestion,
    })),
    limitations: [
      'Observe only; triage never changes runtime, policy, thresholds, score, or classification.',
      'Critical cases never disappear; only their bucket/priority is organized.',
      'Reviewer notes are not included; this is an aggregate triage summary.',
    ],
  }
}

export async function saveHumanReviewTriageRun(): Promise<HumanReviewTriageSummary> {
  const repos = createRepositories()
  const items = await repos.intelligence.listHumanReviewItems(2000).catch(() => [])
  const results = triageHumanReviewQueue(items)
  for (const r of results.slice(0, 500)) await repos.intelligence.saveHumanReviewTriageResult(r).catch(() => {})
  const summary = buildHumanReviewTriageSummary(results)
  await repos.intelligence.saveHumanReviewTriageSummary(summary).catch(() => {})
  return summary
}

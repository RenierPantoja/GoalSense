/**
 * Live-First Human Review Queue — B70
 * ─────────────────────────────────────────────────────────────────────────────
 * Surfaces signal-quality cases that need human judgement before any threshold
 * study. Human review never auto-changes policy. Reviewer notes are not published
 * publicly without sanitization.
 */
import { createRepositories } from '../../../../repositories/index.js'
import type { LiveFirstSignalQualityCase } from './liveFirstSignalQuality.types.js'
import type { HumanReviewItem, HumanReviewPriority } from './signalQualityCampaign.types.js'

function decideReviewReason(c: LiveFirstSignalQualityCase): { reason: string; priority: HumanReviewPriority } | null {
  if (c.qualityGrade === 'misleading_candidate') {
    return { reason: 'Graded misleading_candidate (contradicted with non-trivial evidence).', priority: 'critical' }
  }
  if (c.outcomeAlignment === 'contradicted' && (c.evidenceStrength === 'strong' || c.evidenceStrength === 'moderate')) {
    return { reason: 'Outcome contradicted strong/moderate evidence.', priority: 'high' }
  }
  if (c.noiseRisk === 'high') {
    return { reason: 'High noise risk; verify before trusting.', priority: 'medium' }
  }
  if (c.qualityGrade === 'useful_but_limited' && c.missingEvidence.length > 0) {
    return { reason: 'Useful but limited with missing critical context.', priority: 'medium' }
  }
  if (c.outcomeAlignment === 'partially_aligned') {
    return { reason: 'Partially aligned with outcome; needs human judgement.', priority: 'low' }
  }
  return null
}

function suggestedQuestion(c: LiveFirstSignalQualityCase): string {
  switch (c.signalKind) {
    case 'pressure_shift': return 'Was the pressure real and sustained, or normal match variance?'
    case 'possession_shift': return 'Did possession reflect real control given missing stats?'
    case 'score_shift': return 'Did the score change align with the eventual result?'
    case 'red_card_shift': return 'Did the red card materially change the match?'
    default: return 'Does this signal deserve to remain in observe, or be downgraded to monitor-only?'
  }
}

export function buildHumanReviewItems(cases: LiveFirstSignalQualityCase[]): HumanReviewItem[] {
  const items: HumanReviewItem[] = []
  for (const c of cases) {
    const decision = decideReviewReason(c)
    if (!decision) continue
    items.push({
      id: `hri_${c.id}`,
      caseId: c.id,
      fixtureId: c.fixtureId,
      signalKind: c.signalKind,
      reason: decision.reason,
      priority: decision.priority,
      suggestedReviewQuestion: suggestedQuestion(c),
      evidenceSummary: `evidence=${c.evidenceStrength}, noise=${c.noiseRisk}, alignment=${c.outcomeAlignment}, grade=${c.qualityGrade}`,
      limitations: [
        ...(c.missingEvidence.length ? [`missing: ${c.missingEvidence.slice(0, 3).join('; ')}`] : []),
        'Human review does not auto-change policy/thresholds.',
      ],
      status: 'pending',
      reviewerNotes: null,
      createdAt: new Date().toISOString(),
      reviewedAt: null,
    })
  }
  return items
}

export async function buildAndSaveHumanReviewQueue(): Promise<HumanReviewItem[]> {
  const repos = createRepositories()
  const cases = await repos.intelligence.listLiveFirstSignalQualityCases(500).catch(() => [])
  const items = buildHumanReviewItems(cases)
  for (const item of items.slice(0, 200)) await repos.intelligence.saveHumanReviewItem(item).catch(() => {})
  return items
}

export async function getHumanReviewQueueSize(): Promise<number> {
  const repos = createRepositories()
  const items = await repos.intelligence.listHumanReviewItems(500).catch(() => [])
  return items.filter(i => i.status === 'pending').length
}

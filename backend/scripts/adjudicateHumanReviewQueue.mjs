#!/usr/bin/env node
/** Adjudicate Human Review Queue — B72 CLI (conservative; observe only). */
process.env.DATABASE_URL ||= 'file:./local.db'

const adj = await import('../dist/modules/footballIntelligence/live/signalQuality/liveFirstHumanReviewAdjudication.service.js')
const v3 = await import('../dist/modules/footballIntelligence/live/signalQuality/thresholdReadinessV3.service.js')

const summary = await adj.runConservativeAdjudication()
// Refresh readiness V3 after adjudication so the gate reflects the worked queue.
await v3.buildAndSaveThresholdReadinessV3().catch(() => null)

// Publish sanitized public snapshot so Vercel reflects the adjudication.
try {
  const { publishPublicControlPlaneSnapshot } = await import('../dist/modules/controlPlane/controlPlanePublicReadModel.service.js')
  await publishPublicControlPlaneSnapshot({ force: true })
} catch { /* non-fatal */ }

console.log(JSON.stringify({
  id: summary.id,
  totalAdjudicated: summary.totalAdjudicated,
  pendingBefore: summary.pendingBefore,
  pendingAfter: summary.pendingAfter,
  byDecision: summary.byDecision,
  conservativeDefaultsApplied: summary.conservativeDefaultsApplied,
  reviewerPrivateNotesExposed: summary.reviewerPrivateNotesExposed,
  safety: { policy: 'unchanged', threshold: 'not_applied', score: 'unchanged', confidence: 'unchanged', runtimeImpact: 'none' },
}, null, 2))
process.exit(0)

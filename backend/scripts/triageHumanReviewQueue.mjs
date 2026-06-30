#!/usr/bin/env node
/** Triage Human Review Queue — B71 CLI (observe only; no policy change). */
process.env.DATABASE_URL ||= 'file:./local.db'

const triage = await import('../dist/modules/footballIntelligence/live/signalQuality/liveFirstHumanReviewTriage.service.js')
const summary = await triage.saveHumanReviewTriageRun()

// Publish sanitized public snapshot so Vercel reflects the triage.
try {
  const { publishPublicControlPlaneSnapshot } = await import('../dist/modules/controlPlane/controlPlanePublicReadModel.service.js')
  await publishPublicControlPlaneSnapshot({ force: true })
} catch { /* non-fatal */ }

console.log(JSON.stringify({
  id: summary.id,
  totalItems: summary.totalItems,
  requiresHumanReview: summary.requiresHumanReview,
  monitorOnly: summary.monitorOnly,
  duplicateClusters: summary.duplicateClusters,
  criticalReview: summary.criticalReview,
  highValueReview: summary.highValueReview,
  patternWatch: summary.patternWatch,
  insufficientDataBucket: summary.insufficientDataBucket,
  pendingOutcome: summary.pendingOutcome,
  lowValueNoise: summary.lowValueNoise,
  topReviewReasons: summary.topReviewReasons,
  safety: { policy: 'unchanged', threshold: 'not_applied', calibration: 'not_applied' },
}, null, 2))
process.exit(0)

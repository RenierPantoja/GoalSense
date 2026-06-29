#!/usr/bin/env node
/**
 * Run Live-First Signal Quality Review — B68 CLI
 * Collects recent signals, grades them, saves the review. No calibration applied.
 */
process.env.DATABASE_URL ||= 'file:./local.db'

const review = await import('../dist/modules/footballIntelligence/live/signalQuality/liveFirstSignalQualityReview.service.js')

const summary = await review.saveSignalQualityReview()
console.log(JSON.stringify({
  id: summary.id,
  generatedAt: summary.generatedAt,
  sampleSize: summary.sampleSize,
  reliableObserve: summary.reliableObserve,
  usefulButLimited: summary.usefulButLimited,
  noisyMonitorOnly: summary.noisyMonitorOnly,
  insufficientData: summary.insufficientData,
  misleadingCandidate: summary.misleadingCandidate,
  pendingMoreSample: summary.pendingMoreSample,
  topUsefulSignals: summary.topUsefulSignals,
  topNoisySignals: summary.topNoisySignals,
  recommendations: summary.recommendations,
  safety: { calibration: 'not_applied', odds: 'not_used', enforce: 'off' },
}, null, 2))
process.exit(0)

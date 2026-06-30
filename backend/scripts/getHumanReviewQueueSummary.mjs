#!/usr/bin/env node
/** Get Human Review Queue Summary — B71 CLI (aggregates only; no raw payload). */
process.env.DATABASE_URL ||= 'file:./local.db'

const { createRepositories } = await import('../dist/repositories/index.js')
const repos = createRepositories()
const summary = await repos.intelligence.getLatestHumanReviewTriageSummary().catch(() => null)

if (!summary) { console.log(JSON.stringify({ found: false, message: 'No triage summary yet. Run triageHumanReviewQueue.mjs.' }, null, 2)); process.exit(0) }

console.log(JSON.stringify({
  found: true,
  generatedAt: summary.generatedAt,
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
  topDuplicatePatterns: summary.topDuplicatePatterns,
  suggestedHumanReviewBatch: summary.suggestedHumanReviewBatch,
  limitations: summary.limitations,
}, null, 2))
process.exit(0)

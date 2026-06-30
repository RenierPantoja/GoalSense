#!/usr/bin/env node
/** Get Human Review Adjudication Summary — B72 CLI (aggregates only; no private notes). */
process.env.DATABASE_URL ||= 'file:./local.db'

const { createRepositories } = await import('../dist/repositories/index.js')
const repos = createRepositories()
const summary = await repos.intelligence.getLatestHumanReviewAdjudicationSummary().catch(() => null)
const readinessV3 = await repos.intelligence.getLatestThresholdReadinessV3().catch(() => null)

if (!summary) { console.log(JSON.stringify({ found: false, message: 'No adjudication summary yet. Run adjudicateHumanReviewQueue.mjs.' }, null, 2)); process.exit(0) }

console.log(JSON.stringify({
  found: true,
  generatedAt: summary.generatedAt,
  totalAdjudicated: summary.totalAdjudicated,
  pendingBefore: summary.pendingBefore,
  pendingAfter: summary.pendingAfter,
  byDecision: summary.byDecision,
  conservativeDefaultsApplied: summary.conservativeDefaultsApplied,
  reviewerPrivateNotesExposed: summary.reviewerPrivateNotesExposed,
  thresholdReadinessV3: readinessV3 ? { readiness: readinessV3.readiness, reason: readinessV3.reason, sampleSize: readinessV3.sampleSize, reviewQueuePending: readinessV3.reviewQueuePending, changesRuntime: readinessV3.changesRuntime } : null,
  limitations: summary.limitations,
}, null, 2))
process.exit(0)

#!/usr/bin/env node
/**
 * Get Live-First Signal Quality Summary — B68 CLI
 * Shows the latest persisted review. No secrets, no raw payloads.
 */
process.env.DATABASE_URL ||= 'file:./local.db'

const { createRepositories } = await import('../dist/repositories/index.js')
const repos = createRepositories()
const summary = await repos.intelligence.getLatestLiveFirstSignalQualityReview().catch(() => null)

if (!summary) {
  console.log(JSON.stringify({ found: false, message: 'No signal quality review yet. Run runLiveFirstSignalQualityReview.mjs.' }, null, 2))
  process.exit(0)
}

console.log(JSON.stringify({
  found: true,
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
  governanceQualityFeedback: summary.governanceQualityFeedback,
  recommendations: summary.recommendations,
  limitations: summary.limitations,
}, null, 2))
process.exit(0)

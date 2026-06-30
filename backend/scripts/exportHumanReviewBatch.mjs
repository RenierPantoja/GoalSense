#!/usr/bin/env node
/** Export a small human review batch — B71 CLI. No raw snapshot / odds / token / reviewer notes. */
process.env.DATABASE_URL ||= 'file:./local.db'

function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback }
const limit = Number(arg('--limit', '10'))

const { createRepositories } = await import('../dist/repositories/index.js')
const repos = createRepositories()
const triage = await repos.intelligence.listHumanReviewTriageResults(500).catch(() => [])
const items = await repos.intelligence.listHumanReviewItems(2000).catch(() => [])
const itemById = new Map(items.map(i => [i.caseId, i]))

const batch = triage
  .filter(r => r.requiresHumanReview)
  .sort((a, b) => ({ critical: 0, high: 1, medium: 2, low: 3 }[a.priorityAfter] - { critical: 0, high: 1, medium: 2, low: 3 }[b.priorityAfter]))
  .slice(0, limit)
  .map(r => {
    const it = itemById.get(r.caseId)
    return {
      caseId: r.caseId,
      signalKind: r.signalKind,
      bucket: r.bucket,
      priority: r.priorityAfter,
      reason: r.reason,
      evidenceStrength: it ? (it.evidenceSummary.match(/evidence=(\w+)/)?.[1] ?? 'unknown') : 'unknown',
      noiseRisk: it ? (it.evidenceSummary.match(/noise=(\w+)/)?.[1] ?? 'unknown') : 'unknown',
      qualityGrade: it ? (it.evidenceSummary.match(/grade=(\w+)/)?.[1] ?? 'unknown') : 'unknown',
      suggestedQuestion: r.suggestedQuestion,
      limitations: r.limitations,
    }
  })

console.log(JSON.stringify({ batchSize: batch.length, observeOnly: true, items: batch }, null, 2))
process.exit(0)

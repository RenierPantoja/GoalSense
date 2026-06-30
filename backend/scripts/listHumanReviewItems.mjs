#!/usr/bin/env node
/** List Human Review Items — B72 CLI (observe only; NO reviewer notes printed). */
process.env.DATABASE_URL ||= 'file:./local.db'

function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback }
const onlyRequires = process.argv.includes('--requires-review')
const status = arg('--status', null)

const { createRepositories } = await import('../dist/repositories/index.js')
const repos = createRepositories()
const items = await repos.intelligence.listHumanReviewItems(2000).catch(() => [])
const triage = await repos.intelligence.listHumanReviewTriageResults(2000).catch(() => [])
const bucketByItem = new Map(triage.map(t => [t.itemId, t.bucket]))
const requiresByItem = new Map(triage.map(t => [t.itemId, t.requiresHumanReview]))

let rows = items.map(i => ({
  itemId: i.id,
  caseId: i.caseId,
  fixtureId: i.fixtureId,
  signalKind: i.signalKind,
  priority: i.priority,
  status: i.status,
  bucket: bucketByItem.get(i.id) ?? null,
  requiresHumanReview: requiresByItem.get(i.id) ?? false,
  reason: String(i.reason || '').slice(0, 120),
  evidenceSummary: i.evidenceSummary,
  suggestedReviewQuestion: i.suggestedReviewQuestion,
  // reviewerNotes intentionally omitted — private, never printed.
}))

if (onlyRequires) rows = rows.filter(r => r.requiresHumanReview)
if (status) rows = rows.filter(r => r.status === status)

console.log(JSON.stringify({
  total: items.length,
  shown: rows.length,
  reviewerNotesPrinted: false,
  items: rows,
}, null, 2))
process.exit(0)

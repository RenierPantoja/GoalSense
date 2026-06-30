#!/usr/bin/env node
/** Adjudicate a single Human Review Item — B72 CLI (observe only).
 *  Usage: node scripts/adjudicateHumanReviewItem.mjs --item <itemId> --decision <decision> [--note "private note"] [--rationale "..."]
 *  decision ∈ needs_more_samples | insufficient_evidence | duplicate_of_existing_pattern | confirmed_noise | confirmed_useful_signal
 */
process.env.DATABASE_URL ||= 'file:./local.db'

function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback }
const itemId = arg('--item', null)
const decision = arg('--decision', null)
const note = arg('--note', null)
const rationale = arg('--rationale', null)

const VALID = ['needs_more_samples', 'insufficient_evidence', 'duplicate_of_existing_pattern', 'confirmed_noise', 'confirmed_useful_signal']
if (!itemId || !decision || !VALID.includes(decision)) {
  console.error(JSON.stringify({ error: 'usage', message: '--item <id> --decision <decision>', validDecisions: VALID }, null, 2))
  process.exit(1)
}

const adj = await import('../dist/modules/footballIntelligence/live/signalQuality/liveFirstHumanReviewAdjudication.service.js')
const v3 = await import('../dist/modules/footballIntelligence/live/signalQuality/thresholdReadinessV3.service.js')

const record = await adj.adjudicateHumanReviewItem({ itemId, decision, reviewerNotesPrivate: note, rationale, adjudicatedBy: 'human' })
if (!record) { console.error(JSON.stringify({ error: 'not_found', itemId }, null, 2)); process.exit(1) }
await v3.buildAndSaveThresholdReadinessV3().catch(() => null)

try {
  const { publishPublicControlPlaneSnapshot } = await import('../dist/modules/controlPlane/controlPlanePublicReadModel.service.js')
  await publishPublicControlPlaneSnapshot({ force: true })
} catch { /* non-fatal */ }

console.log(JSON.stringify({
  adjudicated: true,
  itemId: record.itemId,
  decision: record.decision,
  rationale: record.rationale,
  privateNoteStored: record.reviewerNotesPrivate !== null,
  privateNotePublished: false,
  runtimeImpact: record.runtimeImpact,
}, null, 2))
process.exit(0)

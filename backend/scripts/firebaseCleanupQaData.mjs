/**
 * Firebase QA Data Cleanup (Phase E7) — SAFE BY DEFAULT (dry-run).
 * ─────────────────────────────────────────────────────────────────────────────
 * Removes documents created during runtime QA, identified by CONSERVATIVE
 * markers only. Never deletes anything unless --confirm is passed.
 *
 * Usage:
 *   node scripts/firebaseCleanupQaData.mjs            # dry-run (default): counts only
 *   node scripts/firebaseCleanupQaData.mjs --dry-run  # explicit dry-run
 *   node scripts/firebaseCleanupQaData.mjs --confirm  # actually delete the matched docs
 *
 * QA markers (intentionally narrow to avoid touching real data):
 *   patterns           → name contains "QA", "E61", or "E62"
 *   alerts             → duplicateSignature starts with "qa-" or "e62-", or fixtureId starts with "qa-"/"e62-"
 *   alertResolutions   → alertId belongs to a matched QA alert
 *   telegramChannels   → name === "QA Channel"
 *   signalDeliveries   → alertId belongs to a matched QA alert
 *   performanceCounters/processed → patternId belongs to a matched QA pattern
 *
 * Fixtures/liveSnapshots/providerHealth from the live worker are REAL provider
 * data (ESPN) and are NOT deleted by this script.
 */
import { getFirestore, parseFlags } from './_firebase.mjs'

const flags = parseFlags(process.argv)

function isQaPatternName(name) {
  const n = (name || '').toLowerCase()
  return n.includes('qa') || n.includes('e61') || n.includes('e62')
}
function isQaSignature(sig) {
  const s = (sig || '')
  return s.startsWith('qa-') || s.startsWith('e62-')
}
function isQaFixtureId(fid) {
  const f = (fid || '')
  return f.startsWith('qa-') || f.startsWith('e62-')
}

async function main() {
  const db = await getFirestore()
  console.log(`\n=== Firebase QA Cleanup (${flags.confirm ? 'CONFIRM — will delete' : 'DRY-RUN — no deletes'}) ===\n`)

  const toDelete = { patterns: [], alerts: [], alertResolutions: [], telegramChannels: [], signalDeliveries: [], patternPerformanceCounters: [], performanceCounterProcessed: [] }

  // Patterns
  const patternsSnap = await db.collection('patterns').get()
  const qaPatternIds = new Set()
  patternsSnap.forEach(d => { if (isQaPatternName(d.data()?.name)) { toDelete.patterns.push(d.id); qaPatternIds.add(d.id) } })

  // Alerts (QA by signature/fixture, OR belonging to a QA pattern)
  const alertsSnap = await db.collection('alerts').get()
  const qaAlertIds = new Set()
  alertsSnap.forEach(d => {
    const a = d.data() || {}
    if (isQaSignature(a.duplicateSignature) || isQaFixtureId(a.fixtureId) || qaPatternIds.has(a.patternId)) {
      toDelete.alerts.push(d.id); qaAlertIds.add(d.id)
    }
  })

  // Alert resolutions (deterministic id = alertId)
  const resSnap = await db.collection('alertResolutions').get()
  resSnap.forEach(d => { if (qaAlertIds.has(d.data()?.alertId) || qaAlertIds.has(d.id)) toDelete.alertResolutions.push(d.id) })

  // Telegram channels named "QA Channel"
  const chSnap = await db.collection('telegramChannels').get()
  const qaChannelIds = new Set()
  chSnap.forEach(d => { if ((d.data()?.name || '') === 'QA Channel') { toDelete.telegramChannels.push(d.id); qaChannelIds.add(d.id) } })

  // Signal deliveries for QA alerts/channels
  const delSnap = await db.collection('signalDeliveries').get()
  delSnap.forEach(d => { const x = d.data() || {}; if (qaAlertIds.has(x.alertId) || qaChannelIds.has(x.channelId)) toDelete.signalDeliveries.push(d.id) })

  // Performance counters + processed markers for QA patterns/alerts
  const counterSnap = await db.collection('patternPerformanceCounters').get()
  counterSnap.forEach(d => { if (qaPatternIds.has(d.id) || qaPatternIds.has(d.data()?.patternId)) toDelete.patternPerformanceCounters.push(d.id) })
  const procSnap = await db.collection('performanceCounterProcessed').get()
  procSnap.forEach(d => { const x = d.data() || {}; if (qaAlertIds.has(x.alertId) || qaAlertIds.has(d.id) || qaPatternIds.has(x.patternId)) toDelete.performanceCounterProcessed.push(d.id) })

  // Report
  let total = 0
  for (const [col, ids] of Object.entries(toDelete)) {
    console.log(`  ${col}: ${ids.length} matched`)
    total += ids.length
  }
  console.log(`\n  TOTAL matched: ${total}`)

  if (!flags.confirm) {
    console.log('\nDry-run only. Re-run with --confirm to delete the matched documents.\n')
    return
  }

  console.log('\nDeleting...')
  for (const [col, ids] of Object.entries(toDelete)) {
    let batch = db.batch(); let n = 0
    for (const id of ids) {
      batch.delete(db.collection(col).doc(id))
      if (++n % 400 === 0) { await batch.commit(); batch = db.batch() }
    }
    if (n % 400 !== 0 || ids.length === 0) { if (ids.length) await batch.commit() }
    if (ids.length) console.log(`  deleted ${ids.length} from ${col}`)
  }
  console.log('\nCleanup complete.\n')
}

main().catch(err => { console.error('Cleanup failed:', err.message); process.exit(1) })

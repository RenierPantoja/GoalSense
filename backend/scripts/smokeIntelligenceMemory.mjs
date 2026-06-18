/**
 * Smoke test — Football Intelligence Memory (Phase B12).
 * ─────────────────────────────────────────────────────────────────────────────
 * DEFAULT (no flags): PURE. Imports the compiled builders from dist/ and asserts
 * they produce valid shapes. Touches NO network, NO Firestore, creates NO alerts.
 *
 * WITH --confirm: writes a single namespaced test doc to signalLedger
 * (id: led___smoke_test), reads it back, then DELETES it. Never creates alerts,
 * never touches production data. Requires Firebase creds in backend/.env.
 *
 * Usage:
 *   node scripts/smokeIntelligenceMemory.mjs            # pure shape validation
 *   node scripts/smokeIntelligenceMemory.mjs --confirm  # + Firestore round-trip
 *
 * Build first: npm run build
 */
import 'dotenv/config'

const confirm = process.argv.slice(2).includes('--confirm')

function assert(cond, msg) {
  if (!cond) { console.error(`  ✗ ${msg}`); process.exitCode = 1 }
  else console.log(`  ✓ ${msg}`)
}

async function loadBuilders() {
  try {
    const ledger = await import('../dist/modules/intelligence/memory/signalLedger.service.js')
    const explain = await import('../dist/modules/intelligence/explainability/signalExplainability.service.js')
    const learning = await import('../dist/modules/intelligence/learning/learningEvent.service.js')
    const avail = await import('../dist/modules/intelligence/utils/dataAvailability.util.js')
    const ids = await import('../dist/modules/intelligence/utils/intelligenceId.util.js')
    return { ledger, explain, learning, avail, ids }
  } catch (e) {
    console.error('Could not import dist builders. Run `npm run build` first.')
    console.error(e?.message || e)
    process.exit(1)
  }
}

async function pureChecks() {
  console.log('[smoke] Pure builder validation (no network):')
  const { ledger, explain, learning, avail, ids } = await loadBuilders()

  const availability = avail.buildLiveAvailabilityMap({ provider: 'espn', dataQuality: 'partial', stats: { shotsHome: 4 }, events: [] })
  assert(availability.liveStats.available === true, 'liveStats marked available when stats present')
  assert(availability.xg.available === false && availability.xg.unavailableReason === 'provider_not_supported', 'xG marked unavailable with reason')
  const missing = avail.collectMissingData(availability)
  assert(Array.isArray(missing) && missing.includes('xg'), 'missing data list includes xg')

  const evidence = explain.buildEvidenceSnapshot({
    conditionTypes: ['is_live', 'shots_on_target_gte'], passedConditionTypes: ['is_live'], failedConditionTypes: ['shots_on_target_gte'],
    blockers: [], confidence: 72, momentumSource: 'timed_events', liveStats: { shotsOnTargetHome: 3 }, score: { home: 1, away: 1 },
    minute: 67, recentEvents: [{ minute: 65, type: 'shot_on_target', side: 'home' }], scopeReason: 'Escopo: todas as partidas',
    matchContextReason: 'Final — partida decisiva', providerQuality: 'partial', missingData: missing,
  })
  assert(evidence.signalConditions.includes('shots_on_target_gte'), 'evidence classifies signal condition')
  assert(evidence.eligibilityConditions.includes('is_live'), 'evidence classifies eligibility condition')

  const entry = ledger.buildLedgerEntry({
    alertId: 'smoke_test', patternId: 'p1', userId: 'default', radarName: 'Smoke Radar',
    fixtureId: 'fx1', fixtureLabel: 'A vs B', leagueName: 'Liga', homeTeam: 'A', awayTeam: 'B',
    minute: 67, score: { home: 1, away: 1 }, signalStatus: 'alerted', signalType: 'shots_on_target_gte',
    confidence: 72, severity: 'attention', evidence, scopeReason: 'Escopo: todas as partidas',
    matchContext: { competitionType: 'cup', stage: 'final', isKnockout: true, importance: 100, importanceLabel: 'decisiva' },
    dataAvailability: availability,
  })
  assert(entry.id === ids.ledgerId({ alertId: 'smoke_test', fixtureId: 'fx1', patternId: 'p1', minute: 67 }), 'ledger id is deterministic')
  assert(entry.signalStatus === 'alerted', 'ledger status alerted')

  const failure = learning.buildFailureAnalysis({ alertId: 'smoke_test', fixtureId: 'fx1', patternId: 'p1', hasStats: false, hasTimedEvents: false, snapshotsAnalyzed: 0, dataQualityAtResolution: 'poor', momentumSource: null, dataWarnings: [] })
  assert(failure.failureReason === 'missing_required_data', 'failure analysis = missing_required_data when no data/snapshots')
  assert(failure.confidenceInDiagnosis === 'medium', 'failure diagnosis confidence is conservative')

  assert(learning.learningTypeForResult('unknown') === 'alert_unknown', 'unknown maps to alert_unknown (never failed)')

  return entry
}

async function firestoreRoundTrip(entry) {
  console.log('[smoke] Firestore round-trip (--confirm):')
  const { getFirestore } = await import('./_firebase.mjs')
  const db = await getFirestore()
  const id = 'led___smoke_test'
  const ref = db.collection('signalLedger').doc(id)
  await ref.set({ ...entry, id }, { merge: true })
  const got = await ref.get()
  assert(got.exists, 'wrote and read back the smoke ledger doc')
  await ref.delete()
  const after = await ref.get()
  assert(!after.exists, 'deleted the smoke ledger doc (no residue)')
}

const entry = await pureChecks()
if (confirm) {
  await firestoreRoundTrip(entry)
} else {
  console.log('[smoke] Skipped Firestore round-trip (run with --confirm to enable).')
}
console.log(process.exitCode ? '[smoke] FAILED' : '[smoke] OK')

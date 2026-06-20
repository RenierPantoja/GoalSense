/**
 * Backfill Evidence Lineage (Phase B33) — conservative, dry-run default.
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads existing Signal Ledger entries and Alert Outcomes and creates INFERRED
 * evidence links (by fixture/window) for history that predates B33. It NEVER
 * invents a snapshotId (so it never creates `exact` links — those only come from
 * the live backtest/replay engines), NEVER deletes, and NEVER mutates source data.
 *
 * Persisting requires BOTH `--persist` AND env ENABLE_EVIDENCE_LINEAGE_BACKFILL=true.
 *
 * Usage:
 *   node scripts/backfillEvidenceLineage.mjs                 # dry-run
 *   node scripts/backfillEvidenceLineage.mjs --persist       # writes (needs env flag)
 *   node scripts/backfillEvidenceLineage.mjs --limit 200 --fixture <id>
 *   node scripts/backfillEvidenceLineage.mjs --from 2026-01-01 --to 2026-02-01
 *
 * Build first: npm run build
 */
const args = process.argv.slice(2)
function arg(name, def = null) { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def }
const PERSIST = args.includes('--persist')
const LIMIT = parseInt(arg('limit', '500')) || 500
const FIXTURE = arg('fixture', null)
const FROM = arg('from', null)
const TO = arg('to', null)

async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const { env } = await load('../dist/env.js')
const { createRepositories } = await load('../dist/repositories/index.js')
const lineage = await load('../dist/modules/intelligence/evidence/evidenceLineage.service.js')

const flagOn = String(env.ENABLE_EVIDENCE_LINEAGE_BACKFILL).toLowerCase() === 'true'
const willWrite = PERSIST && flagOn

const report = { mode: willWrite ? 'persist' : 'dry_run', exactFromStoredSnapshotId: 0, inferredWindow: 0, unknown: 0, skipped: 0, limitations: [] }
if (PERSIST && !flagOn) report.limitations.push('--persist ignorado: ENABLE_EVIDENCE_LINEAGE_BACKFILL!=true (dry-run forçado).')

function inWindow(iso) {
  if (!FROM && !TO) return true
  const t = iso ? new Date(iso).getTime() : NaN
  if (!Number.isFinite(t)) return true
  if (FROM && t < new Date(FROM).getTime()) return false
  if (TO && t > new Date(TO).getTime()) return false
  return true
}

const repos = createRepositories()
const inputs = []

// 1) Signal Ledger entries → trigger_state window_inferred links.
let ledger = []
try { ledger = await repos.intelligence.listAllSignalLedgerEntries(LIMIT) } catch (e) { report.limitations.push(`Ledger read failed: ${String(e?.message || e).slice(0, 60)}`) }
for (const l of ledger) {
  if (FIXTURE && l.fixtureId !== FIXTURE) { report.skipped++; continue }
  if (!inWindow(l.createdAt)) { report.skipped++; continue }
  if (!l.fixtureId) { report.unknown++; continue }
  // B34: use the stored triggerSnapshotId for an EXACT link when present.
  const snapId = l.triggerSnapshotId ?? null
  inputs.push({
    snapshotId: snapId, fixtureId: l.fixtureId, minute: l.minute ?? null,
    capturedAt: l.triggerSnapshotCapturedAt ?? null,
    linkStrength: snapId ? 'exact' : 'window_inferred',
    source: 'signal_ledger', sourceId: l.id, sourceType: 'SignalLedgerEntry',
    alertId: l.alertId ?? null, patternId: l.patternId ?? null, evidenceKind: 'trigger_state',
    reason: snapId ? 'Backfill: snapshotId exato armazenado no ledger.' : 'Backfill: ledger histórico sem snapshotId — vínculo por fixture/janela.',
    createdBy: 'backfill', limitations: snapId ? [] : ['snapshot_not_written'],
  })
  if (snapId) report.exactFromStoredSnapshotId++; else report.inferredWindow++
}

// 2) Alert Outcomes → outcome_state window_inferred links.
let outcomes = []
try { outcomes = await repos.intelligence.listAllAlertOutcomes(LIMIT) } catch (e) { report.limitations.push(`Outcomes read failed: ${String(e?.message || e).slice(0, 60)}`) }
for (const o of outcomes) {
  if (FIXTURE && o.fixtureId !== FIXTURE) { report.skipped++; continue }
  if (!inWindow(o.createdAt)) { report.skipped++; continue }
  if (!o.fixtureId) { report.unknown++; continue }
  const snapId = o.outcomeSnapshotId ?? null
  inputs.push({
    snapshotId: snapId, fixtureId: o.fixtureId, minute: o.resolutionMinute ?? null,
    capturedAt: o.outcomeSnapshotCapturedAt ?? null,
    linkStrength: snapId ? 'exact' : 'window_inferred',
    source: 'alert_outcome', sourceId: o.id, sourceType: 'AlertOutcomeRecord',
    alertId: o.alertId ?? null, patternId: o.patternId ?? null, outcomeId: o.id, evidenceKind: 'outcome_state',
    reason: snapId ? 'Backfill: snapshotId exato armazenado no outcome.' : 'Backfill: outcome histórico sem snapshotId — vínculo por fixture/janela.',
    createdBy: 'backfill', limitations: snapId ? [] : ['snapshot_not_written'],
  })
  if (snapId) report.exactFromStoredSnapshotId++; else report.inferredWindow++
}

report.limitations.push('Backfill cria exact apenas quando há triggerSnapshotId/outcomeSnapshotId armazenado (B34); caso contrário, window_inferred.')
report.limitations.push('Nenhum dado original foi alterado ou apagado.')

if (willWrite && inputs.length > 0) {
  const res = await lineage.linkSnapshotsToSource(inputs)
  report.persistedCreated = res.created
} else {
  report.persistedCreated = 0
}

console.log(JSON.stringify(report, null, 2))
console.log(willWrite ? '[backfill] PERSISTED' : '[backfill] DRY-RUN (no writes)')
process.exit(0)

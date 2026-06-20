/**
 * Reindex Live Validation Session Records (Phase B39) — dry-run default.
 * ─────────────────────────────────────────────────────────────────────────────
 * Rebuilds the auxiliary session→record index for an existing session by reading
 * records that ALREADY carry validationSessionId === sessionId and creating exact
 * links for them. It NEVER invents an exact link for a record that lacked the
 * session id (those remain inferred, surfaced by the report, never persisted as
 * exact). Persist is gated by ENABLE_LIVE_VALIDATION_SESSION_REINDEX=true.
 *
 * Usage:
 *   node scripts/reindexLiveValidationSessionRecords.mjs --sessionId <id>
 *   node scripts/reindexLiveValidationSessionRecords.mjs --sessionId <id> --persist
 *   node scripts/reindexLiveValidationSessionRecords.mjs --sessionId <id> --persist --limit 500
 *
 * Build first: npm run build
 */
const args = process.argv.slice(2)
function arg(name, def = null) { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def }
const PERSIST = args.includes('--persist')
const SESSION_ID = arg('sessionId', null)
const LIMIT = parseInt(arg('limit', '1000')) || 1000

async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }
if (!SESSION_ID) { console.error('Missing --sessionId'); process.exit(1) }

const { env } = await load('../dist/env.js')
const linked = await load('../dist/modules/validation/liveValidationLinkedRecords.service.js')
const index = await load('../dist/modules/validation/liveValidationRecordIndex.service.js')

const flagOn = String(env.ENABLE_LIVE_VALIDATION_SESSION_REINDEX).toLowerCase() === 'true'
const willWrite = PERSIST && flagOn

const data = await linked.listLinkedRecords(SESSION_ID)
const existing = await index.listSessionLinkedRecordsIndexed(SESSION_ID, 5000).catch(() => [])
const existingIds = new Set(existing.map(l => l.recordId))

const limitations = []
const toLink = []
let inferredLinksPlanned = 0, duplicates = 0, skipped = 0

const groups = [
  { type: 'alert', rows: data.alerts },
  { type: 'auto_opportunity', rows: data.opportunities },
  { type: 'evidence_reference', rows: data.evidence },
  { type: 'outcome', rows: data.outcomes },
]
for (const g of groups) {
  for (const r of g.rows.slice(0, LIMIT)) {
    if (r.attributionStrength !== 'exact_session_id') { inferredLinksPlanned++; continue } // never persist inferred as exact
    if (existingIds.has(r.id)) { duplicates++; continue }
    toLink.push({ validationSessionId: SESSION_ID, recordType: g.type, recordId: r.id, fixtureId: r.fixtureId, source: 'reindex', attributionStrength: 'exact_session_id', linkReason: 'reindexed from record carrying validationSessionId' })
  }
}

let exactLinksCreated = 0
if (willWrite && toLink.length > 0) {
  const res = await index.linkRecordsToSessionBatch(toLink).catch(() => ({ created: 0 }))
  exactLinksCreated = res.created
  if (exactLinksCreated < toLink.length) limitations.push(`Persistência parcial: ${exactLinksCreated}/${toLink.length} (adapter Noop não persiste — use Firebase).`)
} else {
  skipped = toLink.length
}

if (PERSIST && !flagOn) limitations.push('--persist ignorado: ENABLE_LIVE_VALIDATION_SESSION_REINDEX!=true (dry-run forçado).')
limitations.push('Reindex só cria links EXATOS de registros que já carregavam validationSessionId; inferidos nunca viram exatos.')

const report = {
  mode: willWrite ? 'persist' : 'dry_run',
  sessionId: SESSION_ID,
  recordsScanned: data.alerts.length + data.opportunities.length + data.evidence.length + data.outcomes.length,
  exactLinksPlanned: toLink.length,
  exactLinksCreated,
  inferredLinksPlanned,
  duplicates,
  skipped,
  limitations,
}
console.log(JSON.stringify(report, null, 2))
console.log(willWrite ? '[reindex] PERSIST' : '[reindex] DRY-RUN')
process.exit(0)

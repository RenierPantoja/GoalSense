/**
 * Backfill Live Validation Session Attribution (Phase B38) — dry-run default.
 * ─────────────────────────────────────────────────────────────────────────────
 * For an existing session, reports how its fixtures' records would group
 * (exact_session_id vs inferred_fixture_window). It NEVER marks a record as exact
 * when it had no original validationSessionId, NEVER alters results/calculations,
 * and persist is gated by ENABLE_LIVE_VALIDATION_SESSION_ATTRIBUTION_BACKFILL=true.
 *
 * Usage:
 *   node scripts/backfillLiveValidationSessionAttribution.mjs --sessionId <id>
 *   node scripts/backfillLiveValidationSessionAttribution.mjs --sessionId <id> --persist
 *
 * Build first: npm run build
 */
const args = process.argv.slice(2)
function arg(name, def = null) { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def }
const PERSIST = args.includes('--persist')
const SESSION_ID = arg('sessionId', null)
const LIMIT = parseInt(arg('limit', '200')) || 200

async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }
if (!SESSION_ID) { console.error('Missing --sessionId'); process.exit(1) }

const { env } = await load('../dist/env.js')
const linked = await load('../dist/modules/validation/liveValidationLinkedRecords.service.js')

const flagOn = String(env.ENABLE_LIVE_VALIDATION_SESSION_ATTRIBUTION_BACKFILL).toLowerCase() === 'true'
const willWrite = PERSIST && flagOn

const data = await linked.listLinkedRecords(SESSION_ID)
const all = [...data.alerts, ...data.opportunities, ...data.evidence].slice(0, LIMIT)
const report = {
  mode: willWrite ? 'persist' : 'dry_run',
  recordsScanned: all.length,
  exactAlreadyLinked: all.filter(r => r.attributionStrength === 'exact_session_id').length,
  inferredCandidates: all.filter(r => r.attributionStrength === 'inferred_fixture_window').length,
  patchedInferred: 0,
  skipped: 0,
  limitations: [],
}
if (PERSIST && !flagOn) report.limitations.push('--persist ignorado: ENABLE_LIVE_VALIDATION_SESSION_ATTRIBUTION_BACKFILL!=true (dry-run forçado).')
// Conservative: we do NOT write inferred sessionId onto historical records (would
// blur exact vs inferred). The session report already shows inferred grouping.
report.limitations.push('Backfill não grava sessionId inferido em registros antigos (mantém exact vs inferred honesto).')
report.limitations.push('Use a sessão para agrupar por fixture/janela; atribuição exata só ocorre em registros criados durante a sessão.')

console.log(JSON.stringify(report, null, 2))
console.log(willWrite ? '[backfill] PERSIST solicitado (apenas relatório; nenhuma escrita inferida)' : '[backfill] DRY-RUN')
process.exit(0)

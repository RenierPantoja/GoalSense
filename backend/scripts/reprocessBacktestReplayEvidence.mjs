/**
 * Reprocess Backtest/Replay Evidence (Phase B36) — dry-run default.
 * ─────────────────────────────────────────────────────────────────────────────
 * Recovers inline snapshot evidence for old runs by re-evaluating against the same
 * persisted snapshots and patching ONLY when the reprocessed result matches the
 * original. Never changes a result/outcome; never invents a snapshotId.
 *
 * Patching requires BOTH `--persist` (mode patch_inline) AND env
 * ENABLE_BACKTEST_REPLAY_EVIDENCE_REPROCESS_PATCH=true.
 *
 * Usage:
 *   node scripts/reprocessBacktestReplayEvidence.mjs --runId <id> --type backtest
 *   node scripts/reprocessBacktestReplayEvidence.mjs --runId <id> --type replay
 *   node scripts/reprocessBacktestReplayEvidence.mjs --runId <id> --type both --persist --tolerance-minutes 1
 *
 * Build first: npm run build
 */
const args = process.argv.slice(2)
function arg(name, def = null) { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def }
const PERSIST = args.includes('--persist')
const RUN_ID = arg('runId', null)
const TYPE = arg('type', 'both')
const TOL = parseInt(arg('tolerance-minutes', '0')) || 0

async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

if (!RUN_ID) { console.error('Missing --runId'); process.exit(1) }

const svc = await load('../dist/modules/intelligence/backtest/backtestReplayEvidenceReprocessor.service.js')
const mode = PERSIST ? 'patch_inline' : 'dry_run'
const out = {}

if (TYPE === 'backtest' || TYPE === 'both') {
  out.backtest = await svc.reprocessBacktestRunEvidence(RUN_ID, { mode, toleranceMinutes: TOL, requestedBy: 'script' })
}
if (TYPE === 'replay' || TYPE === 'both') {
  out.replay = await svc.reprocessReplayRunEvidence(RUN_ID, { mode, requestedBy: 'script' })
}

console.log(JSON.stringify(out, null, 2))
console.log(mode === 'patch_inline' ? '[reprocess] patch_inline requested (gated by env flag)' : '[reprocess] DRY-RUN (no writes)')
process.exit(0)

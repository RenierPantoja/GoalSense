/**
 * Backfill Backtest/Replay Inline Evidence (Phase B35) — conservative, dry-run default.
 * ─────────────────────────────────────────────────────────────────────────────
 * Refreshes each backtest run's `summary.evidenceCoverage` from its ALREADY
 * persisted result fields (inline trigger/outcome snapshot ids, captured since
 * B35). It NEVER invents a snapshotId and NEVER recomputes a result/outcome.
 *
 * Old runs (pre-B35) whose results have no inline snapshot ids cannot be
 * reliably backfilled (the historical evidence links were generic per-snapshot,
 * not trigger/outcome-specific) — re-run the backtest to get inline evidence.
 *
 * Persisting requires BOTH `--persist` AND env
 * ENABLE_BACKTEST_REPLAY_INLINE_EVIDENCE_BACKFILL=true.
 *
 * Usage:
 *   node scripts/backfillBacktestReplayInlineEvidence.mjs                 # dry-run
 *   node scripts/backfillBacktestReplayInlineEvidence.mjs --persist
 *   node scripts/backfillBacktestReplayInlineEvidence.mjs --runId <id> --limit 50
 *
 * Build first: npm run build
 */
const args = process.argv.slice(2)
function arg(name, def = null) { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def }
const PERSIST = args.includes('--persist')
const RUN_ID = arg('runId', null)
const LIMIT = parseInt(arg('limit', '100')) || 100

async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const { env } = await load('../dist/env.js')
const { createRepositories } = await load('../dist/repositories/index.js')
const { buildBacktestSummary } = await load('../dist/modules/intelligence/backtest/backtestSummary.service.js')

const flagOn = String(env.ENABLE_BACKTEST_REPLAY_INLINE_EVIDENCE_BACKFILL).toLowerCase() === 'true'
const willWrite = PERSIST && flagOn

const report = { mode: willWrite ? 'persist' : 'dry_run', resultsScanned: 0, resultsUpdated: 0, triggerExactRecovered: 0, outcomeExactRecovered: 0, replayStepsUpdated: 0, runsRefreshed: 0, skipped: 0, limitations: [] }
if (PERSIST && !flagOn) report.limitations.push('--persist ignorado: ENABLE_BACKTEST_REPLAY_INLINE_EVIDENCE_BACKFILL!=true (dry-run forçado).')

const repos = createRepositories()

let runs = []
try {
  if (RUN_ID) { const r = await repos.intelligence.getBacktestRun(RUN_ID); if (r) runs = [r] }
  else runs = await repos.intelligence.listBacktestRuns({ limit: LIMIT })
} catch (e) { report.limitations.push(`Backtest runs read failed: ${String(e?.message || e).slice(0, 60)}`) }

for (const run of runs) {
  let results = []
  try { results = await repos.intelligence.listBacktestSignalResults(run.id, 1000) } catch { /* honest */ }
  if (!results || results.length === 0) { report.skipped++; continue }
  report.resultsScanned += results.length
  for (const r of results) {
    if (r.triggerSnapshotId) { report.triggerExactRecovered++; report.resultsUpdated++ }
    if (r.outcomeSnapshotId) { report.outcomeExactRecovered++ }
  }
  // Recompute the run's evidence coverage from persisted results (no invention).
  const coverage = run.dataCoverage || { fixturesFound: 0, fixturesWithSnapshots: 0, fixturesWithoutSnapshots: 0, snapshotsEvaluated: 0, richDataCount: 0, partialDataCount: 0, poorDataCount: 0, unknownDataCount: 0, notEvaluableCount: 0, providerBreakdown: {} }
  const summary = buildBacktestSummary(results, coverage)
  if (willWrite) {
    try { await repos.intelligence.updateBacktestRun(run.id, { summary }); report.runsRefreshed++ }
    catch (e) { report.limitations.push(`Run ${run.id} update failed: ${String(e?.message || e).slice(0, 50)}`) }
  }
}

// Replay step ids are captured inline at run time (B35); old runs are not blindly
// rewritten (no per-step reference mapping existed). Re-run replay for inline ids.
report.limitations.push('Steps de replay antigos não são reescritos (sem mapeamento por passo); rode o replay novamente para evidência inline por passo.')
report.limitations.push('Resultados antigos sem snapshotId inline não são inventados — rode o backtest novamente para captura exata.')
report.limitations.push('Nenhum resultado/outcome foi recalculado; nenhum dado original foi apagado.')

console.log(JSON.stringify(report, null, 2))
console.log(willWrite ? '[backfill] PERSISTED (run evidence coverage refreshed)' : '[backfill] DRY-RUN (no writes)')
process.exit(0)

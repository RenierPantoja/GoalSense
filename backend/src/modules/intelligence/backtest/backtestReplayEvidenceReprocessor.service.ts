/**
 * Backtest/Replay Evidence Reprocessor (Phase B36).
 * ─────────────────────────────────────────────────────────────────────────────
 * Recovers inline snapshot evidence for OLD runs by RE-evaluating against the same
 * persisted snapshots (same pure evaluator). A patch is applied ONLY when the
 * reprocessed result matches the original (fixture/pattern/status/minute) and a
 * REAL snapshot id was derived. Dry-run by default; patch needs an explicit flag.
 * NEVER changes the result, score, confidence, outcome, counters or patterns.
 */
import { randomUUID } from 'node:crypto'
import { env } from '../../../env.js'
import { createRepositories } from '../../../repositories/index.js'
import { evaluateFixture } from './backtestEngine.service.js'
import type { BacktestFixtureView } from './backtestEvaluationAdapter.service.js'
import { replayFixture } from './replayEngine.service.js'
import { compareBacktestResult, buildEvidencePatch } from './utils/backtestEvidenceIdentity.util.js'
import { linkSnapshotToSource } from '../evidence/evidenceLineage.service.js'
import type {
  BacktestReplayEvidenceReprocessRun, BacktestSignalResult, BacktestDataCoverage,
} from './backtest.types.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'
const DEFAULT_USER = 'default'
const SNAPSHOTS_PER_FIXTURE = 200

export function isReprocessPatchEnabled(): boolean { return flag(env.ENABLE_BACKTEST_REPLAY_EVIDENCE_REPROCESS_PATCH) }

export interface ReprocessOptions {
  mode?: 'dry_run' | 'patch_inline'
  toleranceMinutes?: number
  requestedBy?: string | null
  limit?: number
}

function emptyCoverage(): BacktestDataCoverage {
  return { fixturesFound: 0, fixturesWithSnapshots: 0, fixturesWithoutSnapshots: 0, snapshotsEvaluated: 0, richDataCount: 0, partialDataCount: 0, poorDataCount: 0, unknownDataCount: 0, notEvaluableCount: 0, providerBreakdown: {} }
}

function newRun(targetType: 'backtest' | 'replay', targetRunId: string, mode: 'dry_run' | 'patch_inline', requestedBy: string | null): BacktestReplayEvidenceReprocessRun {
  return {
    id: `brr_${randomUUID()}`, targetType, targetRunId, mode, requestedBy,
    startedAt: new Date().toISOString(), completedAt: null,
    scannedResults: 0, matchedResults: 0, patchedResults: 0, mismatchedResults: 0, skippedResults: 0,
    errors: [], exactRecovered: 0, inferredRecovered: 0, limitations: [], status: 'completed',
  }
}

/** Re-evaluate a single fixture deterministically for evidence recovery. */
async function reevaluate(patternView: any, fixtureId: string): Promise<BacktestSignalResult | null> {
  const repos = createRepositories()
  const fx = await repos.fixtures.findById(fixtureId)
  if (!fx) return null
  const snaps = await repos.liveSnapshots.listRecent({ fixtureId, limit: SNAPSHOTS_PER_FIXTURE })
  if (!snaps || snaps.length === 0) return null
  const fixtureView: BacktestFixtureView = {
    id: fx.id, canonicalKey: fx.canonicalKey || fx.id, homeName: fx.homeName || 'unknown',
    awayName: fx.awayName || 'unknown', competition: fx.competition || 'unknown', status: fx.status || 'NS',
  }
  return evaluateFixture(patternView, fixtureView, snaps as any, 'strict', emptyCoverage())
}

function safeParse<T>(s: string | null | undefined, fb: T): T { if (!s) return fb; try { return JSON.parse(s) as T } catch { return fb } }

export async function reprocessBacktestRunEvidence(runId: string, options: ReprocessOptions = {}): Promise<BacktestReplayEvidenceReprocessRun> {
  const repos = createRepositories()
  const requestedMode = options.mode || 'dry_run'
  const mode: 'dry_run' | 'patch_inline' = requestedMode === 'patch_inline' && isReprocessPatchEnabled() ? 'patch_inline' : 'dry_run'
  const tolerance = Math.max(0, options.toleranceMinutes ?? 0)
  const run = newRun('backtest', runId, mode, options.requestedBy ?? null)
  if (requestedMode === 'patch_inline' && mode === 'dry_run') run.limitations.push('patch_inline rebaixado para dry_run (ENABLE_BACKTEST_REPLAY_EVIDENCE_REPROCESS_PATCH!=true).')

  try {
    const btRun = await repos.intelligence.getBacktestRun(runId)
    if (!btRun) { run.status = 'failed_non_fatal'; run.errors.push('run_not_found'); run.completedAt = new Date().toISOString(); return run }
    const pattern = await repos.patterns.findById(btRun.patternId, DEFAULT_USER).catch(() => null)
    if (!pattern) { run.status = 'completed_with_limitations'; run.limitations.push('pattern_not_found — não é possível reprocessar.'); run.completedAt = new Date().toISOString(); return run }
    const conditions = safeParse<any[]>(pattern.conditionsJson, [])
    const patternView = {
      id: pattern.id, name: pattern.name, conditions, minConfidence: pattern.minConfidence ?? 50,
      severity: pattern.severity || 'attention', requireRichData: pattern.requireRichData,
      signalType: conditions.find((c: any) => !['is_live', 'is_pre_live', 'minute_between', 'is_final_phase', 'favorite_involved'].includes(c.type))?.type,
    }

    const results = await repos.intelligence.listBacktestSignalResults(runId, options.limit ?? 1000)
    for (const original of results) {
      run.scannedResults++
      // Already has exact inline evidence → nothing to recover.
      if (original.triggerSnapshotId) { run.skippedResults++; continue }
      let derived: BacktestSignalResult | null = null
      try { derived = await reevaluate(patternView, original.fixtureId) }
      catch (e: any) { run.errors.push(`${original.fixtureId}: ${String(e?.message || e).slice(0, 60)}`); run.skippedResults++; continue }
      if (!derived) { run.skippedResults++; run.limitations.push('skipped_missing_snapshots'); continue }

      const cmp = compareBacktestResult({ ...original, patternId: btRun.patternId } as any, { ...derived, patternId: btRun.patternId }, tolerance)
      if (!cmp.match) { run.mismatchedResults++; continue }
      run.matchedResults++
      if (!cmp.canRecoverExact) { run.skippedResults++; continue }

      if (derived.triggerSnapshotId) run.exactRecovered++
      if (mode === 'patch_inline') {
        const patch = buildEvidencePatch(derived, run.id)
        try {
          const res = await repos.intelligence.updateBacktestSignalResult(original.id, patch)
          if (res.count > 0) {
            run.patchedResults++
            // Non-fatal exact evidence link.
            void linkSnapshotToSource({
              snapshotId: derived.triggerSnapshotId, fixtureId: original.fixtureId,
              capturedAt: derived.triggerSnapshotCapturedAt ?? null, minute: derived.triggerSnapshotMinute ?? null,
              linkStrength: 'exact', source: 'backtest_result', sourceId: original.id, sourceType: 'BacktestSignalResult',
              patternId: btRun.patternId, backtestRunId: runId, evidenceKind: 'backtest_evaluation',
              reason: 'Reprocessamento B36: snapshot exato recuperado (resultado idêntico ao original).',
            })
          } else { run.limitations.push('patch_update_count_0 (Noop/Prisma ou doc ausente)') }
        } catch (e: any) { run.errors.push(`patch ${original.id}: ${String(e?.message || e).slice(0, 50)}`) }
      }
    }
  } catch (e: any) {
    run.status = 'failed_non_fatal'; run.errors.push(String(e?.message || e).slice(0, 80))
  }

  if (run.errors.length > 0 && run.status === 'completed') run.status = 'completed_with_limitations'
  if (run.limitations.length > 0 && run.status === 'completed') run.status = 'completed_with_limitations'
  run.completedAt = new Date().toISOString()
  try { await repos.intelligence.createBacktestReplayEvidenceReprocessRun(run) } catch { /* non-fatal */ }
  return run
}

export async function reprocessReplayRunEvidence(runId: string, options: ReprocessOptions = {}): Promise<BacktestReplayEvidenceReprocessRun> {
  const repos = createRepositories()
  const requestedMode = options.mode || 'dry_run'
  const mode: 'dry_run' | 'patch_inline' = requestedMode === 'patch_inline' && isReprocessPatchEnabled() ? 'patch_inline' : 'dry_run'
  const run = newRun('replay', runId, mode, options.requestedBy ?? null)
  if (requestedMode === 'patch_inline' && mode === 'dry_run') run.limitations.push('patch_inline rebaixado para dry_run (flag off).')

  try {
    const replay = await repos.intelligence.getReplayRun(runId)
    if (!replay) { run.status = 'failed_non_fatal'; run.errors.push('replay_run_not_found'); run.completedAt = new Date().toISOString(); return run }
    run.scannedResults = replay.timeline?.length ?? 0
    // Re-run the replay deterministically (same snapshots → same points + step ids).
    const fresh = await replayFixture(replay.patternId, replay.fixtureId, { persist: mode === 'patch_inline' })
    const stepsWithSnap = (fresh.timeline || []).filter((p: any) => !!p.snapshotId).length
    run.exactRecovered = stepsWithSnap
    run.matchedResults = fresh.timeline?.length ?? 0
    if (mode === 'patch_inline') run.patchedResults = stepsWithSnap
    else run.limitations.push('dry-run: replay reprocessado em memória; nenhum passo foi reescrito.')
    if (stepsWithSnap === 0) run.limitations.push('Sem snapshotId por passo (snapshots sem id ou ausentes).')
  } catch (e: any) {
    run.status = 'failed_non_fatal'; run.errors.push(String(e?.message || e).slice(0, 80))
  }

  if (run.errors.length > 0 && run.status === 'completed') run.status = 'completed_with_limitations'
  if (run.limitations.length > 0 && run.status === 'completed') run.status = 'completed_with_limitations'
  run.completedAt = new Date().toISOString()
  try { await repos.intelligence.createBacktestReplayEvidenceReprocessRun(run) } catch { /* non-fatal */ }
  return run
}

export async function listReprocessRuns(limit = 30): Promise<BacktestReplayEvidenceReprocessRun[]> {
  const repos = createRepositories()
  try { return await repos.intelligence.listBacktestReplayEvidenceReprocessRuns(limit) } catch { return [] }
}
export async function getReprocessRun(id: string): Promise<BacktestReplayEvidenceReprocessRun | null> {
  const repos = createRepositories()
  try { return await repos.intelligence.getBacktestReplayEvidenceReprocessRun(id) } catch { return null }
}

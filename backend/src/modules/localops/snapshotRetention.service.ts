/**
 * Snapshot Retention V2 (Phase B32) — safe lifecycle: dry_run / mark_only /
 * soft_delete / hard_delete. Protect-first via the protection index. Every run is
 * audited. Nothing is deleted by default; hard-delete requires its own flag and
 * only acts on already soft_deleted/marked, unprotected snapshots.
 * ─────────────────────────────────────────────────────────────────────────────
 * dry_run     → plan only (no writes).
 * mark_only   → mark eligible candidates for deletion (reversible, no delete).
 * soft_delete → soft-delete eligible candidates (reversible; hidden from reads).
 * hard_delete → physically delete only soft_deleted/marked + unprotected (flag).
 */
import { randomUUID } from 'node:crypto'
import { env } from '../../env.js'
import { createRepositories } from '../../repositories/index.js'
import {
  classifySnapshotRetention, evaluateLifecycleEligibility, resolveRetentionMode,
  normalizeLifecycleState,
} from './utils/localOps.util.js'
import { buildProtectionContext, resolveSnapshotProtection } from './snapshotProtectionIndex.service.js'
import { setRetentionSummary } from './livePipelineGuard.service.js'
import type {
  SnapshotRetentionMode, SnapshotRetentionCandidate, SnapshotRetentionRun,
} from './snapshotLifecycle.types.js'

const DAY_MS = 24 * 60 * 60 * 1000
const flag = (v: unknown) => String(v).toLowerCase() === 'true'

function modeFlags() {
  return {
    retentionEnabled: flag(env.ENABLE_SNAPSHOT_RETENTION),
    markEnabled: flag(env.ENABLE_SNAPSHOT_MARK_FOR_DELETION),
    softEnabled: flag(env.ENABLE_SNAPSHOT_SOFT_DELETE),
    hardEnabled: flag(env.ENABLE_SNAPSHOT_HARD_DELETE),
  }
}

export interface RetentionPlan {
  enabled: boolean
  dryRun: boolean
  requestedMode: SnapshotRetentionMode
  effectiveMode: SnapshotRetentionMode
  downgraded: boolean
  downgradeReason: string | null
  scanned: number
  protectedRecords: number
  candidates: number
  byLifecycleState: Record<string, number>
  topCandidates: SnapshotRetentionCandidate[]
  thresholds: { rawDays: number; importantDays: number }
  requireMarkBeforeDelete: boolean
  limitations: string[]
  generatedAt: string
}

async function scanCandidates(includeSoftDeleted: boolean): Promise<{
  scanned: number
  protectedRecords: number
  candidates: SnapshotRetentionCandidate[]
  byLifecycleState: Record<string, number>
  limitations: string[]
}> {
  const repos = createRepositories()
  const limitations: string[] = []
  const rawDays = env.SNAPSHOT_RETENTION_DAYS_RAW
  const importantDays = env.SNAPSHOT_RETENTION_DAYS_IMPORTANT
  const byLifecycleState: Record<string, number> = {}
  const candidates: SnapshotRetentionCandidate[] = []
  let scanned = 0, protectedRecords = 0

  let snapshots: any[] = []
  try { snapshots = await repos.liveSnapshots.listLiveSnapshotsForRetention({ limit: env.SNAPSHOT_RETENTION_SCAN_LIMIT, includeSoftDeleted }) }
  catch { limitations.push('Não foi possível listar snapshots (persistência indisponível).') }

  const ctx = buildProtectionContext(repos)
  const now = Date.now()

  for (const s of snapshots) {
    scanned++
    const lifecycleState = normalizeLifecycleState(s.lifecycleState)
    byLifecycleState[lifecycleState] = (byLifecycleState[lifecycleState] || 0) + 1

    const protection = await resolveSnapshotProtection(s, ctx, rawDays, now)
    if (protection.protectedRecord) protectedRecords++

    const elig = evaluateLifecycleEligibility({
      currentState: lifecycleState,
      protectedRecord: protection.protectedRecord,
      ageDays: protection.ageDays,
      rawRetentionDays: rawDays,
    })

    const classification = classifySnapshotRetention({
      ageDays: protection.ageDays,
      linkage: { linkedToAlert: protection.reasons.includes('linked_to_alert') },
      retentionDaysRaw: rawDays,
      retentionDaysImportant: importantDays,
    })

    // Only collect rows that are candidates (eligible for some delete action) OR
    // already in a deletion lifecycle state — protected/active-recent are summarized
    // in the counters but not listed as candidates.
    if (elig.eligibleForSoftDelete || elig.eligibleForHardDelete || lifecycleState === 'marked_for_deletion' || lifecycleState === 'soft_deleted') {
      candidates.push({
        snapshotId: String(s.id || ''),
        fixtureId: String(s.fixtureId || ''),
        capturedAt: s.capturedAt || null,
        category: classification.category,
        lifecycleState,
        protectionReasons: protection.reasons,
        eligibleForSoftDelete: elig.eligibleForSoftDelete,
        eligibleForHardDelete: elig.eligibleForHardDelete,
        ageDays: Math.round(protection.ageDays * 10) / 10,
        dataQuality: String(s.dataQuality || 'unknown'),
        limitations: protection.dependencyResolvable ? [] : ['Dependência não resolvível → protegido (unknown_dependency).'],
      })
    }
  }

  limitations.push(`Varredura limitada aos ${env.SNAPSHOT_RETENTION_SCAN_LIMIT} snapshots mais recentes (cobertura parcial).`)
  limitations.push('Proteção é conservadora: vínculo a alerta protege também outcome/promoted/learning de forma defensiva.')
  return { scanned, protectedRecords, candidates, byLifecycleState, limitations }
}

export async function getSnapshotRetentionPlan(requestedMode: SnapshotRetentionMode = 'dry_run'): Promise<RetentionPlan> {
  const resolution = resolveRetentionMode(requestedMode, modeFlags())
  const scan = await scanCandidates(false)
  const candidateCount = scan.candidates.filter(c => c.eligibleForSoftDelete || c.eligibleForHardDelete).length
  setRetentionSummary(candidateCount, scan.protectedRecords)
  return {
    enabled: flag(env.ENABLE_SNAPSHOT_RETENTION),
    dryRun: flag(env.SNAPSHOT_RETENTION_DRY_RUN),
    requestedMode,
    effectiveMode: resolution.effectiveMode,
    downgraded: resolution.downgraded,
    downgradeReason: resolution.reason,
    scanned: scan.scanned,
    protectedRecords: scan.protectedRecords,
    candidates: candidateCount,
    byLifecycleState: scan.byLifecycleState,
    topCandidates: scan.candidates.slice(0, 50),
    thresholds: { rawDays: env.SNAPSHOT_RETENTION_DAYS_RAW, importantDays: env.SNAPSHOT_RETENTION_DAYS_IMPORTANT },
    requireMarkBeforeDelete: flag(env.SNAPSHOT_RETENTION_REQUIRE_MARK_BEFORE_DELETE),
    limitations: scan.limitations,
    generatedAt: new Date().toISOString(),
  }
}

export interface RetentionRunInput { requestedMode: SnapshotRetentionMode; requestedBy: string | null }

/**
 * Execute a retention run in the resolved (gated) mode. Protected snapshots are
 * never touched. hard_delete only acts on soft_deleted/marked + unprotected, and
 * (when REQUIRE_MARK_BEFORE_DELETE) never on `active` directly. Audited.
 */
export async function runSnapshotRetention(input: RetentionRunInput): Promise<SnapshotRetentionRun> {
  const repos = createRepositories()
  const resolution = resolveRetentionMode(input.requestedMode, modeFlags())
  const mode = resolution.effectiveMode
  const requireMark = flag(env.SNAPSHOT_RETENTION_REQUIRE_MARK_BEFORE_DELETE)
  const batchSize = env.SNAPSHOT_RETENTION_BATCH_SIZE

  const run: SnapshotRetentionRun = {
    id: `srr_${randomUUID()}`,
    mode,
    requestedBy: input.requestedBy,
    startedAt: new Date().toISOString(),
    completedAt: null,
    scanned: 0, protectedRecords: 0, candidates: 0,
    marked: 0, softDeleted: 0, hardDeleted: 0, blocked: 0,
    errors: [], limitations: [],
  }

  // hard_delete must include soft_deleted rows to act on them.
  const includeSoftDeleted = mode === 'hard_delete'
  const scan = await scanCandidates(includeSoftDeleted)
  run.scanned = scan.scanned
  run.protectedRecords = scan.protectedRecords
  const actionable = scan.candidates.filter(c => c.eligibleForSoftDelete || c.eligibleForHardDelete)
  run.candidates = actionable.length
  run.limitations.push(...scan.limitations)
  if (resolution.downgraded) run.limitations.unshift(`Modo rebaixado para ${mode} (${resolution.reason}).`)

  // Persist run start (Firebase persists; Noop is honest no-op).
  try { await repos.intelligence.createSnapshotRetentionRun(run) } catch { /* non-fatal */ }

  if (mode === 'dry_run') {
    run.limitations.unshift('Dry-run: nenhum snapshot foi marcado ou apagado.')
  } else {
    let processed = 0
    for (const c of actionable) {
      if (processed >= batchSize) { run.limitations.push(`Lote limitado a ${batchSize}; rode novamente para continuar.`); break }
      processed++
      try {
        if (mode === 'mark_only') {
          if (c.lifecycleState === 'active' && c.eligibleForSoftDelete) {
            const r = await repos.liveSnapshots.markLiveSnapshotForDeletion(c.snapshotId, { retentionRunId: run.id, deletionReason: `retention:${c.category}` })
            if (r.supported && r.count > 0) run.marked++; else if (!r.supported) run.blocked++
          }
        } else if (mode === 'soft_delete') {
          if (c.eligibleForSoftDelete) {
            const r = await repos.liveSnapshots.softDeleteLiveSnapshot(c.snapshotId, { retentionRunId: run.id, deletedBy: input.requestedBy, deletionReason: `retention:${c.category}` })
            if (r.supported && r.count > 0) run.softDeleted++; else if (!r.supported) run.blocked++
          }
        } else if (mode === 'hard_delete') {
          // Never hard-delete active directly when mark-before-delete is required.
          const stateOk = c.lifecycleState === 'soft_deleted' || c.lifecycleState === 'marked_for_deletion'
          if (c.eligibleForHardDelete && stateOk && (!requireMark || stateOk)) {
            const r = await repos.liveSnapshots.hardDeleteLiveSnapshot(c.snapshotId)
            if (r.supported && r.count > 0) run.hardDeleted++; else if (!r.supported) run.blocked++
          } else {
            run.blocked++
          }
        }
      } catch (e: any) {
        run.errors.push(`${c.snapshotId}: ${String(e?.message || e).slice(0, 80)}`)
      }
    }
  }

  run.completedAt = new Date().toISOString()
  const candidateCount = run.candidates
  setRetentionSummary(candidateCount, run.protectedRecords)
  try { await repos.intelligence.updateSnapshotRetentionRun(run.id, run) } catch { /* non-fatal */ }
  return run
}

export async function listSnapshotRetentionRuns(limit = 20): Promise<SnapshotRetentionRun[]> {
  const repos = createRepositories()
  try { return await repos.intelligence.listSnapshotRetentionRuns(limit) } catch { return [] }
}

export async function getSnapshotRetentionRun(id: string): Promise<SnapshotRetentionRun | null> {
  const repos = createRepositories()
  try { return await repos.intelligence.getSnapshotRetentionRun(id) } catch { return null }
}

// Re-export age helper for callers/tests.
export const _dayMs = DAY_MS

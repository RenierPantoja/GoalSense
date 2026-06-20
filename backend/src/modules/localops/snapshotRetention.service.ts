/**
 * Snapshot Retention (Phase B31) — SAFE, dry-run foundation.
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds a retention PLAN over recent live snapshots and classifies each as
 * protected (linked to alert/outcome/replay/backtest/learning) or a raw delete
 * candidate (old + unlinked). Because the LiveSnapshotRepository is append-only
 * (no delete method on Firebase/Prisma/Noop), real deletion is NOT performed —
 * `run` returns a dry-run result with `deleted = 0`. This is intentional: a path
 * to retention exists with zero risk. When in doubt, a snapshot is protected.
 */
import { env } from '../../env.js'
import { createRepositories } from '../../repositories/index.js'
import { classifySnapshotRetention, type RetentionCategory } from './utils/localOps.util.js'
import { isRetentionEnabled, isRetentionDryRun, setRetentionSummary } from './livePipelineGuard.service.js'

const SCAN_LIMIT = 500
const DAY_MS = 24 * 60 * 60 * 1000

export interface RetentionPlan {
  enabled: boolean
  dryRun: boolean
  scanned: number
  byCategory: Record<RetentionCategory, number>
  candidates: number
  protectedRecords: number
  wouldDelete: number
  oldestCandidateAgeDays: number | null
  thresholds: { rawDays: number; importantDays: number }
  limitations: string[]
  generatedAt: string
}

export interface RetentionRunResult {
  enabled: boolean
  dryRun: boolean
  candidates: number
  protectedRecords: number
  wouldDelete: number
  deleted: number
  limitations: string[]
  generatedAt: string
}

const EMPTY_CATEGORIES = (): Record<RetentionCategory, number> => ({
  raw: 0, important_for_alert: 0, important_for_backtest: 0,
  important_for_replay: 0, promoted_alert_related: 0, learning_related: 0,
})

async function computePlan(): Promise<RetentionPlan> {
  const repos = createRepositories()
  const limitations: string[] = []
  const byCategory = EMPTY_CATEGORIES()
  let scanned = 0, candidates = 0, protectedRecords = 0, wouldDelete = 0
  let oldestCandidateAgeDays: number | null = null

  let snapshots: any[] = []
  try { snapshots = await repos.liveSnapshots.listRecent({ limit: SCAN_LIMIT }) }
  catch { limitations.push('Não foi possível listar snapshots (persistência indisponível).') }

  // Cache alert linkage per fixture to avoid repeated lookups.
  const alertCache = new Map<string, boolean>()
  async function fixtureHasAlert(fixtureId: string): Promise<boolean> {
    if (!fixtureId) return false
    if (alertCache.has(fixtureId)) return alertCache.get(fixtureId) as boolean
    let has = false
    try { const alerts = await repos.alerts.findByFixtureIds(fixtureId); has = Array.isArray(alerts) && alerts.length > 0 }
    catch { has = true /* on error, protect conservatively */ }
    alertCache.set(fixtureId, has)
    return has
  }

  const now = Date.now()
  for (const s of snapshots) {
    scanned++
    const capturedAt = s.capturedAt ? new Date(s.capturedAt).getTime() : now
    const ageDays = Math.max(0, (now - capturedAt) / DAY_MS)
    const linkedToAlert = await fixtureHasAlert(String(s.fixtureId || ''))
    // backtest/replay/learning linkage is not resolvable per-snapshot in the
    // current schema → protect conservatively when the fixture has any alert.
    const decision = classifySnapshotRetention({
      ageDays,
      linkage: { linkedToAlert },
      retentionDaysRaw: env.SNAPSHOT_RETENTION_DAYS_RAW,
      retentionDaysImportant: env.SNAPSHOT_RETENTION_DAYS_IMPORTANT,
    })
    byCategory[decision.category]++
    if (decision.protectedRecord) protectedRecords++
    if (decision.wouldDelete) {
      candidates++; wouldDelete++
      if (oldestCandidateAgeDays === null || ageDays > oldestCandidateAgeDays) oldestCandidateAgeDays = ageDays
    }
  }

  limitations.push(`Varredura limitada aos ${SCAN_LIMIT} snapshots mais recentes (cobertura parcial).`)
  limitations.push('Vínculo a backtest/replay/learning não é resolvível por snapshot no schema atual — protegido de forma conservadora.')
  limitations.push('Exclusão real indisponível: o repositório de snapshots é append-only (sem método de delete). Plano é apenas dry-run.')

  setRetentionSummary(candidates, protectedRecords)

  return {
    enabled: isRetentionEnabled(),
    dryRun: isRetentionDryRun(),
    scanned, byCategory, candidates, protectedRecords, wouldDelete,
    oldestCandidateAgeDays: oldestCandidateAgeDays === null ? null : Math.round(oldestCandidateAgeDays * 10) / 10,
    thresholds: { rawDays: env.SNAPSHOT_RETENTION_DAYS_RAW, importantDays: env.SNAPSHOT_RETENTION_DAYS_IMPORTANT },
    limitations,
    generatedAt: new Date().toISOString(),
  }
}

export async function getSnapshotRetentionPlan(): Promise<RetentionPlan> {
  return computePlan()
}

/**
 * Run retention. Always SAFE: even when ENABLE_SNAPSHOT_RETENTION=true and
 * dry-run=false, no delete backend exists, so `deleted` stays 0 and the operator
 * is told exactly what would happen. Disabled by default.
 */
export async function runSnapshotRetention(): Promise<RetentionRunResult> {
  const plan = await computePlan()
  const limitations = [...plan.limitations]
  if (!plan.enabled) limitations.unshift('Retenção desabilitada (ENABLE_SNAPSHOT_RETENTION=false). Nenhuma ação tomada.')
  else if (plan.dryRun) limitations.unshift('Modo dry-run (SNAPSHOT_RETENTION_DRY_RUN=true). Nenhum snapshot apagado.')
  else limitations.unshift('Sem backend de exclusão segura — execução não apaga nada (deleted=0).')
  return {
    enabled: plan.enabled,
    dryRun: plan.dryRun,
    candidates: plan.candidates,
    protectedRecords: plan.protectedRecords,
    wouldDelete: plan.wouldDelete,
    deleted: 0,
    limitations,
    generatedAt: new Date().toISOString(),
  }
}

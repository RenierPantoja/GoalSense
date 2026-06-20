/**
 * Local Ops Metrics Persistence (Phase B32) — optional, disabled by default.
 * ─────────────────────────────────────────────────────────────────────────────
 * Captures a point-in-time snapshot of the in-memory guard metrics so operational
 * history survives restarts when ENABLE_LOCAL_OPS_METRICS_PERSISTENCE=true.
 * No secrets. Low write volume (manual or interval-driven). Noop-safe under Prisma.
 */
import { randomUUID } from 'node:crypto'
import { env } from '../../env.js'
import { createRepositories } from '../../repositories/index.js'
import { getGuardMetrics } from './livePipelineGuard.service.js'
import { getLocalOperationsStatus } from './localOperations.service.js'
import type { LocalOpsMetricsSnapshot } from './snapshotLifecycle.types.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'

export function isMetricsPersistenceEnabled(): boolean { return flag(env.ENABLE_LOCAL_OPS_METRICS_PERSISTENCE) }

/** Build a metrics snapshot from the current in-memory counters (no I/O). */
export function buildMetricsSnapshot(): LocalOpsMetricsSnapshot {
  const m = getGuardMetrics()
  let riskLevel = 'low'; let warnings = 0
  try { const status = getLocalOperationsStatus(); riskLevel = status.riskLevel; warnings = status.warnings.length } catch { /* best-effort */ }
  return {
    id: `lom_${randomUUID()}`,
    capturedAt: new Date().toISOString(),
    profile: String(env.LOCAL_RUNTIME_PROFILE),
    guardMode: m.guardMode,
    providerCallsAllowed: m.providerCallsAllowed,
    providerCallsBlocked: m.providerCallsBlocked,
    snapshotsWritten: m.snapshotsWritten,
    snapshotsSkippedDuplicate: m.snapshotsSkippedDuplicate,
    snapshotsSkippedInterval: m.snapshotsSkippedInterval,
    snapshotsSkippedMax: m.snapshotsSkippedMaxPerFixture,
    fixturesSkippedByCap: m.fixturesSkippedByCap,
    readBudgetUsed: m.providerCallsAllowed + m.snapshotsWritten,
    writeBudgetUsed: m.snapshotsWritten,
    riskLevel,
    warnings,
  }
}

export interface CaptureResult { captured: boolean; persisted: boolean; snapshot: LocalOpsMetricsSnapshot; note: string }

/** Capture (and persist when enabled) a metrics snapshot. */
export async function captureLocalOpsMetrics(): Promise<CaptureResult> {
  const snapshot = buildMetricsSnapshot()
  if (!isMetricsPersistenceEnabled()) {
    return { captured: true, persisted: false, snapshot, note: 'Persistência desabilitada (ENABLE_LOCAL_OPS_METRICS_PERSISTENCE=false) — captura não foi salva.' }
  }
  try {
    const repos = createRepositories()
    await repos.intelligence.createLocalOpsMetricsSnapshot(snapshot)
    return { captured: true, persisted: true, snapshot, note: 'Métrica capturada e persistida.' }
  } catch (e: any) {
    return { captured: true, persisted: false, snapshot, note: `Falha ao persistir: ${String(e?.message || e).slice(0, 80)}` }
  }
}

export interface MetricsHistory { enabled: boolean; items: LocalOpsMetricsSnapshot[]; limitations: string[]; generatedAt: string }

export async function getLocalOpsMetricsHistory(limit = 50): Promise<MetricsHistory> {
  const limitations: string[] = []
  let items: LocalOpsMetricsSnapshot[] = []
  if (!isMetricsPersistenceEnabled()) limitations.push('Persistência desabilitada — histórico vazio até habilitar e capturar.')
  try { const repos = createRepositories(); items = await repos.intelligence.listLocalOpsMetricsSnapshots(limit) }
  catch { limitations.push('Não foi possível ler o histórico (persistência indisponível).') }
  if (items.length === 0 && limitations.length === 0) limitations.push('Sem capturas ainda.')
  limitations.push('Sob PERSISTENCE_PROVIDER=prisma o histórico não é persistido (Noop). Use Firebase mode.')
  return { enabled: isMetricsPersistenceEnabled(), items, limitations, generatedAt: new Date().toISOString() }
}

// ── Optional interval capture (off unless persistence enabled) ───────────────

let intervalHandle: ReturnType<typeof setInterval> | null = null

export function startLocalOpsMetricsCapture(): void {
  if (!isMetricsPersistenceEnabled()) return
  if (intervalHandle) return
  const ms = env.LOCAL_OPS_METRICS_INTERVAL_MS
  intervalHandle = setInterval(() => { void captureLocalOpsMetrics().catch(() => { /* non-fatal */ }) }, ms)
  // Do not block process exit on this timer.
  if (typeof (intervalHandle as any).unref === 'function') (intervalHandle as any).unref()
}

export function stopLocalOpsMetricsCapture(): void {
  if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null }
}

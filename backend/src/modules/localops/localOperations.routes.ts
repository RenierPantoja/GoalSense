/**
 * Local Operations API (Phase B30).
 * ─────────────────────────────────────────────────────────────────────────────
 * GET endpoints are read-only and env-gated by ENABLE_LOCAL_OPERATIONS_PANEL.
 * POST controls (pause/resume/reset) require operator+ (admin-for-dangerous off
 * for pause/resume; reset is harmless). No secrets exposed. Reset clears in-memory
 * counters only — never deletes persisted data.
 */
import type { FastifyInstance } from 'fastify'
import { ok, badRequest } from '../../utils/apiResponse.js'
import { requirePermission } from '../../middleware/requirePermission.middleware.js'
import {
  getLocalOperationsStatus, listWorkers, isLocalOperationsPanelEnabled,
} from './localOperations.service.js'
import { getProviderUsage, resetProviderUsageCounters } from './providerUsageGuard.service.js'
import { getSnapshotGuardStatus, resetSnapshotGuardCounters } from './snapshotWriteGuard.service.js'
import { getCoverageReport } from './dataCoverageMonitor.service.js'
import { pauseWorker, resumeWorker, getGuardRuntimeSummary } from './workerRegistry.service.js'
import { getGuardMetrics, resetGuardMetrics } from './livePipelineGuard.service.js'
import { getSnapshotRetentionPlan, runSnapshotRetention, listSnapshotRetentionRuns, getSnapshotRetentionRun } from './snapshotRetention.service.js'
import { getLocalOpsMetricsHistory, captureLocalOpsMetrics } from './localOpsMetricsPersistence.service.js'
import { recordAdminAudit } from '../audit/adminAudit.service.js'
import type { SnapshotRetentionMode } from './snapshotLifecycle.types.js'

function gate(reply: any): boolean {
  if (!isLocalOperationsPanelEnabled()) {
    reply.status(403).send({ success: false, error: { message: 'Painel de operação local desabilitado. Defina ENABLE_LOCAL_OPERATIONS_PANEL=true no backend.', reason: 'env_gate_disabled' } })
    return false
  }
  return true
}

export async function localOperationsRoutes(app: FastifyInstance) {
  const BASE = '/system/local-operations'

  app.get(`${BASE}/status`, async (_req, reply) => {
    if (!gate(reply)) return
    try { return ok(getLocalOperationsStatus()) }
    catch (e: any) { app.log.warn(`local-ops status failed: ${e?.message || e}`); return ok(null) }
  })

  app.get(`${BASE}/provider-usage`, async (_req, reply) => {
    if (!gate(reply)) return
    return ok(getProviderUsage())
  })

  app.get(`${BASE}/snapshot-guard`, async (_req, reply) => {
    if (!gate(reply)) return
    return ok(getSnapshotGuardStatus())
  })

  app.get(`${BASE}/coverage`, async (_req, reply) => {
    if (!gate(reply)) return
    try { return ok(await getCoverageReport()) }
    catch (e: any) { app.log.warn(`local-ops coverage failed: ${e?.message || e}`); return ok(null) }
  })

  app.get(`${BASE}/workers`, async (_req, reply) => {
    if (!gate(reply)) return
    return ok(listWorkers())
  })

  // ── B31: live pipeline guard metrics + runtime summary ──────────────────────
  app.get(`${BASE}/guard-metrics`, async (_req, reply) => {
    if (!gate(reply)) return
    return ok(getGuardMetrics())
  })

  app.get(`${BASE}/guard-runtime`, async (_req, reply) => {
    if (!gate(reply)) return
    return ok(getGuardRuntimeSummary())
  })

  // ── B31/B32: snapshot retention (lifecycle: dry_run/mark_only/soft_delete/hard_delete) ──
  app.get(`${BASE}/snapshot-retention/plan`, async (req, reply) => {
    if (!gate(reply)) return
    const mode = ((req.query as any)?.mode || 'dry_run') as SnapshotRetentionMode
    try { return ok(await getSnapshotRetentionPlan(mode)) }
    catch (e: any) { app.log.warn(`retention plan failed: ${e?.message || e}`); return ok(null) }
  })

  app.get(`${BASE}/snapshot-retention/runs`, async (_req, reply) => {
    if (!gate(reply)) return
    try { return ok(await listSnapshotRetentionRuns(20)) }
    catch (e: any) { app.log.warn(`retention runs failed: ${e?.message || e}`); return ok([]) }
  })

  app.get(`${BASE}/snapshot-retention/runs/:runId`, async (req, reply) => {
    if (!gate(reply)) return
    const { runId } = req.params as { runId: string }
    try { return ok(await getSnapshotRetentionRun(runId)) }
    catch (e: any) { app.log.warn(`retention run failed: ${e?.message || e}`); return ok(null) }
  })

  app.post(`${BASE}/snapshot-retention/run`, { preHandler: [requirePermission({ permission: 'run:scan' })] }, async (req, reply) => {
    if (!gate(reply)) return
    const requestedMode = ((req.body as any)?.mode || 'dry_run') as SnapshotRetentionMode
    // hard_delete additionally requires admin.
    if (requestedMode === 'hard_delete' && !(req.auth?.user?.role === 'admin' || req.auth?.user?.role === 'owner')) {
      void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'denied', resourceType: 'snapshot_retention', resourceId: 'run', metadata: { requestedMode, reason: 'admin_required' } })
      return reply.status(403).send(badRequest('hard_delete requer admin/owner.', { reason: 'admin_required' }))
    }
    const result = await runSnapshotRetention({ requestedMode, requestedBy: req.auth?.user?.userId ?? null })
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'snapshot_retention', resourceId: result.id, metadata: { mode: result.mode, marked: result.marked, softDeleted: result.softDeleted, hardDeleted: result.hardDeleted, blocked: result.blocked } })
    return ok(result)
  })

  // ── B32: local-ops metrics persistence (optional, disabled by default) ──────
  app.get(`${BASE}/metrics/history`, async (_req, reply) => {
    if (!gate(reply)) return
    try { return ok(await getLocalOpsMetricsHistory(50)) }
    catch (e: any) { app.log.warn(`metrics history failed: ${e?.message || e}`); return ok(null) }
  })

  app.post(`${BASE}/metrics/capture`, { preHandler: [requirePermission({ permission: 'run:scan' })] }, async (req, reply) => {
    if (!gate(reply)) return
    const result = await captureLocalOpsMetrics()
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'local_ops_metrics', resourceId: result.snapshot.id, metadata: { persisted: result.persisted } })
    return ok(result)
  })

  app.post(`${BASE}/workers/:workerName/pause`, { preHandler: [requirePermission({ permission: 'run:scan' })] }, async (req, reply) => {
    if (!gate(reply)) return
    const { workerName } = req.params as { workerName: string }
    const res = pauseWorker(workerName)
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: res.ok ? 'success' : 'denied', resourceType: 'worker', resourceId: workerName, metadata: { op: 'pause', reason: res.reason } })
    if (!res.ok) return reply.status(400).send(badRequest('Não foi possível pausar.', { reason: res.reason }))
    return ok({ worker: workerName, paused: true })
  })

  app.post(`${BASE}/workers/:workerName/resume`, { preHandler: [requirePermission({ permission: 'run:scan' })] }, async (req, reply) => {
    if (!gate(reply)) return
    const { workerName } = req.params as { workerName: string }
    const res = resumeWorker(workerName)
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: res.ok ? 'success' : 'denied', resourceType: 'worker', resourceId: workerName, metadata: { op: 'resume', reason: res.reason } })
    if (!res.ok) return reply.status(400).send(badRequest('Não foi possível retomar.', { reason: res.reason }))
    return ok({ worker: workerName, paused: false })
  })

  app.post(`${BASE}/guards/reset-counters`, { preHandler: [requirePermission({ permission: 'run:scan' })] }, async (req, reply) => {
    if (!gate(reply)) return
    resetProviderUsageCounters()
    resetSnapshotGuardCounters()
    resetGuardMetrics()
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'local_guards', resourceId: 'counters', metadata: { op: 'reset_counters' } })
    return ok({ reset: true, note: 'Contadores in-memory zerados; nenhum dado persistido foi apagado.' })
  })
}

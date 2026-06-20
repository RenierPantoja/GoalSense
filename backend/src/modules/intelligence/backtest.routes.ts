/**
 * Backtest & Replay API (Phase B14).
 * ─────────────────────────────────────────────────────────────────────────────
 * Run endpoints (and on-the-fly replay computation) are gated by
 * ENABLE_BACKTEST_API=true → otherwise 403. Reads of stored runs/results are
 * open and honest (null/[] with 200). Nothing here creates alerts or sends
 * Telegram. POST run is capped via the config normalizer (maxFixtures hard cap).
 */
import type { FastifyInstance } from 'fastify'
import { createRepositories } from '../../repositories/index.js'
import { ok, badRequest } from '../../utils/apiResponse.js'
import { isBacktestApiEnabled, validateAndNormalizeConfig } from './backtest/utils/backtestGuards.util.js'
import { runPatternBacktest } from './backtest/backtestEngine.service.js'
import { replayFixture } from './backtest/replayEngine.service.js'
import { reprocessBacktestRunEvidence, reprocessReplayRunEvidence, listReprocessRuns, getReprocessRun } from './backtest/backtestReplayEvidenceReprocessor.service.js'
import { requirePermission } from '../../middleware/requirePermission.middleware.js'
import { rateLimit } from '../../middleware/rateLimit.middleware.js'
import { ROUTE_ACCESS } from '../auth/routeAccess.policy.js'
import { recordAdminAudit } from '../audit/adminAudit.service.js'

function disabled(reply: any) {
  return reply.status(403).send({ success: false, error: { message: 'Backtest API disabled. Set ENABLE_BACKTEST_API=true to enable.' } })
}
function clampLimit(raw: string | undefined, def: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : def
  if (!Number.isFinite(n) || n <= 0) return def
  return Math.min(n, max)
}

export async function backtestRoutes(app: FastifyInstance) {
  const repos = createRepositories()

  app.post('/intelligence/backtest/run', {
    preHandler: [requirePermission(ROUTE_ACCESS.backtest_run), rateLimit({ key: 'backtest_run', max: 'dangerous' })],
  }, async (req, reply) => {
    if (!isBacktestApiEnabled()) return disabled(reply)
    const v = validateAndNormalizeConfig((req.body || {}) as any)
    if (!v.ok) return reply.status(400).send(badRequest(v.error))
    try {
      const run = await runPatternBacktest(v.config)
      void recordAdminAudit({ auth: req.auth, action: 'backtest_run', route: req.url, method: req.method, result: 'success', resourceType: 'backtest', resourceId: (run as any)?.id ?? null })
      return ok(run)
    } catch (e: any) {
      app.log.error(`backtest run failed: ${e?.message || e}`)
      return reply.status(400).send(badRequest('Backtest failed', e?.message))
    }
  })

  app.get('/intelligence/backtest/runs', async (req) => {
    const { patternId, limit } = req.query as { patternId?: string; limit?: string }
    try { return ok(await repos.intelligence.listBacktestRuns({ patternId, limit: clampLimit(limit, 50, 200) })) }
    catch (e: any) { app.log.warn(`backtest runs read failed: ${e?.message || e}`); return ok([]) }
  })

  app.get('/intelligence/backtest/runs/:runId', async (req) => {
    const { runId } = req.params as { runId: string }
    try { return ok(await repos.intelligence.getBacktestRun(runId)) }
    catch (e: any) { app.log.warn(`backtest run read failed: ${e?.message || e}`); return ok(null) }
  })

  app.get('/intelligence/backtest/runs/:runId/results', async (req) => {
    const { runId } = req.params as { runId: string }
    const { limit } = req.query as { limit?: string }
    try { return ok(await repos.intelligence.listBacktestSignalResults(runId, clampLimit(limit, 200, 500))) }
    catch (e: any) { app.log.warn(`backtest results read failed: ${e?.message || e}`); return ok([]) }
  })

  app.post('/intelligence/replay/run', {
    preHandler: [requirePermission(ROUTE_ACCESS.replay_run), rateLimit({ key: 'replay_run', max: 'dangerous' })],
  }, async (req, reply) => {
    if (!isBacktestApiEnabled()) return disabled(reply)
    const { patternId, fixtureId } = (req.body || {}) as { patternId?: string; fixtureId?: string }
    if (!patternId || !fixtureId) return reply.status(400).send(badRequest('patternId and fixtureId are required'))
    try {
      const r = await replayFixture(patternId, fixtureId, { persist: true })
      void recordAdminAudit({ auth: req.auth, action: 'replay_run', route: req.url, method: req.method, result: 'success', resourceType: 'replay', resourceId: fixtureId })
      return ok(r)
    }
    catch (e: any) { app.log.error(`replay run failed: ${e?.message || e}`); return reply.status(400).send(badRequest('Replay failed', e?.message)) }
  })

  app.get('/intelligence/replay/runs/:runId', async (req) => {
    const { runId } = req.params as { runId: string }
    try { return ok(await repos.intelligence.getReplayRun(runId)) }
    catch (e: any) { app.log.warn(`replay run read failed: ${e?.message || e}`); return ok(null) }
  })

  app.get('/intelligence/replay/patterns/:patternId/fixtures/:fixtureId', async (req, reply) => {
    if (!isBacktestApiEnabled()) return disabled(reply)
    const { patternId, fixtureId } = req.params as { patternId: string; fixtureId: string }
    try { return ok(await replayFixture(patternId, fixtureId, { persist: false })) }
    catch (e: any) { app.log.error(`replay compute failed: ${e?.message || e}`); return reply.status(400).send(badRequest('Replay failed', e?.message)) }
  })

  // ── B36: evidence reprocessing (dry-run default; patch env-gated + admin/operator) ──
  app.get('/intelligence/backtest-replay-evidence/reprocess-runs', async (req) => {
    const { limit } = req.query as { limit?: string }
    try { return ok(await listReprocessRuns(clampLimit(limit, 30, 100))) }
    catch (e: any) { app.log.warn(`reprocess runs read failed: ${e?.message || e}`); return ok([]) }
  })

  app.get('/intelligence/backtest-replay-evidence/reprocess-runs/:id', async (req) => {
    const { id } = req.params as { id: string }
    try { return ok(await getReprocessRun(id)) }
    catch (e: any) { app.log.warn(`reprocess run read failed: ${e?.message || e}`); return ok(null) }
  })

  app.post('/intelligence/backtest-runs/:runId/reprocess-evidence', {
    preHandler: [requirePermission(ROUTE_ACCESS.backtest_run)],
  }, async (req, reply) => {
    if (!isBacktestApiEnabled()) return disabled(reply)
    const { runId } = req.params as { runId: string }
    const body = (req.body || {}) as { mode?: 'dry_run' | 'patch_inline'; toleranceMinutes?: number }
    if (body.mode === 'patch_inline' && !(req.auth?.user?.role === 'admin' || req.auth?.user?.role === 'owner' || req.auth?.user?.role === 'operator')) {
      return reply.status(403).send(badRequest('patch_inline requer operator+.', { reason: 'forbidden' }))
    }
    try {
      const run = await reprocessBacktestRunEvidence(runId, { mode: body.mode || 'dry_run', toleranceMinutes: body.toleranceMinutes, requestedBy: req.auth?.user?.userId ?? null })
      void recordAdminAudit({ auth: req.auth, action: 'backtest_run', route: req.url, method: req.method, result: 'success', resourceType: 'backtest_evidence_reprocess', resourceId: run.id, metadata: { mode: run.mode, patched: run.patchedResults, matched: run.matchedResults, mismatched: run.mismatchedResults } })
      return ok(run)
    } catch (e: any) { app.log.error(`reprocess backtest failed: ${e?.message || e}`); return reply.status(400).send(badRequest('Reprocess failed', e?.message)) }
  })

  app.post('/intelligence/replay-runs/:runId/reprocess-evidence', {
    preHandler: [requirePermission(ROUTE_ACCESS.replay_run)],
  }, async (req, reply) => {
    if (!isBacktestApiEnabled()) return disabled(reply)
    const { runId } = req.params as { runId: string }
    const body = (req.body || {}) as { mode?: 'dry_run' | 'patch_inline' }
    if (body.mode === 'patch_inline' && !(req.auth?.user?.role === 'admin' || req.auth?.user?.role === 'owner' || req.auth?.user?.role === 'operator')) {
      return reply.status(403).send(badRequest('patch_inline requer operator+.', { reason: 'forbidden' }))
    }
    try {
      const run = await reprocessReplayRunEvidence(runId, { mode: body.mode || 'dry_run', requestedBy: req.auth?.user?.userId ?? null })
      void recordAdminAudit({ auth: req.auth, action: 'replay_run', route: req.url, method: req.method, result: 'success', resourceType: 'replay_evidence_reprocess', resourceId: run.id, metadata: { mode: run.mode, patched: run.patchedResults } })
      return ok(run)
    } catch (e: any) { app.log.error(`reprocess replay failed: ${e?.message || e}`); return reply.status(400).send(badRequest('Reprocess failed', e?.message)) }
  })
}

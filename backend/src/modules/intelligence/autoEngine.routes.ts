/**
 * Auto Engine API (Phase B19).
 * ─────────────────────────────────────────────────────────────────────────────
 * Read endpoints are open (honest null/[]). POST /scan is gated by
 * ENABLE_AUTO_ENGINE (403 when off) and NEVER creates alerts/Telegram. No auth
 * layer yet — documented as a future phase.
 */
import type { FastifyInstance } from 'fastify'
import { createRepositories } from '../../repositories/index.js'
import { ok, badRequest } from '../../utils/apiResponse.js'
import { runAutoEngineScan, getAutoEngineOverview, isAutoEngineEnabled } from './autoEngine/autoEngine.service.js'

function clampLimit(raw: string | undefined, def: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : def
  if (!Number.isFinite(n) || n <= 0) return def
  return Math.min(n, max)
}

export async function autoEngineRoutes(app: FastifyInstance) {
  const repos = createRepositories()

  app.get('/intelligence/auto-engine/status', async () => {
    try { return ok(await getAutoEngineOverview()) }
    catch (e: any) { app.log.warn(`auto-engine status failed: ${e?.message || e}`); return ok(null) }
  })

  app.post('/intelligence/auto-engine/scan', async (req, reply) => {
    if (!isAutoEngineEnabled()) {
      return reply.status(403).send({ success: false, error: { message: 'Motor automático desabilitado. Defina ENABLE_AUTO_ENGINE=true no backend.' } })
    }
    const body = (req.body || {}) as { dryRun?: boolean; limit?: number; persist?: boolean }
    try {
      const run = await runAutoEngineScan({ dryRun: !!body.dryRun, limit: body.limit, persist: body.persist === true })
      return ok(run)
    } catch (e: any) {
      app.log.error(`auto-engine scan failed: ${e?.message || e}`)
      return reply.status(400).send(badRequest('Scan failed', e?.message))
    }
  })

  app.get('/intelligence/auto-engine/runs', async (req) => {
    const { limit } = req.query as { limit?: string }
    try { return ok(await repos.intelligence.listAutoEngineRuns(clampLimit(limit, 50, 200))) }
    catch (e: any) { app.log.warn(`auto-engine runs failed: ${e?.message || e}`); return ok([]) }
  })

  app.get('/intelligence/auto-engine/runs/:runId', async (req) => {
    const { runId } = req.params as { runId: string }
    try { return ok(await repos.intelligence.getAutoEngineRun(runId)) }
    catch (e: any) { app.log.warn(`auto-engine run failed: ${e?.message || e}`); return ok(null) }
  })

  app.get('/intelligence/auto-engine/opportunities', async (req) => {
    const { status, type, limit } = req.query as { status?: string; type?: string; limit?: string }
    try { return ok(await repos.intelligence.listAutoOpportunities({ status, type, limit: clampLimit(limit, 100, 300) })) }
    catch (e: any) { app.log.warn(`auto-engine opportunities failed: ${e?.message || e}`); return ok([]) }
  })

  app.get('/intelligence/auto-engine/opportunities/:id', async (req) => {
    const { id } = req.params as { id: string }
    try { return ok(await repos.intelligence.getAutoOpportunity(id)) }
    catch (e: any) { app.log.warn(`auto-engine opportunity failed: ${e?.message || e}`); return ok(null) }
  })

  app.get('/intelligence/auto-engine/fixtures/:fixtureId/opportunities', async (req) => {
    const { fixtureId } = req.params as { fixtureId: string }
    const { limit } = req.query as { limit?: string }
    try { return ok(await repos.intelligence.listAutoOpportunitiesByFixture(fixtureId, clampLimit(limit, 50, 100))) }
    catch (e: any) { app.log.warn(`auto-engine fixture opportunities failed: ${e?.message || e}`); return ok([]) }
  })
}

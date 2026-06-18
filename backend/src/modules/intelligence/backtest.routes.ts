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

  app.post('/intelligence/backtest/run', async (req, reply) => {
    if (!isBacktestApiEnabled()) return disabled(reply)
    const v = validateAndNormalizeConfig((req.body || {}) as any)
    if (!v.ok) return reply.status(400).send(badRequest(v.error))
    try {
      const run = await runPatternBacktest(v.config)
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

  app.post('/intelligence/replay/run', async (req, reply) => {
    if (!isBacktestApiEnabled()) return disabled(reply)
    const { patternId, fixtureId } = (req.body || {}) as { patternId?: string; fixtureId?: string }
    if (!patternId || !fixtureId) return reply.status(400).send(badRequest('patternId and fixtureId are required'))
    try { return ok(await replayFixture(patternId, fixtureId, { persist: true })) }
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
}

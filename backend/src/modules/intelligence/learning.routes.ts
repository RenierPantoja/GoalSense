/**
 * Learning read API + rebuild (Phase B13).
 * ─────────────────────────────────────────────────────────────────────────────
 * Read-only profile/recommendation endpoints + a rebuild trigger. Honest
 * emptiness (null/[] with 200, never 500). The rebuild is idempotent and
 * non-destructive (recomputes profiles from raw memory); it supports ?dryRun=true.
 *
 * NOTE: there is no admin/auth layer yet, so POST /rebuild is currently
 * unprotected. Documented in LEARNING_AGGREGATOR_FOUNDATION.md; restrict at the
 * edge (or add auth) before exposing publicly.
 */
import type { FastifyInstance } from 'fastify'
import { createRepositories } from '../../repositories/index.js'
import { ok, badRequest } from '../../utils/apiResponse.js'
import { aggregateAll, aggregatePattern, getLearningOverview } from './learning/learningAggregator.service.js'
import { learningEventDetail, relatedForLearningEvent } from './relatedAlerts.service.js'
import { requirePermission } from '../../middleware/requirePermission.middleware.js'
import { rateLimit } from '../../middleware/rateLimit.middleware.js'
import { ROUTE_ACCESS } from '../auth/routeAccess.policy.js'
import { recordAdminAudit } from '../audit/adminAudit.service.js'

function clampLimit(raw: string | undefined, def: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : def
  if (!Number.isFinite(n) || n <= 0) return def
  return Math.min(n, max)
}

export async function learningRoutes(app: FastifyInstance) {
  const repos = createRepositories()

  app.get('/intelligence/learning/overview', async () => {
    try { return ok(await getLearningOverview()) }
    catch (e: any) { app.log.warn(`learning overview failed: ${e?.message || e}`); return ok(null) }
  })

  app.get('/intelligence/learning/patterns', async (req) => {
    const { limit } = req.query as { limit?: string }
    try { return ok(await repos.intelligence.listPatternLearningProfiles(clampLimit(limit, 200, 500))) }
    catch (e: any) { app.log.warn(`learning patterns failed: ${e?.message || e}`); return ok([]) }
  })

  app.get('/intelligence/learning/patterns/:patternId', async (req) => {
    const { patternId } = req.params as { patternId: string }
    try { return ok(await repos.intelligence.getPatternLearningProfile(patternId)) }
    catch (e: any) { app.log.warn(`learning pattern failed: ${e?.message || e}`); return ok(null) }
  })

  app.get('/intelligence/learning/competitions', async (req) => {
    const { limit } = req.query as { limit?: string }
    try { return ok(await repos.intelligence.listCompetitionLearningProfiles(clampLimit(limit, 200, 500))) }
    catch (e: any) { app.log.warn(`learning competitions failed: ${e?.message || e}`); return ok([]) }
  })

  app.get('/intelligence/learning/competitions/:competitionKey', async (req) => {
    const { competitionKey } = req.params as { competitionKey: string }
    try { return ok(await repos.intelligence.getCompetitionLearningProfile(competitionKey)) }
    catch (e: any) { app.log.warn(`learning competition failed: ${e?.message || e}`); return ok(null) }
  })

  app.get('/intelligence/learning/teams', async (req) => {
    const { limit } = req.query as { limit?: string }
    try { return ok(await repos.intelligence.listTeamLearningProfiles(clampLimit(limit, 200, 500))) }
    catch (e: any) { app.log.warn(`learning teams failed: ${e?.message || e}`); return ok([]) }
  })

  app.get('/intelligence/learning/teams/:teamKey', async (req) => {
    const { teamKey } = req.params as { teamKey: string }
    try { return ok(await repos.intelligence.getTeamLearningProfile(teamKey)) }
    catch (e: any) { app.log.warn(`learning team failed: ${e?.message || e}`); return ok(null) }
  })

  app.get('/intelligence/learning/context-stats', async (req) => {
    const { limit } = req.query as { limit?: string }
    try { return ok(await repos.intelligence.listSignalContextStats(clampLimit(limit, 300, 1000))) }
    catch (e: any) { app.log.warn(`learning context-stats failed: ${e?.message || e}`); return ok([]) }
  })

  app.get('/intelligence/learning/recommendations', async (req) => {
    const { limit } = req.query as { limit?: string }
    try { return ok(await repos.intelligence.listLearningRecommendations(clampLimit(limit, 100, 500))) }
    catch (e: any) { app.log.warn(`learning recommendations failed: ${e?.message || e}`); return ok([]) }
  })

  // ── B17: learning event drill-down ──────────────────────────────────────────
  app.get('/intelligence/learning/events/:eventId', async (req) => {
    const { eventId } = req.params as { eventId: string }
    try { return ok(await learningEventDetail(eventId)) }
    catch (e: any) { app.log.warn(`learning event detail failed: ${e?.message || e}`); return ok({ found: false, event: null, relatedPattern: null, relatedRecommendations: [], relatedAlertsSummary: null, relatedAlertsLinkParams: null }) }
  })

  app.get('/intelligence/learning/events/:eventId/related-alerts', async (req) => {
    const { eventId } = req.params as { eventId: string }
    const { limit } = req.query as { limit?: string }
    try { return ok(await relatedForLearningEvent(eventId, clampLimit(limit, 20, 100))) }
    catch (e: any) { app.log.warn(`learning event related alerts failed: ${e?.message || e}`); return ok({ eventId, found: false, total: 0, appliedFilters: [], relatedAlerts: [] }) }
  })

  app.post('/intelligence/learning/rebuild', {
    preHandler: [requirePermission(ROUTE_ACCESS.learning_rebuild), rateLimit({ key: 'learning_rebuild', max: 'dangerous' })],
  }, async (req, reply) => {
    const { patternId, dryRun } = (req.body || {}) as { patternId?: string; dryRun?: boolean }
    try {
      const run = patternId
        ? await aggregatePattern(patternId, { dryRun: !!dryRun })
        : await aggregateAll({ dryRun: !!dryRun })
      void recordAdminAudit({ auth: req.auth, action: 'learning_rebuild', route: req.url, method: req.method, result: 'success', resourceType: 'learning_run', resourceId: (run as any)?.id ?? null, metadata: { patternId: patternId ?? null, dryRun: !!dryRun } })
      return ok(run)
    } catch (e: any) {
      app.log.error(`learning rebuild failed: ${e?.message || e}`)
      return reply.status(400).send(badRequest('Aggregation failed', e?.message))
    }
  })
}

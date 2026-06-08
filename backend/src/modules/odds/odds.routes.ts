import type { FastifyInstance } from 'fastify'
import * as service from './odds.service.js'
import * as auditService from './oddsCoverageAudit.service.js'
import { getOddsStatus } from './odds.service.js'
import { ok, badRequest, notFound } from '../../utils/apiResponse.js'

export async function oddsRoutes(app: FastifyInstance) {
  app.get('/odds/status', async () => {
    const status = await service.getOddsStatus()
    return ok(status)
  })

  app.get('/odds/fixture/:fixtureId', async (req, reply) => {
    const { fixtureId } = req.params as { fixtureId: string }
    const result = await service.fetchOddsForFixture(fixtureId)
    if (!result.success) return reply.status(400).send(badRequest(result.error || 'Failed to fetch odds'))
    return ok(result)
  })

  app.get('/odds/alert/:alertId', async (req, reply) => {
    const { alertId } = req.params as { alertId: string }
    try {
      const result = await service.getOddsForAlert(alertId)
      return ok(result)
    } catch (err: any) {
      if (err.message === 'Alert not found') return reply.status(404).send(notFound('Alert not found'))
      return reply.status(500).send(badRequest(err.message))
    }
  })

  app.post('/odds/alert/:alertId/refresh', async (req, reply) => {
    const { alertId } = req.params as { alertId: string }
    try {
      const result = await service.refreshOddsForAlert(alertId)
      return ok(result)
    } catch (err: any) {
      if (err.message === 'Alert not found') return reply.status(404).send(notFound('Alert not found'))
      return reply.status(500).send(badRequest(err.message))
    }
  })

  // ─── Coverage Audit (Phase D2.1) ──────────────────────────────────────────

  app.get('/odds/audit/fixture/:fixtureId', async (req, reply) => {
    const status = await getOddsStatus()
    if (!status.enabled) return reply.status(400).send(badRequest('Odds disabled'))
    const { fixtureId } = req.params as { fixtureId: string }
    const result = await auditService.auditFixtureOddsCoverage(fixtureId)
    if (!result) return reply.status(404).send(notFound('Fixture not found'))
    return ok(result)
  })

  app.get('/odds/audit/live', async (req, reply) => {
    const status = await getOddsStatus()
    if (!status.enabled) return reply.status(400).send(badRequest('Odds disabled'))
    const { limit } = req.query as { limit?: string }
    const reports = await auditService.auditRecentLiveFixturesOddsCoverage(parseInt(limit || '10'))
    const summary = auditService.summarizeCoverageReports(reports)
    return ok({ summary, reports })
  })
}

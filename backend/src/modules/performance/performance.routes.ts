/**
 * Performance Routes — exposes pattern performance analytics from real data.
 */
import type { FastifyInstance } from 'fastify'
import * as service from './performance.service.js'
import { ok, notFound } from '../../utils/apiResponse.js'

export async function performanceRoutes(app: FastifyInstance) {
  app.get('/performance/patterns', async () => {
    const reports = await service.buildAllPatternPerformance()
    return ok(reports)
  })

  app.get('/performance/patterns/:patternId', async (req, reply) => {
    const { patternId } = req.params as { patternId: string }
    const report = await service.buildPatternPerformance(patternId)
    if (!report) return reply.status(404).send(notFound('Pattern not found'))
    return ok(report)
  })

  app.get('/performance/summary', async () => {
    const summary = await service.buildPerformanceSummary()
    return ok(summary)
  })
}

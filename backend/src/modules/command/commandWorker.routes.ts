/**
 * Pattern Worker Routes — observability endpoints.
 */
import type { FastifyInstance } from 'fastify'
import { getPatternWorkerStatus } from '../../workers/patternEvaluation.worker.js'
import { getResolutionWorkerStatus } from '../../workers/alertResolution.worker.js'
import { ok } from '../../utils/apiResponse.js'

export async function commandWorkerRoutes(app: FastifyInstance) {
  app.get('/pattern-worker/status', async () => {
    return ok(getPatternWorkerStatus())
  })

  app.get('/resolution-worker/status', async () => {
    return ok(getResolutionWorkerStatus())
  })
}

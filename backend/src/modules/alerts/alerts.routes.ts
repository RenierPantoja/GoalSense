import type { FastifyInstance } from 'fastify'
import { createAlertSchema, resolveAlertSchema } from './alert.schemas.js'
import * as service from './alerts.service.js'
import { ok, created, badRequest, notFound } from '../../utils/apiResponse.js'

export async function alertRoutes(app: FastifyInstance) {
  app.get('/alerts', async (req) => {
    const { status, patternId, limit } = req.query as { status?: string; patternId?: string; limit?: string }
    const alerts = await service.listAlerts({ status, patternId, limit: limit ? parseInt(limit) : undefined })
    return ok(alerts)
  })

  app.get('/alerts/:id', async (req) => {
    const { id } = req.params as { id: string }
    const alert = await service.getAlert(id)
    if (!alert) return notFound('Alert not found')
    return ok(alert)
  })

  app.post('/alerts', async (req, reply) => {
    const parsed = createAlertSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send(badRequest('Validation failed', parsed.error.flatten()))
    const alert = await service.createAlert(parsed.data)
    return reply.status(201).send(created(alert))
  })

  app.post('/alerts/:id/resolve', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = resolveAlertSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send(badRequest('Validation failed', parsed.error.flatten()))
    const resolution = await service.resolveAlert(id, parsed.data)
    return ok(resolution)
  })
}

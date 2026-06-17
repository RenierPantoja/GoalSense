import type { FastifyInstance } from 'fastify'
import { createPatternSchema, updatePatternSchema, diagnosePatternSchema } from './pattern.schemas.js'
import * as service from './patterns.service.js'
import { runRadarDiagnostic } from '../command/radarDiagnostic.service.js'
import { ok, created, badRequest, notFound } from '../../utils/apiResponse.js'

export async function patternRoutes(app: FastifyInstance) {
  app.get('/patterns', async () => {
    const patterns = await service.listPatterns()
    return ok(patterns)
  })

  // Read-only engine diagnostic — evaluates a draft against real live snapshots
  // using the worker's evaluator. Writes nothing (no alert/pattern/resolution).
  app.post('/patterns/diagnose', async (req, reply) => {
    const parsed = diagnosePatternSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send(badRequest('Validation failed', parsed.error.flatten()))
    let conditions = parsed.data.conditions
    if (!conditions && parsed.data.conditionsJson) {
      try { conditions = JSON.parse(parsed.data.conditionsJson) } catch { conditions = [] }
    }
    const diagnostic = await runRadarDiagnostic({
      conditions: conditions || [],
      minConfidence: parsed.data.minConfidence,
      severity: parsed.data.severity,
      requireRichData: parsed.data.requireRichData,
      limit: parsed.data.limit,
    })
    return ok(diagnostic)
  })

  app.get('/patterns/:id', async (req) => {
    const { id } = req.params as { id: string }
    const pattern = await service.getPattern(id)
    if (!pattern) return notFound('Pattern not found')
    return ok(pattern)
  })

  app.post('/patterns', async (req, reply) => {
    const parsed = createPatternSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send(badRequest('Validation failed', parsed.error.flatten()))
    const pattern = await service.createPattern(parsed.data)
    return reply.status(201).send(created(pattern))
  })

  app.patch('/patterns/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = updatePatternSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send(badRequest('Validation failed', parsed.error.flatten()))
    const result = await service.updatePattern(id, parsed.data)
    if (result.count === 0) return reply.status(404).send(notFound('Pattern not found'))
    return ok({ id, updated: true })
  })

  app.delete('/patterns/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const result = await service.deletePattern(id)
    if (result.count === 0) return reply.status(404).send(notFound('Pattern not found'))
    return ok({ id, archived: true })
  })
}

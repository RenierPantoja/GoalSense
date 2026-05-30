import type { FastifyInstance } from 'fastify'
import { createPatternSchema, updatePatternSchema } from './pattern.schemas.js'
import * as service from './patterns.service.js'
import { ok, created, badRequest, notFound } from '../../utils/apiResponse.js'

export async function patternRoutes(app: FastifyInstance) {
  app.get('/patterns', async () => {
    const patterns = await service.listPatterns()
    return ok(patterns)
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

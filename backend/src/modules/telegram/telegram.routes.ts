/**
 * Telegram Routes — channel management and manual signal delivery.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as service from './telegram.service.js'
import { ok, created, badRequest, notFound } from '../../utils/apiResponse.js'

const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  chatId: z.string().min(1),
  type: z.enum(['group', 'channel', 'private']).default('group'),
})

const sendAlertSchema = z.object({
  channelId: z.string().min(1),
  confirm: z.literal(true),
})

export async function telegramRoutes(app: FastifyInstance) {
  // Status
  app.get('/telegram/status', async () => {
    const enabled = service.isTelegramEnabled()
    const channels = await service.listChannels()
    return ok({ enabled, configured: enabled && channels.length > 0, channelsCount: channels.length })
  })

  // Channels
  app.get('/telegram/channels', async () => {
    const channels = await service.listChannels()
    return ok(channels)
  })

  app.post('/telegram/channels', async (req, reply) => {
    const parsed = createChannelSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send(badRequest('Validation failed', parsed.error.flatten()))
    const channel = await service.createChannel(parsed.data)
    return reply.status(201).send(created(channel))
  })

  app.delete('/telegram/channels/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      await service.deleteChannel(id)
      return ok({ id, deleted: true })
    } catch {
      return reply.status(404).send(notFound('Channel not found'))
    }
  })

  // Send alert (manual, requires confirm: true)
  app.post('/telegram/send-alert/:alertId', async (req, reply) => {
    const { alertId } = req.params as { alertId: string }
    const parsed = sendAlertSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send(badRequest('Confirmation required', parsed.error.flatten()))

    const result = await service.sendAlertToChannel(alertId, parsed.data.channelId)
    if (!result.success) {
      return reply.status(result.error === 'Alert not found' ? 404 : 400).send(badRequest(result.error || 'Send failed'))
    }
    return ok({ sent: true, deliveryId: result.deliveryId })
  })

  // Deliveries
  app.get('/telegram/deliveries', async (req) => {
    const { alertId } = req.query as { alertId?: string }
    const deliveries = await service.listDeliveries(alertId)
    return ok(deliveries)
  })
}

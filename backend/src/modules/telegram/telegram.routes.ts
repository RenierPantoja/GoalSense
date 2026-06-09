/**
 * Telegram Routes — channel management and manual signal delivery.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as service from './telegram.service.js'
import { createRepositories } from '../../repositories/index.js'
import { ok, created, badRequest, notFound } from '../../utils/apiResponse.js'

const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  chatId: z.string().min(1),
  type: z.enum(['group', 'channel', 'private']).default('group'),
})

const updateChannelRulesSchema = z.object({
  rules: z.object({
    minConfidence: z.number().min(0).max(100).optional(),
    allowedPatternTypes: z.array(z.string()).optional(),
    allowedPatternIds: z.array(z.string()).optional(),
    blockedPatternIds: z.array(z.string()).optional(),
    allowedSources: z.array(z.string()).optional(),
    requireRichData: z.boolean().optional(),
    requireTimedEvents: z.boolean().optional(),
    blockStatsProxy: z.boolean().optional(),
    blockUnknownDataQuality: z.boolean().optional(),
    maxSignalsPerMatch: z.number().min(1).max(50).optional(),
    cooldownMinutes: z.number().min(0).max(1440).optional(),
  }),
})

const sendAlertSchema = z.object({
  channelId: z.string().min(1),
  confirm: z.literal(true),
})

const ignoreQueueItemSchema = z.object({
  channelId: z.string().optional(),
  reason: z.string().optional(),
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

  // Update channel rules
  app.patch('/telegram/channels/:id/rules', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = updateChannelRulesSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send(badRequest('Validation failed', parsed.error.flatten()))

    const repos = createRepositories()
    const channel = await repos.telegram.findChannel(id, 'default')
    if (!channel) return reply.status(404).send(notFound('Channel not found'))

    await repos.telegram.updateChannelRules(id, JSON.stringify(parsed.data.rules))
    return ok({ id, rulesUpdated: true })
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

  // Eligibility preview (no side effects)
  app.get('/telegram/eligibility/:alertId', async (req, reply) => {
    const { alertId } = req.params as { alertId: string }
    const { channelId, includeInactive } = req.query as { channelId?: string, includeInactive?: string }
    const repos = createRepositories()
    const { parseChannelRules, extractAlertMetadata, evaluateAlertAgainstChannelRules } = await import('./telegramChannelRules.service.js')

    const alert = await repos.alerts.findById(alertId, 'default')
    if (!alert) return reply.status(404).send(notFound('Alert not found'))

    let channels = await repos.telegram.listChannels('default')
    if (includeInactive !== 'true') channels = channels.filter((c: any) => c.isActive !== false)
    if (channelId) channels = channels.filter((c: any) => c.id === channelId)
    const alertMeta = extractAlertMetadata(alert as any)

    const results = []
    for (const ch of channels) {
      const rules = parseChannelRules(ch.rulesJson)
      const eligibility = await evaluateAlertAgainstChannelRules(alertMeta, ch.id, rules)

      // Check if already sent
      const existingDelivery = await repos.telegram.findDelivery(alertId, ch.id, 'sent')
      const sentAt = existingDelivery?.sentAt
        ? (typeof existingDelivery.sentAt === 'string' ? existingDelivery.sentAt : existingDelivery.sentAt.toISOString())
        : null

      results.push({
        channelId: ch.id,
        channelName: ch.name,
        eligible: eligibility.eligible,
        blockedReasons: eligibility.blockedReasons,
        warnings: eligibility.warnings,
        alreadySent: !!existingDelivery,
        lastSentAt: sentAt,
      })
    }

    return ok({ alertId, channels: results })
  })

  // Deliveries
  app.get('/telegram/deliveries', async (req) => {
    const { alertId } = req.query as { alertId?: string }
    const deliveries = await service.listDeliveries(alertId)
    return ok(deliveries)
  })

  // ─── Approval Queue ────────────────────────────────────────────────────────
  
  app.get('/telegram/approval-queue', async (req) => {
    const query = req.query as any
    const filters = {
      limit: query.limit ? parseInt(query.limit) : 50,
      minConfidence: query.minConfidence ? parseInt(query.minConfidence) : undefined,
      status: query.status,
      channelId: query.channelId,
      onlyEligible: query.onlyEligible === 'true',
      source: query.source
    }
    const queue = await service.getApprovalQueue(filters)
    return ok(queue)
  })

  app.post('/telegram/approval-queue/:alertId/ignore', async (req, reply) => {
    const { alertId } = req.params as { alertId: string }
    const parsed = ignoreQueueItemSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send(badRequest('Validation failed', parsed.error.flatten()))
    
    const result = await service.ignoreAlertInQueue(alertId, parsed.data.channelId, parsed.data.reason)
    return ok(result)
  })

  app.post('/telegram/approval-queue/:alertId/approve', async (req, reply) => {
    const { alertId } = req.params as { alertId: string }
    const parsed = sendAlertSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send(badRequest('Confirmation required', parsed.error.flatten()))

    const result = await service.sendAlertToChannel(alertId, parsed.data.channelId)
    if (!result.success) {
      return reply.status(result.error === 'Alert not found' ? 404 : 400).send(badRequest(result.error || 'Send failed'))
    }
    return ok({ sent: true, deliveryId: result.deliveryId })
  })
}

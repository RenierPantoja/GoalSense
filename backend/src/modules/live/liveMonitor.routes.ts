/**
 * Live Monitor Routes — observability endpoints for the worker.
 */
import type { FastifyInstance } from 'fastify'
import { prisma } from '../../db/client.js'
import { getLiveMonitorStatus } from '../../workers/liveMonitor.worker.js'
import { ok } from '../../utils/apiResponse.js'

export async function liveMonitorRoutes(app: FastifyInstance) {
  // Worker status
  app.get('/live-monitor/status', async () => {
    return ok(getLiveMonitorStatus())
  })

  // Recent snapshots
  app.get('/live-snapshots/recent', async (req) => {
    const { fixtureId, limit } = req.query as { fixtureId?: string; limit?: string }
    const take = Math.min(parseInt(limit || '20'), 100)

    const snapshots = await prisma.liveSnapshot.findMany({
      where: fixtureId ? { fixtureId } : {},
      orderBy: { capturedAt: 'desc' },
      take,
    })
    return ok(snapshots)
  })

  // Live fixtures from DB
  app.get('/fixtures/live', async () => {
    const liveStatuses = ['1H', '2H', 'HT', 'ET', 'P', 'BT']
    const fixtures = await prisma.fixture.findMany({
      where: { status: { in: liveStatuses } },
      orderBy: { updatedAt: 'desc' },
    })
    return ok(fixtures)
  })

  // Provider health (recent)
  app.get('/provider-health', async (req) => {
    const { provider, limit } = req.query as { provider?: string; limit?: string }
    const take = Math.min(parseInt(limit || '20'), 100)

    const records = await prisma.providerHealth.findMany({
      where: provider ? { provider } : {},
      orderBy: { checkedAt: 'desc' },
      take,
    })
    return ok(records)
  })
}

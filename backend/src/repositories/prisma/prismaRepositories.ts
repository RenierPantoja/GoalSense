/**
 * Prisma Repository Adapters (Phase E1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps the existing Prisma client behind the repository contracts.
 * Behaviour is preserved 1:1 with the current services. No logic change.
 */
import { prisma } from '../../db/client.js'
import type {
  PatternRepository, AlertRepository, AlertResolutionRepository, FixtureRepository,
  LiveSnapshotRepository, ProviderHealthRepository, TelegramRepository, OddsRepository,
  PerformanceRepository, Json,
} from '../contracts.js'

// ─── Pattern ─────────────────────────────────────────────────────────────────

export class PrismaPatternRepository implements PatternRepository {
  listActive(userId: string) { return prisma.pattern.findMany({ where: { userId, status: 'active' } }) }
  // listAll mirrors the legacy listPatterns(): every pattern for the user
  // (including archived), newest-updated first. No status filter.
  listAll(userId: string) { return prisma.pattern.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } }) }
  findById(id: string, userId: string) { return prisma.pattern.findFirst({ where: { id, userId } }) }
  create(input: Json, userId: string) { return prisma.pattern.create({ data: { ...input, userId } as any }) }
  update(id: string, patch: Json, userId: string) { return prisma.pattern.updateMany({ where: { id, userId }, data: patch }) }
  archive(id: string, userId: string) { return prisma.pattern.updateMany({ where: { id, userId }, data: { status: 'archived' } }) }
}

// ─── Alert ───────────────────────────────────────────────────────────────────

export class PrismaAlertRepository implements AlertRepository {
  list(filters: { userId: string; status?: string; patternId?: string; limit?: number }) {
    return prisma.alert.findMany({
      where: { userId: filters.userId, ...(filters.status ? { status: filters.status } : {}), ...(filters.patternId ? { patternId: filters.patternId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 50,
    })
  }
  findById(id: string, userId: string) { return prisma.alert.findFirst({ where: { id, userId } }) }
  listForApprovalQueue(filters: { userId: string; minConfidence?: number; status?: string; sinceMs?: number; limit?: number }) {
    const where: any = { userId: filters.userId }
    if (filters.minConfidence != null) where.confidence = { gte: filters.minConfidence }
    if (filters.status) where.status = filters.status
    where.createdAt = { gte: new Date(Date.now() - (filters.sinceMs ?? 24 * 60 * 60 * 1000)) }
    return prisma.alert.findMany({ where, orderBy: { createdAt: 'desc' }, take: filters.limit || 200 })
  }
  findByFixtureIds(fixtureId: string) { return prisma.alert.findMany({ where: { fixtureId }, select: { id: true }, take: 50 }) }
  findByDuplicateSignature(signature: string, sinceMs: number, userId: string) {
    return prisma.alert.findFirst({ where: { userId, duplicateSignature: signature, createdAt: { gte: new Date(Date.now() - sinceMs) } } })
  }
  findRecentByPatternFixture(patternId: string, fixtureId: string, sinceMs: number, userId: string) {
    return prisma.alert.findFirst({ where: { userId, patternId, fixtureId, createdAt: { gte: new Date(Date.now() - sinceMs) } } })
  }
  create(input: Json, userId: string) { return prisma.alert.create({ data: { ...input, userId } as any }) }
  updateStatus(id: string, status: string) { return prisma.alert.update({ where: { id }, data: { status } }) }
  listPending(userId: string, limit: number) { return prisma.alert.findMany({ where: { userId, status: 'pending' }, orderBy: { createdAt: 'asc' }, take: limit }) }
  listByPatternId(patternId: string, userId: string, limit?: number) { return prisma.alert.findMany({ where: { patternId, userId }, orderBy: { createdAt: 'desc' }, ...(limit ? { take: limit } : {}) }) }
  listAllForUser(userId: string, limit?: number) { return prisma.alert.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, ...(limit ? { take: limit } : {}) }) }
}

// ─── Alert Resolution ──────────────────────────────────────────────────────

export class PrismaAlertResolutionRepository implements AlertResolutionRepository {
  findByAlertId(alertId: string) { return prisma.alertResolution.findFirst({ where: { alertId } }) }
  findByAlertIds(alertIds: string[]) { return prisma.alertResolution.findMany({ where: { alertId: { in: alertIds } } }) }
  create(input: Json) { return prisma.alertResolution.create({ data: input as any }) }
  async resolveAlert(alertId: string, status: string, resolution: Json) {
    const [, res] = await prisma.$transaction([
      prisma.alert.update({ where: { id: alertId }, data: { status } }),
      prisma.alertResolution.create({ data: { alertId, ...resolution } as any }),
    ])
    return res
  }
}

// ─── Fixture ─────────────────────────────────────────────────────────────────

export class PrismaFixtureRepository implements FixtureRepository {
  findById(id: string) { return prisma.fixture.findUnique({ where: { id } }) }
  findByProviderId(provider: string, providerFixtureId: string) { return prisma.fixture.findFirst({ where: { provider, providerFixtureId } }) }
  findByCanonicalKey(canonicalKey: string) { return prisma.fixture.findFirst({ where: { canonicalKey } }) }
  listLive(statuses: string[], limit?: number) { return prisma.fixture.findMany({ where: { status: { in: statuses } }, orderBy: { updatedAt: 'desc' }, ...(limit ? { take: limit } : {}) }) }
  create(input: Json) { return prisma.fixture.create({ data: input as any }) }
  update(id: string, patch: Json) { return prisma.fixture.update({ where: { id }, data: patch }) }
}

// ─── Live Snapshot ─────────────────────────────────────────────────────────

export class PrismaLiveSnapshotRepository implements LiveSnapshotRepository {
  findLatestByFixture(fixtureId: string) { return prisma.liveSnapshot.findFirst({ where: { fixtureId }, orderBy: { capturedAt: 'desc' } }) }
  findAfter(fixtureId: string, afterDate: Date, limit?: number) { return prisma.liveSnapshot.findMany({ where: { fixtureId, capturedAt: { gt: afterDate } }, orderBy: { capturedAt: 'asc' }, take: limit || 50 }) }
  listRecent(filters: { fixtureId?: string; limit?: number }) { return prisma.liveSnapshot.findMany({ where: filters.fixtureId ? { fixtureId: filters.fixtureId } : {}, orderBy: { capturedAt: 'desc' }, take: filters.limit || 20 }) }
  create(input: Json) { return prisma.liveSnapshot.create({ data: input as any }) }
  // ── B32: lifecycle — Prisma schema has no lifecycle columns (db:generate not run).
  // Reads remain unfiltered (all docs are implicitly active); mutating lifecycle is
  // honestly unsupported here (Firebase mode is the primary persistence). No throws.
  listLiveSnapshotsForRetention(params: { limit?: number; includeSoftDeleted?: boolean }) { return prisma.liveSnapshot.findMany({ orderBy: { capturedAt: 'desc' }, take: params.limit || 500 }) }
  async getLiveSnapshotLifecycle(snapshotId: string) { const s = await prisma.liveSnapshot.findUnique({ where: { id: snapshotId } }); return s ? { id: (s as any).id, fixtureId: (s as any).fixtureId, lifecycleState: 'active', deletedAt: null, deletedBy: null, deletionReason: null, markedAt: null, retentionRunId: null } : null }
  async updateLiveSnapshotLifecycle() { return { count: 0 } }
  async markLiveSnapshotForDeletion() { return { count: 0, supported: false } }
  async softDeleteLiveSnapshot() { return { count: 0, supported: false } }
  async restoreSoftDeletedLiveSnapshot() { return { count: 0, supported: false } }
  async hardDeleteLiveSnapshot() { return { count: 0, supported: false } }
}

// ─── Provider Health ─────────────────────────────────────────────────────────

export class PrismaProviderHealthRepository implements ProviderHealthRepository {
  create(input: Json) { return prisma.providerHealth.create({ data: input as any }) }
  listRecent(filters: { provider?: string; limit?: number }) { return prisma.providerHealth.findMany({ where: filters.provider ? { provider: filters.provider } : {}, orderBy: { checkedAt: 'desc' }, take: filters.limit || 20 }) }
}

// ─── Telegram ────────────────────────────────────────────────────────────────

export class PrismaTelegramRepository implements TelegramRepository {
  listChannels(userId: string) { return prisma.telegramChannel.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }) }
  findChannel(id: string, userId: string) { return prisma.telegramChannel.findFirst({ where: { id, userId } }) }
  createChannel(input: Json, userId: string) { return prisma.telegramChannel.create({ data: { ...input, userId } as any }) }
  async deleteChannel(id: string) { await prisma.telegramChannel.delete({ where: { id } }) }
  updateChannelRules(id: string, rulesJson: string) { return prisma.telegramChannel.update({ where: { id }, data: { rulesJson } }) }
  findDelivery(alertId: string, channelId: string, status?: string) { return prisma.signalDelivery.findFirst({ where: { alertId, channelId, ...(status ? { status } : {}) } }) }
  listDeliveries(filters: { userId: string; alertId?: string; limit?: number }) { return prisma.signalDelivery.findMany({ where: { userId: filters.userId, ...(filters.alertId ? { alertId: filters.alertId } : {}) }, orderBy: { createdAt: 'desc' }, take: filters.limit || 50 }) }
  createDelivery(input: Json) { return prisma.signalDelivery.create({ data: input as any }) }
  updateDelivery(id: string, patch: Json) { return prisma.signalDelivery.update({ where: { id }, data: patch }) }
  findRecentDeliveryByChannel(channelId: string, sinceDate: Date) { return prisma.signalDelivery.findFirst({ where: { channelId, status: 'sent', sentAt: { gte: sinceDate } }, orderBy: { sentAt: 'desc' } }) }
  countSentDeliveries(channelId: string, alertIds: string[]) { return prisma.signalDelivery.count({ where: { channelId, status: 'sent', alertId: { in: alertIds } } }) }
}

// ─── Odds ────────────────────────────────────────────────────────────────────

export class PrismaOddsRepository implements OddsRepository {
  createSnapshot(input: Json) { return prisma.oddsSnapshot.create({ data: input as any }) }
  listRecentSnapshots(fixtureId: string, limit?: number) { return prisma.oddsSnapshot.findMany({ where: { fixtureId }, orderBy: { capturedAt: 'desc' }, take: limit || 100 }) }
  findAlertOddsContext(alertId: string, marketType: string) { return prisma.alertOddsContext.findFirst({ where: { alertId, marketType } }) }
  createAlertOddsContext(input: Json) { return prisma.alertOddsContext.create({ data: input as any }) }
}

// ─── Performance (E6.2) ──────────────────────────────────────────────────────
// Prisma mode keeps the on-demand calculation (no counters table). These methods
// are safe no-ops so performance.service always falls back to on-demand in Prisma
// mode. Incremental counters are a Firebase-focused optimization.

export class PrismaPerformanceRepository implements PerformanceRepository {
  async getPatternCounter(_patternId: string, _userId: string) { return null }
  async listPatternCounters(_userId: string) { return [] as Json[] }
  async hasProcessedAlert(_alertId: string, _phase: 'created' | 'resolved') { return false }
  async onAlertCreated(_input: any) { return { applied: false, reason: 'prisma_on_demand' } }
  async applyResolutionToCounters(_input: any) { return { applied: false, reason: 'prisma_on_demand' } }
  async rebuildPatternCounters(_patternId: string, _userId: string) { return null }
}

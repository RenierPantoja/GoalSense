/**
 * Repository Contracts (Phase E1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistence-agnostic interfaces. Services should depend on these, not on
 * Prisma directly. Implementations live in repositories/prisma/ and
 * repositories/firebase/.
 *
 * These mirror the operations currently used by the services. They use
 * loosely-typed records (Record<string, any>) to avoid coupling to Prisma's
 * generated types during the migration foundation phase.
 */

export type Json = Record<string, any>

// ─── Pattern ─────────────────────────────────────────────────────────────────

export interface PatternRepository {
  listActive(userId: string): Promise<Json[]>
  listAll(userId: string): Promise<Json[]>
  findById(id: string, userId: string): Promise<Json | null>
  create(input: Json, userId: string): Promise<Json>
  update(id: string, patch: Json, userId: string): Promise<{ count: number }>
  archive(id: string, userId: string): Promise<{ count: number }>
}

// ─── Alert ───────────────────────────────────────────────────────────────────

export interface AlertRepository {
  list(filters: { userId: string; status?: string; patternId?: string; limit?: number }): Promise<Json[]>
  listForApprovalQueue(filters: { userId: string; minConfidence?: number; status?: string; sinceMs?: number; limit?: number }): Promise<Json[]>
  findById(id: string, userId: string): Promise<Json | null>
  findByFixtureIds(fixtureId: string): Promise<Json[]>
  findByDuplicateSignature(signature: string, sinceMs: number, userId: string): Promise<Json | null>
  findRecentByPatternFixture(patternId: string, fixtureId: string, sinceMs: number, userId: string): Promise<Json | null>
  create(input: Json, userId: string): Promise<Json>
  updateStatus(id: string, status: string): Promise<Json>
  listPending(userId: string, limit: number): Promise<Json[]>
}

// ─── Alert Resolution ──────────────────────────────────────────────────────

export interface AlertResolutionRepository {
  findByAlertId(alertId: string): Promise<Json | null>
  findByAlertIds(alertIds: string[]): Promise<Json[]>
  create(input: Json): Promise<Json>
  /** Atomic: update alert status + create resolution */
  resolveAlert(alertId: string, status: string, resolution: Json): Promise<Json>
}

// ─── Fixture ─────────────────────────────────────────────────────────────────

export interface FixtureRepository {
  findById(id: string): Promise<Json | null>
  findByProviderId(provider: string, providerFixtureId: string): Promise<Json | null>
  findByCanonicalKey(canonicalKey: string): Promise<Json | null>
  listLive(statuses: string[], limit?: number): Promise<Json[]>
  create(input: Json): Promise<Json>
  update(id: string, patch: Json): Promise<Json>
}

// ─── Live Snapshot ─────────────────────────────────────────────────────────

export interface LiveSnapshotRepository {
  findLatestByFixture(fixtureId: string): Promise<Json | null>
  findAfter(fixtureId: string, afterDate: Date, limit?: number): Promise<Json[]>
  listRecent(filters: { fixtureId?: string; limit?: number }): Promise<Json[]>
  create(input: Json): Promise<Json>
}

// ─── Provider Health ─────────────────────────────────────────────────────────

export interface ProviderHealthRepository {
  create(input: Json): Promise<Json>
  listRecent(filters: { provider?: string; limit?: number }): Promise<Json[]>
}

// ─── Telegram ────────────────────────────────────────────────────────────────

export interface TelegramRepository {
  listChannels(userId: string): Promise<Json[]>
  findChannel(id: string, userId: string): Promise<Json | null>
  createChannel(input: Json, userId: string): Promise<Json>
  deleteChannel(id: string): Promise<void>
  updateChannelRules(id: string, rulesJson: string): Promise<Json>
  // Deliveries
  findDelivery(alertId: string, channelId: string, status?: string): Promise<Json | null>
  listDeliveries(filters: { userId: string; alertId?: string; limit?: number }): Promise<Json[]>
  createDelivery(input: Json): Promise<Json>
  updateDelivery(id: string, patch: Json): Promise<Json>
  findRecentDeliveryByChannel(channelId: string, sinceDate: Date): Promise<Json | null>
  countSentDeliveries(channelId: string, alertIds: string[]): Promise<number>
}

// ─── Odds ────────────────────────────────────────────────────────────────────

export interface OddsRepository {
  createSnapshot(input: Json): Promise<Json>
  listRecentSnapshots(fixtureId: string, limit?: number): Promise<Json[]>
  findAlertOddsContext(alertId: string, marketType: string): Promise<Json | null>
  createAlertOddsContext(input: Json): Promise<Json>
}

// ─── Aggregate ─────────────────────────────────────────────────────────────

export interface Repositories {
  patterns: PatternRepository
  alerts: AlertRepository
  alertResolutions: AlertResolutionRepository
  fixtures: FixtureRepository
  liveSnapshots: LiveSnapshotRepository
  providerHealth: ProviderHealthRepository
  telegram: TelegramRepository
  odds: OddsRepository
}

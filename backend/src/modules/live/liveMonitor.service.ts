/**
 * Live Monitor Service — captures live fixture snapshots into the database.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase B6: Observation only. No alerts generated.
 */
import { prisma } from '../../db/client.js'
import type { ProviderFixture, ProviderFetchResult } from '../../providers/provider.types.js'
import { buildCanonicalKey, shouldUpdateStatus } from '../fixtures/fixtureIdentity.service.js'

// ─── Fixture Upsert ──────────────────────────────────────────────────────────

export async function upsertFixture(pf: ProviderFixture) {
  const canonicalKey = buildCanonicalKey(pf.homeTeam, pf.awayTeam, pf.startTime)

  // Try to find by provider + providerFixtureId first
  const existing = await prisma.fixture.findFirst({
    where: { provider: pf.provider, providerFixtureId: pf.providerFixtureId },
  })

  if (existing) {
    // Only update if status doesn't regress
    if (shouldUpdateStatus(existing.status, pf.status)) {
      await prisma.fixture.update({
        where: { id: existing.id },
        data: {
          status: pf.status,
          canonicalKey,
          homeName: pf.homeTeam,
          awayName: pf.awayTeam,
          competition: pf.competition,
        },
      })
    }
    return existing.id
  }

  // Try by canonical key (cross-provider dedup)
  const byKey = await prisma.fixture.findFirst({ where: { canonicalKey } })
  if (byKey) {
    if (shouldUpdateStatus(byKey.status, pf.status)) {
      await prisma.fixture.update({
        where: { id: byKey.id },
        data: { status: pf.status },
      })
    }
    return byKey.id
  }

  // Create new
  const created = await prisma.fixture.create({
    data: {
      provider: pf.provider,
      providerFixtureId: pf.providerFixtureId,
      canonicalKey,
      homeName: pf.homeTeam,
      awayName: pf.awayTeam,
      competition: pf.competition,
      status: pf.status,
      startTime: new Date(pf.startTime),
    },
  })
  return created.id
}

// ─── Snapshot Capture ────────────────────────────────────────────────────────

export interface SnapshotDecision {
  shouldStore: boolean
  reason: string
}

export function shouldStoreSnapshot(
  lastSnapshot: { minute: number | null; scoreHome: number; scoreAway: number; status: string } | null,
  incoming: ProviderFixture,
): SnapshotDecision {
  if (!lastSnapshot) return { shouldStore: true, reason: 'first_snapshot' }
  if (lastSnapshot.status !== incoming.status) return { shouldStore: true, reason: 'status_changed' }
  if (lastSnapshot.scoreHome !== incoming.scoreHome || lastSnapshot.scoreAway !== incoming.scoreAway) return { shouldStore: true, reason: 'score_changed' }
  if (lastSnapshot.minute !== incoming.minute && incoming.minute !== null) return { shouldStore: true, reason: 'minute_changed' }
  return { shouldStore: false, reason: 'no_change' }
}

function assessDataQuality(pf: ProviderFixture): 'rich' | 'partial' | 'poor' {
  if (pf.stats?.shotsOnTarget && pf.stats?.possession) return 'rich'
  if (pf.stats) return 'partial'
  return 'poor'
}

export async function captureLiveSnapshot(fixtureId: string, pf: ProviderFixture): Promise<boolean> {
  // Get last snapshot for this fixture to decide if we should store
  const lastSnapshot = await prisma.liveSnapshot.findFirst({
    where: { fixtureId },
    orderBy: { capturedAt: 'desc' },
    select: { minute: true, scoreHome: true, scoreAway: true, status: true },
  })

  const decision = shouldStoreSnapshot(lastSnapshot, pf)
  if (!decision.shouldStore) return false

  await prisma.liveSnapshot.create({
    data: {
      fixtureId,
      minute: pf.minute,
      status: pf.status,
      scoreHome: pf.scoreHome,
      scoreAway: pf.scoreAway,
      penaltyHome: pf.penaltyHome,
      penaltyAway: pf.penaltyAway,
      dataQuality: assessDataQuality(pf),
      provider: pf.provider,
      statsJson: pf.stats ? JSON.stringify(pf.stats) : null,
      eventsJson: pf.events ? JSON.stringify(pf.events) : null,
    },
  })
  return true
}

// ─── Batch Process ───────────────────────────────────────────────────────────

export interface MonitorRunResult {
  fixturesSeen: number
  snapshotsCreated: number
  errors: string[]
}

export async function processLiveFixtures(fixtures: ProviderFixture[]): Promise<MonitorRunResult> {
  let snapshotsCreated = 0
  const errors: string[] = []

  for (const pf of fixtures) {
    try {
      const fixtureId = await upsertFixture(pf)
      const stored = await captureLiveSnapshot(fixtureId, pf)
      if (stored) snapshotsCreated++
    } catch (err: any) {
      errors.push(`${pf.homeTeam} vs ${pf.awayTeam}: ${err?.message || 'unknown'}`)
    }
  }

  return { fixturesSeen: fixtures.length, snapshotsCreated, errors }
}

// ─── Provider Health ─────────────────────────────────────────────────────────

export async function recordProviderHealth(result: ProviderFetchResult) {
  await prisma.providerHealth.create({
    data: {
      provider: result.provider,
      endpoint: result.endpoint,
      status: result.success ? 'ok' : (result.error?.includes('timeout') ? 'degraded' : 'down'),
      latencyMs: result.latencyMs,
      errorMessage: result.error || null,
    },
  })
}

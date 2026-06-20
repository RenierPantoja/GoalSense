/**
 * Live Monitor Service — captures live fixture snapshots via the repository layer.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase B6.1: Enriched snapshots with stats + timed events from ESPN summary.
 * Phase E4: Fixtures + LiveSnapshots persist through repos (Prisma or Firebase).
 */
import { env } from '../../env.js'
import { createRepositories } from '../../repositories/index.js'
import type { ProviderFixture, ProviderFetchResult } from '../../providers/provider.types.js'
import { fetchEspnSummary, extractEspnStats, extractEspnTimedEvents, extractEspnShootoutEvents, type LiveMatchStats, type BackendTimedEvent, type ShootoutEvent } from '../../providers/espn.provider.js'
import { buildCanonicalKey, shouldUpdateStatus } from '../fixtures/fixtureIdentity.service.js'
import { applyFixtureCap, guardProviderCall, guardSnapshotWrite } from '../localops/livePipelineGuard.service.js'
import type { SnapshotState } from '../localops/utils/localOps.util.js'

// ─── Fixture Upsert ──────────────────────────────────────────────────────────

export async function upsertFixture(pf: ProviderFixture) {
  const repos = createRepositories()
  const canonicalKey = buildCanonicalKey(pf.homeTeam, pf.awayTeam, pf.startTime)

  // Try to find by provider + providerFixtureId first
  const existing = await repos.fixtures.findByProviderId(pf.provider, pf.providerFixtureId)

  if (existing) {
    // Only update if status doesn't regress
    if (shouldUpdateStatus(existing.status, pf.status)) {
      await repos.fixtures.update(existing.id, {
        status: pf.status,
        canonicalKey,
        homeName: pf.homeTeam,
        awayName: pf.awayTeam,
        competition: pf.competition,
      })
    }
    return existing.id
  }

  // Try by canonical key (cross-provider dedup)
  const byKey = await repos.fixtures.findByCanonicalKey(canonicalKey)
  if (byKey) {
    if (shouldUpdateStatus(byKey.status, pf.status)) {
      await repos.fixtures.update(byKey.id, { status: pf.status })
    }
    return byKey.id
  }

  // Create new
  const created = await repos.fixtures.create({
    provider: pf.provider,
    providerFixtureId: pf.providerFixtureId,
    canonicalKey,
    homeName: pf.homeTeam,
    awayName: pf.awayTeam,
    competition: pf.competition,
    status: pf.status,
    startTime: new Date(pf.startTime),
  })
  return created.id
}

// ─── Snapshot Capture ────────────────────────────────────────────────────────

export interface SnapshotDecision {
  shouldStore: boolean
  reason: string
}

export function shouldStoreSnapshot(
  lastSnapshot: { minute: number | null; scoreHome: number; scoreAway: number; status: string; statsJson?: string | null; eventsJson?: string | null } | null,
  incoming: ProviderFixture,
  enrichedEvents?: BackendTimedEvent[] | null,
): SnapshotDecision {
  if (!lastSnapshot) return { shouldStore: true, reason: 'first_snapshot' }
  if (lastSnapshot.status !== incoming.status) return { shouldStore: true, reason: 'status_changed' }
  if (lastSnapshot.scoreHome !== incoming.scoreHome || lastSnapshot.scoreAway !== incoming.scoreAway) return { shouldStore: true, reason: 'score_changed' }
  if (lastSnapshot.minute !== incoming.minute && incoming.minute !== null) return { shouldStore: true, reason: 'minute_changed' }

  // Check if enriched events added new data
  if (enrichedEvents && enrichedEvents.length > 0) {
    let lastEventsCount = 0
    if (lastSnapshot.eventsJson) {
      try { lastEventsCount = (JSON.parse(lastSnapshot.eventsJson) as any[]).length } catch { /* malformed JSON, treat as 0 */ }
    }
    if (enrichedEvents.length > lastEventsCount) return { shouldStore: true, reason: 'new_events' }
  }

  return { shouldStore: false, reason: 'no_change' }
}

function assessDataQuality(stats: LiveMatchStats | null, events: BackendTimedEvent[] | null): 'rich' | 'partial' | 'poor' {
  const hasStats = stats && (stats.shotsOnTargetHome !== undefined || stats.possessionHome !== undefined)
  const hasEvents = events && events.length > 0
  if (hasStats && hasEvents) return 'rich'
  if (hasStats || hasEvents) return 'partial'
  return 'poor'
}

/** B31: map a provider fixture (+ enriched payloads) to the guard's SnapshotState. */
function buildSnapshotState(pf: ProviderFixture, stats: unknown, events: unknown): SnapshotState {
  const eventsArr = Array.isArray(events) ? events : null
  return {
    minute: pf.minute,
    status: pf.status,
    scoreHome: pf.scoreHome,
    scoreAway: pf.scoreAway,
    eventsCount: eventsArr ? eventsArr.length : null,
    statsFingerprint: stats ? JSON.stringify(stats) : null,
  }
}

export async function captureLiveSnapshot(
  fixtureId: string,
  pf: ProviderFixture,
  enrichedStats?: LiveMatchStats | null,
  enrichedEvents?: BackendTimedEvent[] | null,
): Promise<boolean> {
  const repos = createRepositories()

  // Get last snapshot for this fixture to decide if we should store
  const lastSnapshot = await repos.liveSnapshots.findLatestByFixture(fixtureId)

  const decision = shouldStoreSnapshot(lastSnapshot as any, pf, enrichedEvents)
  if (!decision.shouldStore) return false

  const stats = enrichedStats || pf.stats
  const events = enrichedEvents || pf.events
  const dataQuality = assessDataQuality(enrichedStats || null, enrichedEvents || null)

  // B31: live pipeline snapshot-write guard (throttle / dedup / per-match cap).
  // A skipped snapshot is NEVER a failure. Score/status/event changes always pass;
  // observe mode writes anyway. Disabled/observe by default → no behavior change.
  const guard = guardSnapshotWrite(fixtureId, buildSnapshotState(pf, stats, events))
  if (!guard.shouldWrite) return false

  await repos.liveSnapshots.create({
    fixtureId,
    minute: pf.minute,
    status: pf.status,
    scoreHome: pf.scoreHome,
    scoreAway: pf.scoreAway,
    penaltyHome: pf.penaltyHome,
    penaltyAway: pf.penaltyAway,
    dataQuality,
    provider: pf.provider,
    statsJson: stats ? JSON.stringify(stats) : null,
    eventsJson: events ? JSON.stringify(events) : null,
  })
  return true
}

// ─── Batch Process ───────────────────────────────────────────────────────────

export interface MonitorRunResult {
  fixturesSeen: number
  fixturesSkippedByCap: number
  snapshotsCreated: number
  summariesFetched: number
  summariesFailed: number
  summariesSkippedByBudget: number
  richSnapshots: number
  partialSnapshots: number
  poorSnapshots: number
  errors: string[]
}

/**
 * Select fixtures eligible for summary enrichment.
 * Prioritizes live matches, limits to configured max.
 */
function selectFixturesForEnrichment(fixtures: ProviderFixture[]): ProviderFixture[] {
  if (env.SUMMARY_ENRICHMENT_ENABLED !== 'true') return []
  const liveStatuses = new Set(['1H', '2H', 'HT', 'ET', 'P', 'BT'])
  const live = fixtures.filter(f => liveStatuses.has(f.status))
  return live.slice(0, env.SUMMARY_ENRICHMENT_MAX_FIXTURES)
}

export async function processLiveFixtures(fixtures: ProviderFixture[]): Promise<MonitorRunResult> {
  let snapshotsCreated = 0
  let summariesFetched = 0
  let summariesFailed = 0
  let summariesSkippedByBudget = 0
  let richSnapshots = 0
  let partialSnapshots = 0
  let poorSnapshots = 0
  const errors: string[] = []

  // B31: apply the local live-fixture cap (skipped-by-cap is NOT a failure).
  const cap = applyFixtureCap(fixtures)
  const toProcess = cap.selected

  // Determine which fixtures get enrichment
  const enrichmentSet = new Set(selectFixturesForEnrichment(toProcess).map(f => f.providerFixtureId))

  for (const pf of toProcess) {
    try {
      const fixtureId = await upsertFixture(pf)

      let enrichedStats: LiveMatchStats | null = null
      let enrichedEvents: BackendTimedEvent[] | null = null

      // Fetch summary for eligible fixtures
      if (enrichmentSet.has(pf.providerFixtureId) && pf.provider === 'espn') {
        // B31: consult the provider budget before the per-fixture detail call.
        // Blocked-by-budget is NOT a failure — base snapshot still proceeds.
        const budget = guardProviderCall('espn', 'fixture_detail')
        if (budget.blockedByProviderBudget) {
          summariesSkippedByBudget++
        } else {
          const summaryResult = await fetchEspnSummary(pf.providerFixtureId)
          if (summaryResult.success && summaryResult.data) {
            summariesFetched++
            enrichedStats = extractEspnStats(summaryResult.data)
            enrichedEvents = extractEspnTimedEvents(summaryResult.data, pf.homeTeam, pf.awayTeam)
          } else {
            summariesFailed++
          }
        }
      }

      const stored = await captureLiveSnapshot(fixtureId, pf, enrichedStats, enrichedEvents)
      if (stored) {
        snapshotsCreated++
        const quality = assessDataQuality(enrichedStats, enrichedEvents)
        if (quality === 'rich') richSnapshots++
        else if (quality === 'partial') partialSnapshots++
        else poorSnapshots++
      }
    } catch (err: any) {
      errors.push(`${pf.homeTeam} vs ${pf.awayTeam}: ${err?.message || 'unknown'}`)
    }
  }

  return { fixturesSeen: fixtures.length, fixturesSkippedByCap: cap.skippedByCap, snapshotsCreated, summariesFetched, summariesFailed, summariesSkippedByBudget, richSnapshots, partialSnapshots, poorSnapshots, errors }
}

// ─── Provider Health ─────────────────────────────────────────────────────────

export async function recordProviderHealth(result: ProviderFetchResult) {
  const repos = createRepositories()
  await repos.providerHealth.create({
    provider: result.provider,
    endpoint: result.endpoint,
    status: result.success ? 'ok' : (result.error?.includes('timeout') ? 'degraded' : 'down'),
    latencyMs: result.latencyMs,
    errorMessage: result.error || null,
  })
}

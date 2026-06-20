/**
 * Snapshot Write Guard (Phase B30) — dedup + min-interval + per-match cap.
 * ─────────────────────────────────────────────────────────────────────────────
 * Decides whether a new live snapshot is worth persisting. In-memory per-fixture
 * tracking of the last written state. A skipped snapshot is NEVER a failure — it
 * just means nothing relevant changed. Backtest/replay keep what they need.
 */
import { env } from '../../env.js'
import { decideSnapshotWrite, type SnapshotState, type SnapshotDecision } from './utils/localOps.util.js'

interface Tracked { state: SnapshotState; atMs: number; countThisMatch: number; matchKey: string }
const tracked = new Map<string, Tracked>()
let totalWrites = 0
let totalSkips = 0
const skipReasons = new Map<string, number>()

/** A match key changes when a fixture's status resets (new match) — coarse via status+score reset. */
function matchKeyFor(fixtureId: string): string { return fixtureId }

/**
 * Evaluate (and, when allowed, register) a snapshot write for a fixture. Pass
 * `commit=false` to only preview the decision without updating internal state.
 */
export function evaluateSnapshot(fixtureId: string, current: SnapshotState, now: number = Date.now(), commit = true): SnapshotDecision {
  const prev = tracked.get(fixtureId)
  const decision = decideSnapshotWrite({
    current,
    last: prev ? { state: prev.state, atMs: prev.atMs } : null,
    nowMs: now,
    minIntervalSeconds: env.LOCAL_MIN_SNAPSHOT_INTERVAL_SECONDS,
    countThisMatch: prev?.countThisMatch ?? 0,
    maxPerMatch: env.LOCAL_MAX_SNAPSHOTS_PER_FIXTURE_PER_MATCH,
  })
  if (commit) {
    if (decision.shouldWrite) {
      tracked.set(fixtureId, { state: current, atMs: now, countThisMatch: (prev?.countThisMatch ?? 0) + 1, matchKey: matchKeyFor(fixtureId) })
      totalWrites++
    } else {
      totalSkips++
      if (decision.skippedReason) skipReasons.set(decision.skippedReason, (skipReasons.get(decision.skippedReason) || 0) + 1)
    }
  }
  return decision
}

export function getSnapshotGuardStatus() {
  return {
    limits: { minIntervalSeconds: env.LOCAL_MIN_SNAPSHOT_INTERVAL_SECONDS, maxPerFixturePerMatch: env.LOCAL_MAX_SNAPSHOTS_PER_FIXTURE_PER_MATCH },
    trackedFixtures: tracked.size,
    totalWrites,
    totalSkips,
    skipReasons: Object.fromEntries(skipReasons),
    generatedAt: new Date().toISOString(),
  }
}

export function resetSnapshotGuardCounters(): void { tracked.clear(); totalWrites = 0; totalSkips = 0; skipReasons.clear() }

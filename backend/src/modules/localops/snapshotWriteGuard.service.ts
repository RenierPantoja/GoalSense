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

/**
 * B31: register an ACTUAL write (updates the tracked last-state + per-match count).
 * Used by the live pipeline guard which previews with `evaluateSnapshot(commit=false)`
 * and then commits the real write decision here (so the tracker never drifts, even
 * when observe-mode writes a snapshot the decision would have skipped).
 */
export function commitWrite(fixtureId: string, state: SnapshotState, now: number = Date.now()): void {
  const prev = tracked.get(fixtureId)
  tracked.set(fixtureId, { state, atMs: now, countThisMatch: (prev?.countThisMatch ?? 0) + 1, matchKey: matchKeyFor(fixtureId) })
  totalWrites++
}

/** B31: register a REAL skip (enforce mode). A skip is never a failure. */
export function registerSkip(reason: string | null): void {
  totalSkips++
  if (reason) skipReasons.set(reason, (skipReasons.get(reason) || 0) + 1)
}

/** B31: per-match snapshot count already written for a fixture (0 if unknown). */
export function getCountThisMatch(fixtureId: string): number {
  return tracked.get(fixtureId)?.countThisMatch ?? 0
}

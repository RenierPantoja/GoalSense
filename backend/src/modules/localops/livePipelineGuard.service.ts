/**
 * Live Pipeline Guard (Phase B31) — wires the B30 guards into the real path.
 * ─────────────────────────────────────────────────────────────────────────────
 * Central, flag-gated integration of provider-budget, live-fixture-cap and
 * snapshot-write guards. Two modes:
 *   - observe : compute decisions + record metrics, but DO NOT block.
 *   - enforce : actually block provider calls / skip snapshots / cap fixtures.
 * A blocked provider call is NOT a failure; a skipped snapshot is NOT a failure.
 * All counters are in-memory (per process, reset on restart). No secrets logged.
 */
import { env } from '../../env.js'
import { recordProviderCall, type ProviderOperation } from './providerUsageGuard.service.js'
import { evaluateSnapshot, commitWrite, registerSkip } from './snapshotWriteGuard.service.js'
import { resolveGuardMode, recommendedGuardMode, type GuardMode, type SnapshotState } from './utils/localOps.util.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'

// ── Config resolution ────────────────────────────────────────────────────────

export function getGuardMode(): GuardMode { return resolveGuardMode(env.LOCAL_RUNTIME_PROFILE, env.LOCAL_OPS_GUARD_MODE) }
export function isProviderGuardEnabled(): boolean { return flag(env.ENABLE_PROVIDER_USAGE_GUARD) }
export function isSnapshotGuardEnabled(): boolean { return flag(env.ENABLE_SNAPSHOT_WRITE_GUARD) }
export function isFixtureCapEnabled(): boolean { return flag(env.ENABLE_LIVE_FIXTURE_CAP) }
export function isRetentionEnabled(): boolean { return flag(env.ENABLE_SNAPSHOT_RETENTION) }
export function isRetentionDryRun(): boolean { return flag(env.SNAPSHOT_RETENTION_DRY_RUN) }

// ── In-memory metrics ────────────────────────────────────────────────────────

let providerCallsAllowed = 0
let providerCallsBlocked = 0
let fixturesObserved = 0
let fixturesSkippedByCap = 0
let snapshotsWritten = 0
let snapshotsSkippedDuplicate = 0
let snapshotsSkippedInterval = 0
let snapshotsSkippedMaxPerFixture = 0
let snapshotsSkippedNoRelevantChange = 0
let snapshotsProtectedForReplay = 0
let lastProviderBlockAt: string | null = null
let lastSnapshotSkipAt: string | null = null
let lastGuardBlockAt: string | null = null

export function resetGuardMetrics(): void {
  providerCallsAllowed = 0; providerCallsBlocked = 0
  fixturesObserved = 0; fixturesSkippedByCap = 0
  snapshotsWritten = 0; snapshotsSkippedDuplicate = 0; snapshotsSkippedInterval = 0
  snapshotsSkippedMaxPerFixture = 0; snapshotsSkippedNoRelevantChange = 0; snapshotsProtectedForReplay = 0
  lastProviderBlockAt = null; lastSnapshotSkipAt = null; lastGuardBlockAt = null
}

// ── Safe, rate-limited logging ───────────────────────────────────────────────

const LOG_THROTTLE_MS = 30_000
const lastLogAt = new Map<string, number>()
function safeLog(key: string, message: string): void {
  if (!flag(env.ENABLE_LOCAL_OPS_GUARD_LOGGING)) return
  const now = Date.now()
  if (now - (lastLogAt.get(key) || 0) < LOG_THROTTLE_MS) return
  lastLogAt.set(key, now)
  // No payloads, no tokens — compact operational line only.
  console.log(`[GuardB31] ${message}`)
}

// ── Provider budget guard ────────────────────────────────────────────────────

export interface ProviderGuardResult {
  allowed: boolean
  blockedByProviderBudget: boolean
  mode: GuardMode
  reason: string | null
  retryAfterEstimateSeconds: number | null
}

/**
 * Consult the provider budget before an external call. In `observe` mode (or when
 * the guard is disabled) the call is always allowed; the over-budget intent is
 * still counted so the panel shows what enforcement WOULD do.
 */
export function guardProviderCall(provider: string, operation: ProviderOperation): ProviderGuardResult {
  const mode = getGuardMode()
  const decision = recordProviderCall(provider, operation)
  if (decision.allowed) {
    providerCallsAllowed++
    return { allowed: true, blockedByProviderBudget: false, mode, reason: null, retryAfterEstimateSeconds: null }
  }
  providerCallsBlocked++
  lastProviderBlockAt = new Date().toISOString()
  lastGuardBlockAt = lastProviderBlockAt
  const retry = decision.reason === 'minute_limit' ? 60 : 3600
  const enforce = isProviderGuardEnabled() && mode === 'enforce'
  if (enforce) {
    safeLog(`prov_block_${operation}`, `provider call blocked op=${operation} reason=${decision.reason} mode=enforce`)
    return { allowed: false, blockedByProviderBudget: true, mode, reason: decision.reason, retryAfterEstimateSeconds: retry }
  }
  safeLog(`prov_observe_${operation}`, `provider over budget op=${operation} reason=${decision.reason} mode=observe (not blocking)`)
  return { allowed: true, blockedByProviderBudget: false, mode, reason: decision.reason, retryAfterEstimateSeconds: null }
}

// ── Live fixture cap ─────────────────────────────────────────────────────────

export interface FixtureCapResult<T> { selected: T[]; skippedByCap: number; cap: number; applied: boolean }

/**
 * Cap the number of live fixtures processed locally. Order is preserved (caller
 * may pre-sort by priority). In `observe` mode nothing is dropped — the would-skip
 * count is still reported. Skipped-by-cap is NEVER a failure.
 */
export function applyFixtureCap<T>(fixtures: T[]): FixtureCapResult<T> {
  const cap = env.LOCAL_MAX_LIVE_FIXTURES
  const mode = getGuardMode()
  fixturesObserved += fixtures.length
  if (!isFixtureCapEnabled() || fixtures.length <= cap) {
    return { selected: fixtures, skippedByCap: 0, cap, applied: false }
  }
  const wouldSkip = fixtures.length - cap
  // Cap applies in both modes by default (cheapest, safest guard) — but in
  // observe mode we only report the would-skip without dropping data.
  if (mode === 'observe') {
    safeLog('fixture_cap_observe', `fixture cap would skip ${wouldSkip} (mode=observe, not dropping)`)
    return { selected: fixtures, skippedByCap: 0, cap, applied: false }
  }
  fixturesSkippedByCap += wouldSkip
  lastGuardBlockAt = new Date().toISOString()
  safeLog('fixture_cap_enforce', `fixture cap dropped ${wouldSkip} beyond ${cap} (mode=enforce)`)
  return { selected: fixtures.slice(0, cap), skippedByCap: wouldSkip, cap, applied: true }
}

// ── Snapshot write guard ─────────────────────────────────────────────────────

export interface SnapshotGuardResult {
  shouldWrite: boolean
  mode: GuardMode
  skippedReason: string | null
  enforced: boolean
}

/**
 * Decide whether to persist a live snapshot. Score/status/event changes always
 * pass. `evidenceForAlert` forces a write (an opportunity/alert needs evidence).
 * In observe mode a would-skip is written anyway (and committed to the tracker).
 */
export function guardSnapshotWrite(
  fixtureId: string,
  state: SnapshotState,
  opts?: { evidenceForAlert?: boolean },
): SnapshotGuardResult {
  const mode = getGuardMode()
  const now = Date.now()

  if (opts?.evidenceForAlert) {
    commitWrite(fixtureId, state, now)
    snapshotsWritten++
    snapshotsProtectedForReplay++
    return { shouldWrite: true, mode, skippedReason: null, enforced: false }
  }

  const decision = evaluateSnapshot(fixtureId, state, now, false) // preview only
  if (decision.shouldWrite) {
    commitWrite(fixtureId, state, now)
    snapshotsWritten++
    return { shouldWrite: true, mode, skippedReason: null, enforced: false }
  }

  // Would skip.
  const enforce = isSnapshotGuardEnabled() && mode === 'enforce'
  if (enforce) {
    lastSnapshotSkipAt = new Date().toISOString()
    registerSkip(decision.skippedReason)
    countSkip(decision.skippedReason)
    safeLog(`snap_skip_${decision.skippedReason}`, `snapshot skipped fixture=${fixtureId} reason=${decision.skippedReason} mode=enforce`)
    return { shouldWrite: false, mode, skippedReason: decision.skippedReason, enforced: true }
  }
  // observe / disabled → write anyway (commit to keep tracker accurate).
  commitWrite(fixtureId, state, now)
  snapshotsWritten++
  safeLog('snap_observe', `snapshot would skip reason=${decision.skippedReason} mode=observe (writing anyway)`)
  return { shouldWrite: true, mode, skippedReason: decision.skippedReason, enforced: false }
}

function countSkip(reason: string | null): void {
  switch (reason) {
    case 'no_relevant_change':
      snapshotsSkippedNoRelevantChange++; snapshotsSkippedDuplicate++; break
    case 'min_interval_not_elapsed':
      snapshotsSkippedInterval++; break
    case 'max_per_match_reached':
      snapshotsSkippedMaxPerFixture++; break
    default: break
  }
}

/** Allow the retention service to feed its last plan summary into the metrics. */
let retentionSummary = { candidates: 0, protectedRecords: 0, generatedAt: null as string | null }
export function setRetentionSummary(candidates: number, protectedRecords: number): void {
  retentionSummary = { candidates, protectedRecords, generatedAt: new Date().toISOString() }
}

// ── Metrics + runtime summary ────────────────────────────────────────────────

export interface GuardMetrics {
  guardMode: GuardMode
  recommendedGuardMode: GuardMode
  providerGuardEnabled: boolean
  snapshotGuardEnabled: boolean
  fixtureCapEnabled: boolean
  retentionEnabled: boolean
  retentionDryRun: boolean
  providerCallsAllowed: number
  providerCallsBlocked: number
  fixturesObserved: number
  fixturesSkippedByCap: number
  snapshotsWritten: number
  snapshotsSkippedDuplicate: number
  snapshotsSkippedInterval: number
  snapshotsSkippedMaxPerFixture: number
  snapshotsSkippedNoRelevantChange: number
  snapshotsProtectedForReplay: number
  retentionCandidates: number
  retentionProtected: number
  lastProviderBlockAt: string | null
  lastSnapshotSkipAt: string | null
  lastGuardBlockAt: string | null
  recommendedAction: string | null
  generatedAt: string
}

export function getGuardMetrics(): GuardMetrics {
  const mode = getGuardMode()
  const rec = recommendedGuardMode(env.LOCAL_RUNTIME_PROFILE)
  let recommendedAction: string | null = null
  if (mode !== rec) recommendedAction = `Perfil ${env.LOCAL_RUNTIME_PROFILE} recomenda modo "${rec}" (atual: ${mode}).`
  else if (mode === 'enforce' && !isProviderGuardEnabled() && !isSnapshotGuardEnabled()) recommendedAction = 'Modo enforce sem guards habilitados — nada será bloqueado.'
  return {
    guardMode: mode,
    recommendedGuardMode: rec,
    providerGuardEnabled: isProviderGuardEnabled(),
    snapshotGuardEnabled: isSnapshotGuardEnabled(),
    fixtureCapEnabled: isFixtureCapEnabled(),
    retentionEnabled: isRetentionEnabled(),
    retentionDryRun: isRetentionDryRun(),
    providerCallsAllowed, providerCallsBlocked,
    fixturesObserved, fixturesSkippedByCap,
    snapshotsWritten, snapshotsSkippedDuplicate, snapshotsSkippedInterval,
    snapshotsSkippedMaxPerFixture, snapshotsSkippedNoRelevantChange, snapshotsProtectedForReplay,
    retentionCandidates: retentionSummary.candidates,
    retentionProtected: retentionSummary.protectedRecords,
    lastProviderBlockAt, lastSnapshotSkipAt, lastGuardBlockAt,
    recommendedAction,
    generatedAt: new Date().toISOString(),
  }
}

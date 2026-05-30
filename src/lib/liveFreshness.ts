/**
 * liveFreshness — data freshness metadata, stale detection, and critical mode
 * for live fixtures.
 * ─────────────────────────────────────────────────────────────────────────────
 * No mocks. No invented minutes. No fake clocks.
 */
import type { LiveFixture } from './apiClient'

// --- Types ----------------------------------------------------------------

export interface LiveFreshnessMeta {
  fetchedAt: number
  ageMs: number
  isStale: boolean
  staleReason?: string
  freshnessScore: number // 0-100
}

export interface StalenessResult {
  isStale: boolean
  reason?: string
  severity: 'low' | 'medium' | 'high'
}

// --- Critical Live Mode ---------------------------------------------------

/**
 * Determines if a fixture is in a critical live moment that warrants
 * faster polling and stricter freshness requirements.
 */
export function isCriticalLiveMoment(fixture: LiveFixture): boolean {
  const status = fixture.status.short?.toUpperCase() || ''
  const elapsed = fixture.status.elapsed || 0
  const isLive = ['LIVE', '1H', '2H', 'HT', 'ET', 'BT', 'P'].includes(status)

  if (!isLive) return false

  // Penalty shootout — always critical
  if (status === 'P') return true

  // Extra time or penalties break
  if (['ET', 'BT'].includes(status)) return true

  // Final phase (75'+)
  if (elapsed >= 75) return true

  // Tight score in second half
  const scoreDiff = Math.abs((fixture.score.home ?? 0) - (fixture.score.away ?? 0))
  if (elapsed >= 60 && scoreDiff <= 1) return true

  return false
}

/**
 * Get the recommended polling interval based on fixture state.
 */
export function getAdaptivePollingInterval(fixtures: LiveFixture[]): number {
  if (fixtures.length === 0) return 60_000

  const hasCritical = fixtures.some(isCriticalLiveMoment)
  const hasLive = fixtures.some(fx => {
    const s = fx.status.short?.toUpperCase() || ''
    return ['LIVE', '1H', '2H', 'HT', 'ET', 'BT', 'P'].includes(s)
  })

  if (hasCritical) return 10_000  // 10s for critical moments
  if (hasLive) return 15_000      // 15s for normal live
  return 45_000                    // 45s when no live matches
}

/**
 * Get polling interval for Match Detail page.
 */
export function getMatchDetailPollingInterval(fixture: LiveFixture): number {
  const status = fixture.status.short?.toUpperCase() || ''
  const isLive = ['LIVE', '1H', '2H', 'HT', 'ET', 'BT', 'P'].includes(status)

  if (!isLive) return 60_000

  // Penalty shootout — fastest possible
  if (status === 'P') return 5_000

  if (isCriticalLiveMoment(fixture)) return 8_000  // 8s for critical
  return 12_000  // 12s for normal live match detail
}

/**
 * Get polling interval for Command Center.
 */
export function getCommandCenterPollingInterval(fixtures: LiveFixture[], hasActivePatterns: boolean): number {
  if (fixtures.length === 0) return 60_000

  const hasCritical = fixtures.some(isCriticalLiveMoment)
  const hasLive = fixtures.some(fx => {
    const s = fx.status.short?.toUpperCase() || ''
    return ['LIVE', '1H', '2H', 'HT', 'ET', 'BT', 'P'].includes(s)
  })

  if (hasCritical && hasActivePatterns) return 12_000  // 12s critical + patterns
  if (hasLive) return 20_000                            // 20s normal live
  return 60_000                                         // 60s no live
}

// --- Stale Detection ------------------------------------------------------

/**
 * Detect if a live fixture's data appears stale.
 */
export function detectLiveStaleness(
  fixture: LiveFixture,
  previousFixture: LiveFixture | null,
  fetchedAt: number,
  now?: number,
): StalenessResult {
  const currentTime = now || Date.now()
  const age = currentTime - fetchedAt
  const status = fixture.status.short?.toUpperCase() || ''
  const isLive = ['LIVE', '1H', '2H', 'ET', 'BT', 'P'].includes(status)

  if (!isLive) return { isStale: false, severity: 'low' }

  // Data older than 45s in critical moment
  if (isCriticalLiveMoment(fixture) && age > 45_000) {
    return { isStale: true, reason: 'Dados atrasados em momento crítico', severity: 'high' }
  }

  // Data older than 60s for any live match
  if (age > 60_000) {
    return { isStale: true, reason: 'Última atualização há mais de 60s', severity: 'medium' }
  }

  // Minute hasn't changed across multiple fetches
  if (previousFixture && isLive) {
    const prevElapsed = previousFixture.status.elapsed || 0
    const currElapsed = fixture.status.elapsed || 0
    if (currElapsed === prevElapsed && currElapsed > 0 && age > 30_000) {
      return { isStale: true, reason: `Minuto travado em ${currElapsed}'`, severity: 'medium' }
    }
  }

  return { isStale: false, severity: 'low' }
}

// --- Freshness Score ------------------------------------------------------

/**
 * Calculate a freshness score (0-100) for a fixture.
 */
export function calculateFreshnessScore(fetchedAt: number, fixture: LiveFixture, now?: number): number {
  const currentTime = now || Date.now()
  const age = currentTime - fetchedAt
  const isLive = ['LIVE', '1H', '2H', 'HT', 'ET', 'BT', 'P'].includes(fixture.status.short?.toUpperCase() || '')

  if (!isLive) return 100 // Non-live fixtures are always "fresh enough"

  // For live matches: freshness degrades over time
  if (age <= 5_000) return 100
  if (age <= 15_000) return 90
  if (age <= 30_000) return 70
  if (age <= 45_000) return 50
  if (age <= 60_000) return 30
  return 10
}

// --- Race Condition Protection --------------------------------------------

/**
 * Determine if a new fixture update should be applied over the current one.
 * Prevents regression (newer fetch with older data overwriting fresher data).
 */
export function shouldApplyUpdate(
  current: LiveFixture,
  incoming: LiveFixture,
  currentFetchedAt: number,
  incomingFetchedAt: number,
): boolean {
  // Always apply if no current data
  if (!current) return true

  // Never regress status
  const statusScore = (fx: LiveFixture) => {
    const s = fx.status.short?.toUpperCase() || ''
    if (s === 'FT' || s === 'AET' || s === 'PEN') return 100
    if (s === 'ET' || s === 'BT' || s === 'P') return 90
    if (s === '2H' || s === 'LIVE') return 80
    if (s === 'HT') return 70
    if (s === '1H') return 60
    return 10
  }

  const currentStatus = statusScore(current)
  const incomingStatus = statusScore(incoming)

  // Incoming has more advanced status — always apply
  if (incomingStatus > currentStatus) return true

  // Incoming has less advanced status — never apply (regression)
  if (incomingStatus < currentStatus) return false

  // Same status: check minute
  const currentMin = current.status.elapsed || 0
  const incomingMin = incoming.status.elapsed || 0

  // Never regress minute
  if (incomingMin < currentMin) return false

  // Incoming has higher minute — apply
  if (incomingMin > currentMin) return true

  // Same minute: apply if incoming is newer fetch
  return incomingFetchedAt >= currentFetchedAt
}

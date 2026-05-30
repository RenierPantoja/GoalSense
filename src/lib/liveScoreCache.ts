/**
 * liveScoreCache — global in-memory cache for canonical live scores.
 * ─────────────────────────────────────────────────────────────────────────────
 * When Match Detail or Command Center discovers a goal via events before the
 * scoreboard updates, the canonical score is cached here. Other surfaces
 * (Live Radar, Matches Page) can then use the cached score instead of the
 * stale provider score.
 *
 * Cache is keyed by fixtureId (number) for fast lookup.
 * Entries expire after 5 minutes to avoid stale data from old sessions.
 *
 * No mocks. No invented data. Only caches scores derived from real events.
 */

import type { LiveFixture } from './apiClient'
import { buildCanonicalLiveScore, type CanonicalScore } from './canonicalLiveScore'

// --- Types ----------------------------------------------------------------

interface ScoreCacheEntry {
  home: number
  away: number
  source: CanonicalScore['source']
  updatedAt: number
}

// --- Cache ----------------------------------------------------------------

const cache = new Map<number, ScoreCacheEntry>()
const MAX_AGE_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Update the score cache for a fixture. Only updates if the new score
 * is equal or higher (never regresses).
 */
export function updateScoreCache(fixtureId: number, score: CanonicalScore): void {
  const existing = cache.get(fixtureId)
  const newTotal = score.home + score.away
  const existingTotal = existing ? existing.home + existing.away : -1

  if (newTotal >= existingTotal) {
    cache.set(fixtureId, {
      home: score.home,
      away: score.away,
      source: score.source,
      updatedAt: Date.now(),
    })
  }
}

/**
 * Get the cached canonical score for a fixture, if available and fresh.
 */
export function getCachedScore(fixtureId: number): ScoreCacheEntry | null {
  const entry = cache.get(fixtureId)
  if (!entry) return null
  if (Date.now() - entry.updatedAt > MAX_AGE_MS) {
    cache.delete(fixtureId)
    return null
  }
  return entry
}

/**
 * Reconcile a fixture's score with the cache. If the cache has a higher
 * score (from events), use it. Otherwise keep the provider score.
 * Mutates the fixture in place for efficiency.
 */
export function reconcileFixtureScore(fixture: LiveFixture): void {
  const cached = getCachedScore(fixture.id)
  if (!cached) return

  const providerTotal = (fixture.score.home ?? 0) + (fixture.score.away ?? 0)
  const cachedTotal = cached.home + cached.away

  if (cachedTotal > providerTotal) {
    fixture.score.home = cached.home
    fixture.score.away = cached.away
    fixture._scoreSource = `events_confirmed (was ${fixture.provider})`
  }
}

/**
 * Reconcile an array of fixtures with the score cache.
 * Call this after fetching live fixtures to ensure all surfaces
 * show the most up-to-date score.
 */
export function reconcileAllFixtureScores(fixtures: LiveFixture[]): void {
  for (const fx of fixtures) {
    reconcileFixtureScore(fx)
  }
}

/**
 * Feed the cache from goal events (used by Command Center stats fetch).
 * Only updates if events show a higher score than what's cached.
 */
export function feedScoreCacheFromEvents(
  fixtureId: number,
  providerHome: number,
  providerAway: number,
  goalEvents: Array<{ type: string; side: string; minute?: number; playerName?: string }>,
): void {
  if (goalEvents.length === 0) return
  const canonical = buildCanonicalLiveScore(providerHome, providerAway, goalEvents)
  updateScoreCache(fixtureId, canonical)
}

/**
 * Clear expired entries from the cache.
 */
export function clearExpiredScoreCache(): void {
  const now = Date.now()
  for (const [id, entry] of cache) {
    if (now - entry.updatedAt > MAX_AGE_MS) cache.delete(id)
  }
}

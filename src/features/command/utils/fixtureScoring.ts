/**
 * fixtureScoring — convert a LiveFixture into the shape expected by the
 * generic match importance scorer (`@/utils/matchImportance`).
 *
 * This helper used to live duplicated in three places (CommandCenterPage,
 * commandHelpers and autoDiscoveryEngine). Centralising it here keeps a single
 * source of truth and avoids accidental drift between callers.
 *
 * No React, no IO. Pure adapter.
 */
import type { LiveFixture } from '@/lib/apiClient'

export function toScoring(fx: LiveFixture) {
  return {
    competition: { name: fx.league.name },
    homeTeam: { name: fx.homeTeam.name, shortName: fx.homeTeam.name },
    awayTeam: { name: fx.awayTeam.name, shortName: fx.awayTeam.name },
    score: { fullTime: { home: fx.score.home, away: fx.score.away } },
    status: fx.status.short === 'LIVE' || fx.status.short === 'HT'
      ? 'IN_PLAY'
      : fx.status.short === 'FT'
        ? 'FINISHED'
        : 'TIMED',
    utcDate: fx.date,
    area: { name: fx.league.country },
  }
}

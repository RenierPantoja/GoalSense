/**
 * Cache key generators — canonical, normalized keys for all cached data.
 */

function normalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

export const cacheKeys = {
  teamId: (teamName: string) => `team_id:${normalize(teamName)}`,
  teamForm: (teamId: number, season: number) => `team_form:${teamId}:${season}`,
  teamFixtures: (teamId: number, season: number) => `team_fixtures:${teamId}:${season}`,
  h2h: (homeId: number, awayId: number) => `h2h:${Math.min(homeId, awayId)}:${Math.max(homeId, awayId)}`,
  fixtureEvents: (fixtureId: number) => `fx_events:${fixtureId}`,
  fixtureStats: (fixtureId: number) => `fx_stats:${fixtureId}`,
  injuries: (teamId: number, season: number) => `injuries:${teamId}:${season}`,
  topScorers: (leagueId: number, season: number) => `topscorers:${leagueId}:${season}`,
  players: (teamId: number, season: number) => `players:${teamId}:${season}`,
  prematchBasic: (homeName: string, awayName: string) => `prematch_basic:${normalize(homeName)}:${normalize(awayName)}`,
  prematchAdvanced: (homeName: string, awayName: string) => `prematch_adv:${normalize(homeName)}:${normalize(awayName)}`,
  knowledgeProfile: (teamId: number) => `knowledge:${teamId}`,
}

/**
 * Context key builder (Phase B13).
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic, accent-insensitive keys for aggregation buckets. Never emits a
 * key from an empty value; falls back to `unknown` only where that is useful.
 */

export function normalizeKeyPart(s: string | null | undefined): string {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

function part(value: string | null | undefined, allowUnknown: boolean): string | null {
  const n = normalizeKeyPart(value)
  if (n) return n
  return allowUnknown ? 'unknown' : null
}

export const contextKey = {
  pattern: (patternId: string) => `pattern:${normalizeKeyPart(patternId)}`,
  competition: (league: string) => `competition:${part(league, true)}`,
  team: (team: string) => `team:${normalizeKeyPart(team)}`,
  teamHome: (team: string) => `team_home:${normalizeKeyPart(team)}`,
  teamAway: (team: string) => `team_away:${normalizeKeyPart(team)}`,
  minuteWindow: (bucket: string) => `minute_window:${normalizeKeyPart(bucket)}`,
  competitionType: (type: string) => `competition_type:${part(type, true)}`,
  competitionStage: (stage: string) => `competition_stage:${part(stage, true)}`,
  importance: (level: string) => `importance:${part(level, true)}`,
  dataQuality: (quality: string) => `data_quality:${part(quality, true)}`,
  scoreState: (state: string) => `score_state:${part(state, true)}`,
  provider: (provider: string) => `provider:${part(provider, true)}`,
  patternCompetition: (patternId: string, league: string) => `pattern_competition:${normalizeKeyPart(patternId)}:${part(league, true)}`,
  patternTeam: (patternId: string, team: string) => `pattern_team:${normalizeKeyPart(patternId)}:${normalizeKeyPart(team)}`,
  patternMinute: (patternId: string, bucket: string) => `pattern_minute:${normalizeKeyPart(patternId)}:${normalizeKeyPart(bucket)}`,
  patternDataQuality: (patternId: string, quality: string) => `pattern_data_quality:${normalizeKeyPart(patternId)}:${part(quality, true)}`,
}

/** Coarse score-state label from a score pair. */
export function scoreStateLabel(score: { home: number; away: number } | null | undefined): string {
  if (!score) return 'unknown'
  const d = score.home - score.away
  if (d === 0) return 'tied'
  if (Math.abs(d) === 1) return d > 0 ? 'home_by_1' : 'away_by_1'
  return d > 0 ? 'home_by_2plus' : 'away_by_2plus'
}

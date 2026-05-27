/**
 * Pattern Evaluator — evaluates patterns against live fixtures with real data.
 * No mocks. No fake data. Only observable conditions.
 */
import type { LiveFixture } from '@/lib/apiClient'
import type { Pattern, PatternCondition, PatternHit, ConfidenceLevel, FixtureStatsForPattern } from '../types/commandTypes'
import { buildCanonicalMatchId } from '@/features/providers/canonicalMatchId'

interface EvalContext {
  fixture: LiveFixture
  stats?: FixtureStatsForPattern
  isFavoriteTeam: (name: string) => boolean
}

/**
 * Check if a fixture matches any of the given match identifiers.
 * Accepts canonicalMatchId, free-text "Home x Away", or substring of either team.
 */
function matchesFixture(fx: LiveFixture, items: string[]): boolean {
  const cmid = buildCanonicalMatchId(fx.homeTeam.name, fx.awayTeam.name, fx.date)
  const homeLower = fx.homeTeam.name.toLowerCase()
  const awayLower = fx.awayTeam.name.toLowerCase()
  const fixtureIdStr = String(fx.id)
  for (const raw of items) {
    if (!raw) continue
    if (raw === cmid) return true
    if (raw === fixtureIdStr) return true
    const f = raw.toLowerCase().trim()
    // free-text "Home x Away"
    if (f.includes(' x ') || f.includes(' vs ')) {
      const parts = f.split(/\s+(?:x|vs)\s+/i).map(p => p.trim()).filter(Boolean)
      if (parts.length === 2) {
        const [a, b] = parts
        if ((homeLower.includes(a) || a.includes(homeLower)) && (awayLower.includes(b) || b.includes(awayLower))) return true
        if ((homeLower.includes(b) || b.includes(homeLower)) && (awayLower.includes(a) || a.includes(awayLower))) return true
        continue
      }
    }
    // substring on either team — last resort
    if ((homeLower.includes(f) || f.includes(homeLower)) || (awayLower.includes(f) || f.includes(awayLower))) return true
  }
  return false
}

function evaluateCondition(condition: PatternCondition, ctx: EvalContext): boolean | null {
  const { fixture, stats, isFavoriteTeam } = ctx
  const elapsed = fixture.status.elapsed || 0
  const isLive = fixture.status.short === 'LIVE' || fixture.status.short === 'HT' || (fixture as any)._state === 'in'
  const homeScore = fixture.score.home ?? 0
  const awayScore = fixture.score.away ?? 0

  switch (condition.type) {
    case 'is_live':
      return isLive

    case 'is_final_phase':
      return isLive && elapsed >= 70

    case 'is_pre_live': {
      const diffMin = Math.round((new Date(fixture.date).getTime() - Date.now()) / 60000)
      const maxMin = (condition.params.minutes as number) || 60
      return !isLive && diffMin > 0 && diffMin <= maxMin
    }

    case 'minute_between': {
      const min = (condition.params.min as number) || 0
      const max = (condition.params.max as number) || 90
      return isLive && elapsed >= min && elapsed <= max
    }

    case 'score_tied':
      return homeScore === awayScore

    case 'score_diff_lte': {
      const maxDiff = (condition.params.maxDiff as number) ?? 1
      return Math.abs(homeScore - awayScore) <= maxDiff
    }

    case 'favorite_involved':
      return isFavoriteTeam(fixture.homeTeam.name) || isFavoriteTeam(fixture.awayTeam.name)

    case 'shots_recent_gte': {
      const threshold = (condition.params.value as number) || 3
      if (!stats?.shots) return null // data unavailable
      return (stats.shots.home + stats.shots.away) >= threshold
    }

    case 'shots_on_target_gte': {
      const threshold = (condition.params.value as number) || 4
      if (!stats?.shotsOnTarget) return null
      return (stats.shotsOnTarget.home + stats.shotsOnTarget.away) >= threshold
    }

    case 'corners_gte': {
      const threshold = (condition.params.value as number) || 6
      if (!stats?.corners) return null
      return (stats.corners.home + stats.corners.away) >= threshold
    }

    case 'cards_gte': {
      const threshold = (condition.params.value as number) || 3
      if (!stats?.yellowCards) return null
      return (stats.yellowCards.home + stats.yellowCards.away) >= threshold
    }

    case 'possession_gte': {
      const threshold = (condition.params.value as number) || 60
      if (!stats?.possession) return null
      return stats.possession.home >= threshold || stats.possession.away >= threshold
    }

    case 'goals_total_gte': {
      const threshold = (condition.params.value as number) || 3
      return (homeScore + awayScore) >= threshold
    }

    case 'goals_total_lte': {
      const threshold = (condition.params.value as number) || 1
      return (homeScore + awayScore) <= threshold
    }

    case 'away_shots_on_target_gte': {
      const threshold = (condition.params.value as number) || 3
      if (!stats?.shotsOnTarget) return null
      return stats.shotsOnTarget.away >= threshold
    }

    case 'away_goals_gte': {
      const threshold = (condition.params.value as number) || 1
      return awayScore >= threshold
    }

    case 'away_possession_gte': {
      const threshold = (condition.params.value as number) || 45
      if (!stats?.possession) return null
      return stats.possession.away >= threshold
    }

    // V3.14 — additional safe condition types ---------------------------------
    case 'home_shots_on_target_gte': {
      const threshold = (condition.params.value as number) || 3
      if (!stats?.shotsOnTarget) return null
      return stats.shotsOnTarget.home >= threshold
    }

    case 'home_goals_gte': {
      const threshold = (condition.params.value as number) || 1
      return homeScore >= threshold
    }

    case 'home_possession_gte': {
      const threshold = (condition.params.value as number) || 55
      if (!stats?.possession) return null
      return stats.possession.home >= threshold
    }

    case 'home_corners_gte': {
      const threshold = (condition.params.value as number) || 3
      if (!stats?.corners) return null
      return stats.corners.home >= threshold
    }

    case 'away_corners_gte': {
      const threshold = (condition.params.value as number) || 3
      if (!stats?.corners) return null
      return stats.corners.away >= threshold
    }

    case 'shots_total_gte': {
      const threshold = (condition.params.value as number) || 12
      if (!stats?.shots) return null
      return (stats.shots.home + stats.shots.away) >= threshold
    }

    case 'yellow_cards_gte': {
      const threshold = (condition.params.value as number) || 3
      if (!stats?.yellowCards) return null
      return (stats.yellowCards.home + stats.yellowCards.away) >= threshold
    }

    case 'red_cards_gte': {
      const threshold = (condition.params.value as number) || 1
      if (!stats?.redCards) return null
      return (stats.redCards.home + stats.redCards.away) >= threshold
    }

    default:
      return false
  }
}

export function evaluatePattern(
  pattern: Pattern,
  fixture: LiveFixture,
  stats: FixtureStatsForPattern | undefined,
  isFavoriteTeam: (name: string) => boolean
): PatternHit | null {
  if (pattern.status !== 'active') return null
  if (pattern.conditions.length === 0) return null

  // ── Scope check (legacy modes: favorites_only / specific_leagues / specific_teams / specific_matches) ──
  if (pattern.scope === 'favorites_only') {
    if (!isFavoriteTeam(fixture.homeTeam.name) && !isFavoriteTeam(fixture.awayTeam.name)) return null
  } else if (pattern.scope === 'specific_leagues' && pattern.scopeFilter && pattern.scopeFilter.length > 0) {
    const leagueLower = fixture.league.name.toLowerCase()
    const matches = pattern.scopeFilter.some(f => leagueLower.includes(f.toLowerCase()) || f.toLowerCase().includes(leagueLower))
    if (!matches) return null
  } else if (pattern.scope === 'specific_teams' && pattern.scopeFilter && pattern.scopeFilter.length > 0) {
    const homeLower = fixture.homeTeam.name.toLowerCase()
    const awayLower = fixture.awayTeam.name.toLowerCase()
    const matches = pattern.scopeFilter.some(f => { const fl = f.toLowerCase(); return homeLower.includes(fl) || fl.includes(homeLower) || awayLower.includes(fl) || fl.includes(awayLower) })
    if (!matches) return null
  } else if (pattern.scope === 'specific_matches' && pattern.matches && pattern.matches.length > 0) {
    if (!matchesFixture(fixture, pattern.matches)) return null
  }

  // ── Match include/exclude (additive — works alongside any scope mode) ──
  if (pattern.matches && pattern.matches.length > 0 && pattern.scope !== 'specific_matches') {
    if (!matchesFixture(fixture, pattern.matches)) return null
  }
  if (pattern.excludeMatches && pattern.excludeMatches.length > 0) {
    if (matchesFixture(fixture, pattern.excludeMatches)) return null
  }

  // ── Advanced exclusion filters (additive, backward compatible) ──
  if (pattern.excludeLeagues && pattern.excludeLeagues.length > 0) {
    const leagueLower = fixture.league.name.toLowerCase()
    const excluded = pattern.excludeLeagues.some(f => leagueLower.includes(f.toLowerCase()) || f.toLowerCase().includes(leagueLower))
    if (excluded) return null
  }
  if (pattern.excludeTeams && pattern.excludeTeams.length > 0) {
    const homeLower = fixture.homeTeam.name.toLowerCase()
    const awayLower = fixture.awayTeam.name.toLowerCase()
    const excluded = pattern.excludeTeams.some(f => { const fl = f.toLowerCase(); return homeLower.includes(fl) || fl.includes(homeLower) || awayLower.includes(fl) || fl.includes(awayLower) })
    if (excluded) return null
  }

  // ── State filters ──
  const isLive = fixture.status.short === 'LIVE' || fixture.status.short === 'HT' || fixture.status.short === '1H' || fixture.status.short === '2H'
  const isScheduled = fixture.status.short === 'NS' || fixture.status.short === 'TBD'
  if (pattern.onlyLive && !isLive) return null
  if (pattern.onlyPreMatch && !isScheduled) return null

  // ── Rich data filter (only matches with stats from a rich provider) ──
  if (pattern.requireRichData) {
    const hasStats = !!stats && (stats.shots !== undefined || stats.shotsOnTarget !== undefined || stats.possession !== undefined)
    const isRichProvider = fixture.provider === 'espn'
    if (!hasStats && !isRichProvider) return null
  }

  const ctx: EvalContext = { fixture, stats, isFavoriteTeam }
  const results = pattern.conditions.map(c => ({ condition: c, result: evaluateCondition(c, ctx) }))

  const matched = results.filter(r => r.result === true).length
  const unavailable = results.filter(r => r.result === null).length
  const total = results.length

  // Need at least 60% of evaluable conditions to match
  const evaluable = total - unavailable
  if (evaluable === 0) return null
  const threshold = Math.ceil(evaluable * 0.6)
  if (matched < threshold) return null

  // Confidence: based on matched ratio, penalized by unavailable data
  const baseConfidence = Math.round((matched / total) * 100)
  const unavailablePenalty = unavailable * 8
  const confidence = Math.max(30, Math.min(99, baseConfidence - unavailablePenalty + (stats ? 5 : 0)))

  if (confidence < pattern.minConfidence) return null

  const confidenceLevel: ConfidenceLevel = confidence >= 75 ? 'alta' : confidence >= 50 ? 'média' : 'baixa'
  const reasons = results.filter(r => r.result === true).map(r => conditionToReason(r.condition, ctx))

  return {
    patternId: pattern.id,
    patternName: pattern.name,
    fixtureId: fixture.id,
    fixture,
    confidence,
    confidenceLevel,
    severity: pattern.severity,
    reasons,
    matchedConditions: matched,
    totalConditions: total,
    timestamp: new Date().toISOString(),
  }
}

export function evaluateAllPatterns(
  patterns: Pattern[],
  fixtures: LiveFixture[],
  statsMap: Map<number, FixtureStatsForPattern>,
  isFavoriteTeam: (name: string) => boolean
): PatternHit[] {
  const hits: PatternHit[] = []
  const active = patterns.filter(p => p.status === 'active')

  for (const pattern of active) {
    for (const fixture of fixtures) {
      const stats = statsMap.get(fixture.id)
      const hit = evaluatePattern(pattern, fixture, stats, isFavoriteTeam)
      if (hit) hits.push(hit)
    }
  }

  return hits.sort((a, b) => {
    const sevOrder = { critical: 3, attention: 2, info: 1 }
    const sevDiff = sevOrder[b.severity] - sevOrder[a.severity]
    if (sevDiff !== 0) return sevDiff
    return b.confidence - a.confidence
  })
}

function conditionToReason(condition: PatternCondition, ctx: EvalContext): string {
  const { fixture, stats } = ctx
  const elapsed = fixture.status.elapsed || 0

  switch (condition.type) {
    case 'is_live': return 'Ao vivo'
    case 'is_final_phase': return `Reta final (${elapsed}')`
    case 'is_pre_live': return 'Começa em breve'
    case 'minute_between': return `Minuto ${elapsed}'`
    case 'score_tied': return `Empatado ${fixture.score.home}-${fixture.score.away}`
    case 'score_diff_lte': return `Placar curto (${fixture.score.home}-${fixture.score.away})`
    case 'favorite_involved': return 'Favorito envolvido'
    case 'shots_recent_gte': return `${stats?.shots ? stats.shots.home + stats.shots.away : '?'} finalizações`
    case 'shots_on_target_gte': return `${stats?.shotsOnTarget ? stats.shotsOnTarget.home + stats.shotsOnTarget.away : '?'} no alvo`
    case 'corners_gte': return `${stats?.corners ? stats.corners.home + stats.corners.away : '?'} escanteios`
    case 'cards_gte': return `${stats?.yellowCards ? stats.yellowCards.home + stats.yellowCards.away : '?'} cartões`
    case 'possession_gte': return `Posse ${stats?.possession ? Math.max(stats.possession.home, stats.possession.away).toFixed(0) : '?'}%`
    case 'goals_total_gte': return `${(fixture.score.home ?? 0) + (fixture.score.away ?? 0)} gols`
    case 'goals_total_lte': return `Poucos gols (${(fixture.score.home ?? 0) + (fixture.score.away ?? 0)})`
    case 'away_shots_on_target_gte': return `Visitante: ${stats?.shotsOnTarget?.away ?? '?'} no alvo`
    case 'away_goals_gte': return `Visitante marcou ${fixture.score.away ?? 0}`
    case 'away_possession_gte': return `Visitante: ${stats?.possession?.away?.toFixed(0) ?? '?'}% posse`
    case 'home_shots_on_target_gte': return `Mandante: ${stats?.shotsOnTarget?.home ?? '?'} no alvo`
    case 'home_goals_gte': return `Mandante marcou ${fixture.score.home ?? 0}`
    case 'home_possession_gte': return `Mandante: ${stats?.possession?.home?.toFixed(0) ?? '?'}% posse`
    case 'home_corners_gte': return `Mandante: ${stats?.corners?.home ?? '?'} escanteios`
    case 'away_corners_gte': return `Visitante: ${stats?.corners?.away ?? '?'} escanteios`
    case 'shots_total_gte': return `${stats?.shots ? stats.shots.home + stats.shots.away : '?'} finalizações totais`
    case 'yellow_cards_gte': return `${stats?.yellowCards ? stats.yellowCards.home + stats.yellowCards.away : '?'} amarelos`
    case 'red_cards_gte': return `${stats?.redCards ? stats.redCards.home + stats.redCards.away : '?'} vermelhos`
    default: return ''
  }
}

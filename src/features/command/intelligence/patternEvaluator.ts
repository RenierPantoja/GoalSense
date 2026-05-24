/**
 * Pattern Evaluator — evaluates patterns against live fixtures with real data.
 * No mocks. No fake data. Only observable conditions.
 */
import type { LiveFixture } from '@/lib/apiClient'
import type { Pattern, PatternCondition, PatternHit, ConfidenceLevel, FixtureStatsForPattern } from '../types/commandTypes'

interface EvalContext {
  fixture: LiveFixture
  stats?: FixtureStatsForPattern
  isFavoriteTeam: (name: string) => boolean
}

/**
 * Evaluate a single condition against a fixture.
 * Returns true if the condition is met, false otherwise.
 */
function evaluateCondition(condition: PatternCondition, ctx: EvalContext): boolean {
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
      if (!stats?.shots) return false
      const totalShots = (stats.shots.home || 0) + (stats.shots.away || 0)
      return totalShots >= threshold
    }

    case 'shots_on_target_gte': {
      const threshold = (condition.params.value as number) || 4
      if (!stats?.shotsOnTarget) return false
      const total = (stats.shotsOnTarget.home || 0) + (stats.shotsOnTarget.away || 0)
      return total >= threshold
    }

    case 'corners_gte': {
      const threshold = (condition.params.value as number) || 6
      if (!stats?.corners) return false
      const total = (stats.corners.home || 0) + (stats.corners.away || 0)
      return total >= threshold
    }

    case 'cards_gte': {
      const threshold = (condition.params.value as number) || 3
      if (!stats?.yellowCards) return false
      const total = (stats.yellowCards.home || 0) + (stats.yellowCards.away || 0)
      return total >= threshold
    }

    case 'possession_gte': {
      const threshold = (condition.params.value as number) || 60
      if (!stats?.possession) return false
      return stats.possession.home >= threshold || stats.possession.away >= threshold
    }

    case 'goals_total_gte': {
      const threshold = (condition.params.value as number) || 3
      return (homeScore + awayScore) >= threshold
    }

    default:
      return false
  }
}

/**
 * Evaluate a pattern against a fixture. Returns a PatternHit if enough conditions match.
 */
export function evaluatePattern(
  pattern: Pattern,
  fixture: LiveFixture,
  stats: FixtureStatsForPattern | undefined,
  isFavoriteTeam: (name: string) => boolean
): PatternHit | null {
  if (pattern.status !== 'active') return null
  if (pattern.conditions.length === 0) return null

  const ctx: EvalContext = { fixture, stats, isFavoriteTeam }
  const results = pattern.conditions.map(c => ({
    condition: c,
    matched: evaluateCondition(c, ctx),
  }))

  const matchedCount = results.filter(r => r.matched).length
  const totalCount = results.length

  // Need at least 60% of conditions to match (minimum 2 out of 3, 3 out of 4, etc.)
  const threshold = Math.ceil(totalCount * 0.6)
  if (matchedCount < threshold) return null

  // Calculate confidence based on how many conditions matched
  const rawConfidence = Math.round((matchedCount / totalCount) * 100)
  // Boost confidence if stats are available
  const hasStats = Boolean(stats && ((stats.shots?.home ?? 0) > 0 || (stats.possession?.home ?? 0) > 0))
  const confidence = hasStats ? Math.min(rawConfidence + 10, 99) : Math.max(rawConfidence - 10, 30)

  const confidenceLevel: ConfidenceLevel = confidence >= 75 ? 'alta' : confidence >= 50 ? 'média' : 'baixa'

  const reasons = results
    .filter(r => r.matched)
    .map(r => conditionToReason(r.condition, ctx))

  return {
    patternId: pattern.id,
    patternName: pattern.name,
    fixtureId: fixture.id,
    fixture,
    confidence,
    confidenceLevel,
    severity: pattern.severity,
    reasons,
    matchedConditions: matchedCount,
    totalConditions: totalCount,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Evaluate all active patterns against all fixtures.
 */
export function evaluateAllPatterns(
  patterns: Pattern[],
  fixtures: LiveFixture[],
  statsMap: Map<number, FixtureStatsForPattern>,
  isFavoriteTeam: (name: string) => boolean
): PatternHit[] {
  const hits: PatternHit[] = []
  const activePatterns = patterns.filter(p => p.status === 'active')

  for (const pattern of activePatterns) {
    for (const fixture of fixtures) {
      const stats = statsMap.get(fixture.id)
      const hit = evaluatePattern(pattern, fixture, stats, isFavoriteTeam)
      if (hit) hits.push(hit)
    }
  }

  // Sort by confidence descending, then severity
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
    case 'is_live': return 'Jogo ao vivo'
    case 'is_final_phase': return `Reta final (${elapsed}')`
    case 'is_pre_live': return 'Começa em breve'
    case 'minute_between': return `Minuto ${elapsed}'`
    case 'score_tied': return `Placar empatado ${fixture.score.home}-${fixture.score.away}`
    case 'score_diff_lte': return `Placar apertado (${fixture.score.home}-${fixture.score.away})`
    case 'favorite_involved': return 'Favorito envolvido'
    case 'shots_recent_gte': {
      const total = stats?.shots ? (stats.shots.home + stats.shots.away) : 0
      return `${total} finalizações`
    }
    case 'shots_on_target_gte': {
      const total = stats?.shotsOnTarget ? (stats.shotsOnTarget.home + stats.shotsOnTarget.away) : 0
      return `${total} no alvo`
    }
    case 'corners_gte': {
      const total = stats?.corners ? (stats.corners.home + stats.corners.away) : 0
      return `${total} escanteios`
    }
    case 'cards_gte': return 'Jogo físico'
    case 'possession_gte': {
      const max = stats?.possession ? Math.max(stats.possession.home, stats.possession.away) : 0
      return `Posse ${max.toFixed(0)}%`
    }
    case 'goals_total_gte': return `${(fixture.score.home ?? 0) + (fixture.score.away ?? 0)} gols`
    default: return ''
  }
}

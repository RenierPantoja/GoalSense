/**
 * Auto-Discovery Engine — analyzes live fixtures and suggests insights.
 * No mocks. Only observable patterns from real data.
 */
import type { LiveFixture } from '@/lib/apiClient'
import type { FixtureStatsForPattern } from '../types/commandTypes'
import { getMatchImportanceScore } from '@/utils/matchImportance'

export interface AutoDiscovery {
  id: string
  type: 'pressure' | 'final_phase' | 'favorite_risk' | 'global_live' | 'starting_soon' | 'rich_data' | 'open_game' | 'dominance'
  insight: string
  evidence: string
  confidence: number
  fixtureId: number
  fixture: LiveFixture
}

function toScoring(fx: LiveFixture) {
  return { competition: { name: fx.league.name }, homeTeam: { name: fx.homeTeam.name, shortName: fx.homeTeam.name }, awayTeam: { name: fx.awayTeam.name, shortName: fx.awayTeam.name }, score: { fullTime: { home: fx.score.home, away: fx.score.away } }, status: fx.status.short === 'LIVE' || fx.status.short === 'HT' ? 'IN_PLAY' : fx.status.short === 'FT' ? 'FINISHED' : 'TIMED', utcDate: fx.date, area: { name: fx.league.country } }
}

export function runAutoDiscovery(
  fixtures: LiveFixture[],
  statsMap: Map<number, FixtureStatsForPattern>,
  isFavoriteTeam: (name: string) => boolean
): AutoDiscovery[] {
  const discoveries: AutoDiscovery[] = []
  const isLive = (fx: LiveFixture) => fx.status.short === 'LIVE' || fx.status.short === 'HT' || (fx as any)._state === 'in'

  for (const fx of fixtures) {
    const stats = statsMap.get(fx.id)
    const elapsed = fx.status.elapsed || 0
    const homeScore = fx.score.home ?? 0
    const awayScore = fx.score.away ?? 0
    const scoreDiff = Math.abs(homeScore - awayScore)
    const imp = getMatchImportanceScore(toScoring(fx))

    if (!isLive(fx)) {
      // Starting soon
      const diffMin = Math.round((new Date(fx.date).getTime() - Date.now()) / 60000)
      if (diffMin > 0 && diffMin <= 30 && imp >= 80) {
        discoveries.push({
          id: `soon-${fx.id}`,
          type: 'starting_soon',
          insight: `${fx.homeTeam.name} x ${fx.awayTeam.name} começa em ${diffMin} min`,
          evidence: `Relevância ${imp} · ${fx.league.name}`,
          confidence: 60,
          fixtureId: fx.id,
          fixture: fx,
        })
      }
      continue
    }

    // Final phase with tight score
    if (elapsed >= 75 && scoreDiff <= 1) {
      discoveries.push({
        id: `final-${fx.id}`,
        type: 'final_phase',
        insight: `Reta final apertada: ${fx.homeTeam.name} ${homeScore}-${awayScore} ${fx.awayTeam.name}`,
        evidence: `${elapsed}' · Diferença de ${scoreDiff} gol${scoreDiff !== 1 ? 's' : ''}`,
        confidence: 80,
        fixtureId: fx.id,
        fixture: fx,
      })
    }

    // Pressure (high shots on target, tight score)
    if (stats?.shotsOnTarget) {
      const totalSOT = stats.shotsOnTarget.home + stats.shotsOnTarget.away
      if (totalSOT >= 6 && scoreDiff <= 1 && elapsed >= 50) {
        discoveries.push({
          id: `pressure-${fx.id}`,
          type: 'pressure',
          insight: `Pressão crescente: ${totalSOT} finalizações no alvo`,
          evidence: `${fx.homeTeam.name} ${homeScore}-${awayScore} ${fx.awayTeam.name} · ${elapsed}'`,
          confidence: 72,
          fixtureId: fx.id,
          fixture: fx,
        })
      }
    }

    // Favorite at risk
    const isFav = isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name)
    if (isFav && (homeScore === awayScore || (isFavoriteTeam(fx.homeTeam.name) && homeScore < awayScore) || (isFavoriteTeam(fx.awayTeam.name) && awayScore < homeScore))) {
      if (elapsed >= 45) {
        discoveries.push({
          id: `favrisk-${fx.id}`,
          type: 'favorite_risk',
          insight: `Favorito em risco: ${fx.homeTeam.name} ${homeScore}-${awayScore} ${fx.awayTeam.name}`,
          evidence: `${elapsed}' · Favorito não lidera`,
          confidence: 65,
          fixtureId: fx.id,
          fixture: fx,
        })
      }
    }

    // Global live (high importance)
    if (imp >= 100 && elapsed >= 10 && elapsed <= 60) {
      discoveries.push({
        id: `global-${fx.id}`,
        type: 'global_live',
        insight: `Jogo global ao vivo: ${fx.homeTeam.name} x ${fx.awayTeam.name}`,
        evidence: `Relevância ${imp} · ${fx.league.name} · ${elapsed}'`,
        confidence: 70,
        fixtureId: fx.id,
        fixture: fx,
      })
    }

    // Rich data available
    if (stats && stats.shots && stats.possession && (stats.shots.home + stats.shots.away) > 0) {
      const totalShots = stats.shots.home + stats.shots.away
      if (totalShots >= 15) {
        discoveries.push({
          id: `rich-${fx.id}`,
          type: 'rich_data',
          insight: `Dados ricos: ${totalShots} finalizações registradas`,
          evidence: `Posse ${stats.possession.home.toFixed(0)}%-${stats.possession.away.toFixed(0)}% · ${fx.homeTeam.name} x ${fx.awayTeam.name}`,
          confidence: 55,
          fixtureId: fx.id,
          fixture: fx,
        })
      }
    }

    // Open game (many goals)
    if ((homeScore + awayScore) >= 4 && elapsed <= 80) {
      discoveries.push({
        id: `open-${fx.id}`,
        type: 'open_game',
        insight: `Jogo aberto: ${homeScore + awayScore} gols em ${elapsed}'`,
        evidence: `${fx.homeTeam.name} ${homeScore}-${awayScore} ${fx.awayTeam.name}`,
        confidence: 68,
        fixtureId: fx.id,
        fixture: fx,
      })
    }

    // Dominance without result
    if (stats?.possession && stats?.shotsOnTarget) {
      const maxPoss = Math.max(stats.possession.home, stats.possession.away)
      const dominantIsHome = stats.possession.home > stats.possession.away
      const dominantScore = dominantIsHome ? homeScore : awayScore
      const otherScore = dominantIsHome ? awayScore : homeScore
      if (maxPoss >= 62 && (stats.shotsOnTarget.home + stats.shotsOnTarget.away) >= 5 && dominantScore <= otherScore) {
        discoveries.push({
          id: `dom-${fx.id}`,
          type: 'dominance',
          insight: `Domínio sem resultado: ${maxPoss.toFixed(0)}% posse sem vantagem`,
          evidence: `${fx.homeTeam.name} ${homeScore}-${awayScore} ${fx.awayTeam.name} · ${elapsed}'`,
          confidence: 62,
          fixtureId: fx.id,
          fixture: fx,
        })
      }
    }
  }

  // Sort by confidence, deduplicate by fixture (keep highest)
  const seen = new Set<number>()
  return discoveries
    .sort((a, b) => b.confidence - a.confidence)
    .filter(d => {
      if (seen.has(d.fixtureId)) return false
      seen.add(d.fixtureId)
      return true
    })
    .slice(0, 8)
}
